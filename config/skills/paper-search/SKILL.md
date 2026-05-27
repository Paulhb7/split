---
name: paper-search
description: Search and look up academic papers across arXiv, OpenAlex, Crossref, and Semantic Scholar — and fetch a paper's citation graph (who cites it, what it cites) and its open-access PDF URL. Stdlib-only, no API key needed for the core flow. Use when an expert needs to ground a claim in real published work, build a literature review, compare sources, or critique a manuscript.
---

# Paper Search

Find academic papers, fetch their metadata, walk the citation graph, get the
OA PDF. Wraps four free APIs (no key needed):

| Source              | Covers                                          | Strength                      |
| ------------------- | ----------------------------------------------- | ----------------------------- |
| **arXiv**           | physics, math, CS, quant-bio, econ, stats       | latest preprints, full PDFs   |
| **OpenAlex**        | 250M works, all fields                          | best metadata + free citation graph |
| **Crossref**        | 150M DOI records                                | DOI resolution + journal metadata |
| **Semantic Scholar**| 200M papers, all fields                         | best AI-ranked relevance + influence scores |

## Auth

No key required for normal usage. Add these to `.env` for higher rate limits:

- `OPENALEX_MAILTO=you@example.com` — polite-pool fast lane (recommended)
- `CROSSREF_MAILTO=you@example.com` — same (recommended)
- `S2_API_KEY=...` — Semantic Scholar key (optional, [request here](https://www.semanticscholar.org/product/api))

Without these, the script still works — it just hits the public pool which
is slower and rate-limited around ~10 req/s.

## Run

Stdlib-only Python — no install. The skill mounts under `.claude/skills/`
(Claude) or `.agents/skills/` (other harnesses):

```bash
python3 .claude/skills/paper-search/scripts/paper-search.py <action> [options]
```

### Actions

#### `search` — find papers by keyword/topic

```bash
python3 paper-search.py search --query "attention is all you need" --max 10
python3 paper-search.py search --query "CRISPR base editing 2024" --max 20 --source openalex
python3 paper-search.py search --query "..." --year-from 2022 --year-to 2024
```

- `--query "<text>"` — required. Free text; quoted phrases work.
- `--max N` — per-source cap (default 10). Total = `N × len(sources)`.
- `--source <name>` — `arxiv`, `openalex`, `crossref`, `s2`, or `all` (default).
- `--year-from / --year-to` — filter by publication year.
- `--format json|markdown` — default `json` (one JSON line per paper); `markdown` is
  a readable table for the agent to paste in a reply.

Output schema per paper (JSON):

```json
{
  "id": "10.48550/arXiv.1706.03762",
  "doi": "10.48550/arXiv.1706.03762",
  "arxiv_id": "1706.03762",
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "Noam Shazeer", ...],
  "year": 2017,
  "venue": "NeurIPS",
  "abstract": "The dominant sequence transduction models...",
  "citation_count": 102413,
  "url": "https://arxiv.org/abs/1706.03762",
  "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
  "source": "arxiv"
}
```

#### `lookup` — fetch one paper by ID

```bash
python3 paper-search.py lookup --id "10.1038/s41586-021-03819-2"     # DOI
python3 paper-search.py lookup --id "1706.03762"                     # arXiv ID
python3 paper-search.py lookup --id "arxiv:1706.03762"               # explicit
python3 paper-search.py lookup --id "W2964262617"                    # OpenAlex
```

Auto-detects the ID format. Returns the same paper schema as `search`.

#### `citations` — who cites this paper

```bash
python3 paper-search.py citations --id "1706.03762" --max 50
```

Returns up to N papers that cite the given one (via OpenAlex). Useful for
"is this idea still alive?" / "who built on this?".

#### `references` — what this paper cites

```bash
python3 paper-search.py references --id "1706.03762" --max 50
```

The bibliography of the given paper. Useful for *"trace the lineage of an
idea"*.

#### `oa-pdf` — find a free PDF URL

```bash
python3 paper-search.py oa-pdf --id "10.1038/s41586-021-03819-2"
```

Returns `{"pdf_url": "...", "is_oa": true, "source": "openalex"}` if a legal
open-access copy exists. Falls back to arxiv if the paper has a preprint.

## Workflow patterns

### Literature review (the Scientist's main mode)

```bash
# 1) Broad sweep — collect candidates from all sources
python3 paper-search.py search --query "<topic>" --max 25 --source all > candidates.jsonl

# 2) Filter — pick the 5-10 most relevant by reading titles/abstracts
#    (agent does this in-conversation)

# 3) Deep dive — for each, fetch citation graph
for id in <selected ids>; do
  python3 paper-search.py citations --id "$id" --max 20
  python3 paper-search.py references --id "$id" --max 20
done

# 4) Find PDFs the agent can read
for id in <selected ids>; do
  python3 paper-search.py oa-pdf --id "$id"
done

# 5) Synthesize → docx (Scientist mounts docx + frontend-slides too)
```

### Source comparison ("paper A says X, paper B says Y")

```bash
python3 paper-search.py lookup --id "<doi-A>"
python3 paper-search.py lookup --id "<doi-B>"
# read both abstracts, fetch PDFs if needed, contrast methodology + claims
```

### Peer review (critique a manuscript or a published paper)

```bash
python3 paper-search.py lookup --id "<doi>"           # the paper under review
python3 paper-search.py citations --id "<doi>" --max 30  # has anyone challenged it?
python3 paper-search.py references --id "<doi>" --max 50 # do its citations support its claims?
```

## Notes

- All four APIs are **rate-limited**. With mailto env vars set, you get ~50
  req/s; without, ~10 req/s. The script doesn't parallelize aggressively to
  stay polite.
- arXiv IDs come in two formats: old (`hep-th/9901001`) and new (`1706.03762`).
  Both work.
- Some DOIs aren't in OpenAlex (very old or non-Crossref). The script falls
  back across sources automatically.
- For **biomedical-heavy** queries, add PubMed later — not in v1.
