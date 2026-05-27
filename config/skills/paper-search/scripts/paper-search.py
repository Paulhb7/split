#!/usr/bin/env python3
"""Paper search across arXiv, OpenAlex, Crossref, Semantic Scholar — stdlib only.

Actions: search, lookup, citations, references, oa-pdf.
See ../SKILL.md for the full interface.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

OPENALEX_BASE = "https://api.openalex.org"
CROSSREF_BASE = "https://api.crossref.org"
S2_BASE = "https://api.semanticscholar.org/graph/v1"
ARXIV_BASE = "http://export.arxiv.org/api/query"

USER_AGENT = "split-paper-search/1.0 (https://github.com/anthropics/split)"

# ---------- HTTP ----------

def _get(url: str, headers: dict[str, str] | None = None, timeout: int = 30) -> str:
    h = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def _json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    return json.loads(_get(url, headers=headers))


# ---------- ID detection ----------

_DOI_RE = re.compile(r"^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$", re.I)
_ARXIV_NEW = re.compile(r"^\d{4}\.\d{4,5}(v\d+)?$")
_ARXIV_OLD = re.compile(r"^[a-z\-]+(\.[A-Z]{2})?/\d{7}(v\d+)?$")
_OPENALEX_RE = re.compile(r"^W\d+$")


def detect_id(raw: str) -> tuple[str, str]:
    """Return (kind, normalized_id). kind ∈ {doi, arxiv, openalex}."""
    s = raw.strip()
    if s.lower().startswith("arxiv:"):
        s = s[6:]
        return ("arxiv", s)
    if s.lower().startswith("doi:"):
        s = s[4:]
    if _DOI_RE.match(s):
        return ("doi", s)
    if _ARXIV_NEW.match(s) or _ARXIV_OLD.match(s):
        return ("arxiv", s)
    if _OPENALEX_RE.match(s):
        return ("openalex", s)
    # last resort: assume DOI-ish
    return ("doi", s)


# ---------- arXiv ----------

ATOM = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"


def _arxiv_parse_entry(e: ET.Element) -> dict[str, Any]:
    arxiv_url = e.findtext(f"{ATOM}id", "").strip()
    arxiv_id = arxiv_url.rsplit("/abs/", 1)[-1] if "/abs/" in arxiv_url else arxiv_url
    arxiv_id = re.sub(r"v\d+$", "", arxiv_id)
    pdf_url = ""
    for link in e.findall(f"{ATOM}link"):
        if link.attrib.get("title") == "pdf":
            pdf_url = link.attrib.get("href", "")
    authors = [a.findtext(f"{ATOM}name", "").strip() for a in e.findall(f"{ATOM}author")]
    published = e.findtext(f"{ATOM}published", "")
    year = int(published[:4]) if published[:4].isdigit() else None
    primary_cat = ""
    pc = e.find(f"{ARXIV_NS}primary_category")
    if pc is not None:
        primary_cat = pc.attrib.get("term", "")
    doi = (e.findtext(f"{ARXIV_NS}doi") or "").strip() or f"10.48550/arXiv.{arxiv_id}"
    return {
        "id": doi,
        "doi": doi,
        "arxiv_id": arxiv_id,
        "title": " ".join((e.findtext(f"{ATOM}title", "") or "").split()),
        "authors": authors,
        "year": year,
        "venue": primary_cat or "arXiv",
        "abstract": " ".join((e.findtext(f"{ATOM}summary", "") or "").split()),
        "citation_count": None,
        "url": arxiv_url,
        "pdf_url": pdf_url or f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        "source": "arxiv",
    }


def arxiv_search(query: str, max_results: int) -> list[dict[str, Any]]:
    params = {
        "search_query": f"all:{query}",
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    url = f"{ARXIV_BASE}?{urllib.parse.urlencode(params)}"
    xml = _get(url, headers={"Accept": "application/atom+xml"})
    root = ET.fromstring(xml)
    return [_arxiv_parse_entry(e) for e in root.findall(f"{ATOM}entry")]


def arxiv_lookup(arxiv_id: str) -> dict[str, Any] | None:
    params = {"id_list": arxiv_id, "max_results": 1}
    url = f"{ARXIV_BASE}?{urllib.parse.urlencode(params)}"
    xml = _get(url, headers={"Accept": "application/atom+xml"})
    root = ET.fromstring(xml)
    entry = root.find(f"{ATOM}entry")
    return _arxiv_parse_entry(entry) if entry is not None else None


# ---------- OpenAlex ----------

def _openalex_mailto() -> str:
    return os.environ.get("OPENALEX_MAILTO", "")


def _openalex_normalize(w: dict[str, Any]) -> dict[str, Any]:
    doi = (w.get("doi") or "").replace("https://doi.org/", "")
    auths = [a.get("author", {}).get("display_name", "") for a in (w.get("authorships") or [])]
    pdf = ""
    oa = w.get("open_access") or {}
    if oa.get("oa_url"):
        pdf = oa["oa_url"]
    best = w.get("best_oa_location") or {}
    if not pdf and best.get("pdf_url"):
        pdf = best["pdf_url"]
    venue = ""
    primary = w.get("primary_location") or {}
    src = primary.get("source") or {}
    venue = src.get("display_name") or ""
    abstract = ""
    inv = w.get("abstract_inverted_index")
    if inv:
        # invert the inverted index
        positions: list[tuple[int, str]] = []
        for word, idxs in inv.items():
            for i in idxs:
                positions.append((i, word))
        positions.sort()
        abstract = " ".join(w for _, w in positions)
    return {
        "id": w.get("id", "").replace("https://openalex.org/", ""),
        "doi": doi,
        "arxiv_id": None,
        "title": w.get("title") or w.get("display_name") or "",
        "authors": auths,
        "year": w.get("publication_year"),
        "venue": venue,
        "abstract": abstract,
        "citation_count": w.get("cited_by_count"),
        "url": w.get("id", ""),
        "pdf_url": pdf,
        "source": "openalex",
    }


def openalex_search(query: str, max_results: int, year_from: int | None, year_to: int | None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"search": query, "per-page": min(max_results, 200)}
    if year_from or year_to:
        lo = year_from or 1900
        hi = year_to or 2100
        params["filter"] = f"from_publication_date:{lo}-01-01,to_publication_date:{hi}-12-31"
    mt = _openalex_mailto()
    if mt:
        params["mailto"] = mt
    url = f"{OPENALEX_BASE}/works?{urllib.parse.urlencode(params)}"
    data = _json(url)
    return [_openalex_normalize(w) for w in data.get("results", [])][:max_results]


def openalex_lookup(ident: str, kind: str) -> dict[str, Any] | None:
    if kind == "doi":
        url = f"{OPENALEX_BASE}/works/https://doi.org/{ident}"
    elif kind == "openalex":
        url = f"{OPENALEX_BASE}/works/{ident}"
    elif kind == "arxiv":
        # OpenAlex indexes arxiv via DOI 10.48550/arXiv.<id>
        url = f"{OPENALEX_BASE}/works/https://doi.org/10.48550/arXiv.{ident}"
    else:
        return None
    try:
        return _openalex_normalize(_json(url))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def openalex_citations(work_id: str, max_results: int) -> list[dict[str, Any]]:
    if not work_id.startswith("W"):
        w = openalex_lookup(work_id, detect_id(work_id)[0])
        if not w:
            return []
        work_id = w["id"]
    params = {"filter": f"cites:{work_id}", "per-page": min(max_results, 200)}
    mt = _openalex_mailto()
    if mt:
        params["mailto"] = mt
    url = f"{OPENALEX_BASE}/works?{urllib.parse.urlencode(params)}"
    data = _json(url)
    return [_openalex_normalize(w) for w in data.get("results", [])][:max_results]


def openalex_references(work_id: str, max_results: int) -> list[dict[str, Any]]:
    if not work_id.startswith("W"):
        w = openalex_lookup(work_id, detect_id(work_id)[0])
        if not w:
            return []
        work_id = w["id"]
    url = f"{OPENALEX_BASE}/works/{work_id}"
    mt = _openalex_mailto()
    if mt:
        url += f"?mailto={mt}"
    data = _json(url)
    refs = (data.get("referenced_works") or [])[:max_results]
    out: list[dict[str, Any]] = []
    for r in refs:
        rid = r.replace("https://openalex.org/", "")
        try:
            out.append(_openalex_normalize(_json(f"{OPENALEX_BASE}/works/{rid}")))
        except Exception:
            continue
    return out


# ---------- Crossref ----------

def _crossref_mailto() -> str:
    return os.environ.get("CROSSREF_MAILTO", "")


def _crossref_normalize(it: dict[str, Any]) -> dict[str, Any]:
    authors = []
    for a in it.get("author", []) or []:
        name = " ".join(filter(None, [a.get("given"), a.get("family")])) or a.get("name", "")
        if name:
            authors.append(name)
    year = None
    for k in ("published-print", "published-online", "issued"):
        parts = (it.get(k) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            year = parts[0][0]
            break
    title = (it.get("title") or [""])[0]
    container = (it.get("container-title") or [""])[0]
    doi = it.get("DOI", "")
    return {
        "id": doi,
        "doi": doi,
        "arxiv_id": None,
        "title": title,
        "authors": authors,
        "year": year,
        "venue": container,
        "abstract": (it.get("abstract") or "").replace("<jats:p>", "").replace("</jats:p>", ""),
        "citation_count": it.get("is-referenced-by-count"),
        "url": it.get("URL", ""),
        "pdf_url": "",
        "source": "crossref",
    }


def crossref_search(query: str, max_results: int, year_from: int | None, year_to: int | None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"query": query, "rows": min(max_results, 100)}
    filt = []
    if year_from:
        filt.append(f"from-pub-date:{year_from}-01-01")
    if year_to:
        filt.append(f"until-pub-date:{year_to}-12-31")
    if filt:
        params["filter"] = ",".join(filt)
    mt = _crossref_mailto()
    if mt:
        params["mailto"] = mt
    url = f"{CROSSREF_BASE}/works?{urllib.parse.urlencode(params)}"
    data = _json(url)
    return [_crossref_normalize(it) for it in data.get("message", {}).get("items", [])][:max_results]


def crossref_lookup(doi: str) -> dict[str, Any] | None:
    url = f"{CROSSREF_BASE}/works/{urllib.parse.quote(doi, safe='')}"
    try:
        data = _json(url)
        return _crossref_normalize(data.get("message", {}))
    except urllib.error.HTTPError:
        return None


# ---------- Semantic Scholar ----------

def _s2_headers() -> dict[str, str]:
    k = os.environ.get("S2_API_KEY")
    return {"x-api-key": k} if k else {}


_S2_FIELDS = "title,authors,year,venue,abstract,citationCount,externalIds,openAccessPdf,url"


def _s2_normalize(p: dict[str, Any]) -> dict[str, Any]:
    ext = p.get("externalIds") or {}
    doi = ext.get("DOI") or ""
    arxiv_id = ext.get("ArXiv")
    authors = [a.get("name", "") for a in (p.get("authors") or [])]
    pdf = ((p.get("openAccessPdf") or {}).get("url")) or ""
    return {
        "id": doi or p.get("paperId", ""),
        "doi": doi,
        "arxiv_id": arxiv_id,
        "title": p.get("title", ""),
        "authors": authors,
        "year": p.get("year"),
        "venue": p.get("venue", ""),
        "abstract": p.get("abstract") or "",
        "citation_count": p.get("citationCount"),
        "url": p.get("url", ""),
        "pdf_url": pdf,
        "source": "s2",
    }


def s2_search(query: str, max_results: int, year_from: int | None, year_to: int | None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"query": query, "limit": min(max_results, 100), "fields": _S2_FIELDS}
    if year_from or year_to:
        lo = year_from or 1900
        hi = year_to or 2100
        params["year"] = f"{lo}-{hi}"
    url = f"{S2_BASE}/paper/search?{urllib.parse.urlencode(params)}"
    data = _json(url, headers=_s2_headers())
    return [_s2_normalize(p) for p in data.get("data", [])][:max_results]


def _s2_paper_path(ident: str, kind: str) -> str:
    if kind == "doi":
        return f"DOI:{ident}"
    if kind == "arxiv":
        return f"arXiv:{ident}"
    return ident


def s2_lookup(ident: str, kind: str) -> dict[str, Any] | None:
    path = _s2_paper_path(ident, kind)
    url = f"{S2_BASE}/paper/{urllib.parse.quote(path, safe=':/')}?fields={_S2_FIELDS}"
    try:
        return _s2_normalize(_json(url, headers=_s2_headers()))
    except urllib.error.HTTPError:
        return None


# ---------- Action dispatch ----------

def cmd_search(args: argparse.Namespace) -> list[dict[str, Any]]:
    sources = ["arxiv", "openalex", "crossref", "s2"] if args.source == "all" else [args.source]
    out: list[dict[str, Any]] = []
    for s in sources:
        try:
            if s == "arxiv":
                out += arxiv_search(args.query, args.max)
            elif s == "openalex":
                out += openalex_search(args.query, args.max, args.year_from, args.year_to)
            elif s == "crossref":
                out += crossref_search(args.query, args.max, args.year_from, args.year_to)
            elif s == "s2":
                out += s2_search(args.query, args.max, args.year_from, args.year_to)
        except Exception as e:
            print(f"# {s}: {type(e).__name__}: {e}", file=sys.stderr)
    return out


def cmd_lookup(args: argparse.Namespace) -> list[dict[str, Any]]:
    kind, ident = detect_id(args.id)
    # Try the most informative source first per id kind
    chain: list[tuple[str, Any]] = []
    if kind == "arxiv":
        chain = [("arxiv", lambda: arxiv_lookup(ident)),
                 ("s2", lambda: s2_lookup(ident, "arxiv")),
                 ("openalex", lambda: openalex_lookup(ident, "arxiv"))]
    elif kind == "doi":
        chain = [("openalex", lambda: openalex_lookup(ident, "doi")),
                 ("s2", lambda: s2_lookup(ident, "doi")),
                 ("crossref", lambda: crossref_lookup(ident))]
    elif kind == "openalex":
        chain = [("openalex", lambda: openalex_lookup(ident, "openalex"))]
    for _, fn in chain:
        try:
            r = fn()
            if r:
                return [r]
        except Exception:
            continue
    return []


def cmd_citations(args: argparse.Namespace) -> list[dict[str, Any]]:
    return openalex_citations(args.id, args.max)


def cmd_references(args: argparse.Namespace) -> list[dict[str, Any]]:
    return openalex_references(args.id, args.max)


def cmd_oa_pdf(args: argparse.Namespace) -> list[dict[str, Any]]:
    kind, ident = detect_id(args.id)
    # Try OpenAlex first
    paper = openalex_lookup(ident, kind)
    if paper and paper.get("pdf_url"):
        return [{"pdf_url": paper["pdf_url"], "is_oa": True, "source": "openalex"}]
    paper = s2_lookup(ident, kind)
    if paper and paper.get("pdf_url"):
        return [{"pdf_url": paper["pdf_url"], "is_oa": True, "source": "s2"}]
    if kind == "arxiv":
        return [{"pdf_url": f"https://arxiv.org/pdf/{ident}.pdf", "is_oa": True, "source": "arxiv"}]
    return [{"pdf_url": "", "is_oa": False, "source": None}]


# ---------- Output formatting ----------

def format_markdown(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "_no results_"
    lines = []
    for i, r in enumerate(rows, 1):
        title = r.get("title", "(no title)")
        authors = ", ".join((r.get("authors") or [])[:3])
        if r.get("authors") and len(r["authors"]) > 3:
            authors += ", et al."
        year = r.get("year") or "?"
        venue = r.get("venue") or ""
        cites = r.get("citation_count")
        cite_str = f" · {cites} cites" if cites else ""
        doi = r.get("doi") or ""
        url = r.get("url") or (f"https://doi.org/{doi}" if doi else "")
        lines.append(f"**{i}. {title}** ({year}){cite_str}")
        if authors:
            lines.append(f"   {authors}")
        if venue:
            lines.append(f"   _{venue}_")
        if url:
            lines.append(f"   {url}")
        lines.append("")
    return "\n".join(lines)


# ---------- Main ----------

def main() -> int:
    p = argparse.ArgumentParser(description="Search & look up academic papers (stdlib-only).")
    sub = p.add_subparsers(dest="action", required=True)

    sp = sub.add_parser("search")
    sp.add_argument("--query", required=True)
    sp.add_argument("--max", type=int, default=10)
    sp.add_argument("--source", default="all", choices=["all", "arxiv", "openalex", "crossref", "s2"])
    sp.add_argument("--year-from", type=int)
    sp.add_argument("--year-to", type=int)
    sp.add_argument("--format", default="json", choices=["json", "markdown"])

    lp = sub.add_parser("lookup")
    lp.add_argument("--id", required=True)
    lp.add_argument("--format", default="json", choices=["json", "markdown"])

    cp = sub.add_parser("citations")
    cp.add_argument("--id", required=True)
    cp.add_argument("--max", type=int, default=50)
    cp.add_argument("--format", default="json", choices=["json", "markdown"])

    rp = sub.add_parser("references")
    rp.add_argument("--id", required=True)
    rp.add_argument("--max", type=int, default=50)
    rp.add_argument("--format", default="json", choices=["json", "markdown"])

    op = sub.add_parser("oa-pdf")
    op.add_argument("--id", required=True)
    op.add_argument("--format", default="json", choices=["json", "markdown"])

    args = p.parse_args()

    if args.action == "search":
        rows = cmd_search(args)
    elif args.action == "lookup":
        rows = cmd_lookup(args)
    elif args.action == "citations":
        rows = cmd_citations(args)
    elif args.action == "references":
        rows = cmd_references(args)
    elif args.action == "oa-pdf":
        rows = cmd_oa_pdf(args)
    else:
        p.print_help()
        return 2

    if args.format == "markdown":
        print(format_markdown(rows))
    else:
        for r in rows:
            print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
