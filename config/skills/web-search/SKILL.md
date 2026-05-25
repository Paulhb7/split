---
name: web-search
description: Search the live web and read pages — no API key. Use whenever a task needs current, contested, or citable facts (news, prices, releases, anything past your training cutoff). Provides the `search` and `fetch_content` tools (DuckDuckGo).
---

# Web Search

Find and read live web content. Two tools, no API key required.

## Prefer native search first

If your harness already has a built-in web search, **use it** — it is usually
higher quality and costs nothing extra. Fall back to the `search` tool below
only when you have no native web search. Either way, never answer a current or
contested question from memory alone.

## When to use which tool

| Need                         | Tool            | When                                       |
| ---------------------------- | --------------- | ------------------------------------------ |
| Find sources for a question  | `search`        | You need links + snippets to start from    |
| Read a specific page in full | `fetch_content` | You have a URL and need its actual content |

## search

Web search via DuckDuckGo. Returns titles, URLs, and snippets.

| Parameter     | Description                                        |
| ------------- | -------------------------------------------------- |
| `query`       | Search query string (think keywords, not a prompt) |
| `max_results` | Number of results to return (default 10)           |
| `region`      | Optional region/locale code (e.g. `fr-fr`)         |

Tips:
- **Keep queries short and keyword-like** — not a full sentence.
- **Break a complex question into sub-queries** and search each.
- **Re-search with better terms** rather than trusting one weak result set.
- Snippets are a map, not the territory — open the promising ones with
  `fetch_content` before quoting.

## fetch_content

Fetch a URL and return its readable content as text.

| Parameter     | Description                                         |
| ------------- | -------------------------------------------------- |
| `url`         | The page URL to fetch                              |
| `max_length`  | Max characters to return (default 8000)            |
| `start_index` | Offset to start from — page forward for long pages |

Tips:
- **Fetch before you cite.** A snippet is not a source; confirm the claim on the page.
- For long pages, raise `max_length` or page forward with `start_index`.

## Workflow — escalate only as needed

1. **`search`** — find candidate sources for the question.
2. **`fetch_content`** — open the 1-3 most promising results and read them.
3. **Cross-check** — confirm any non-obvious claim on a second source before
   stating it. Track where each fact came from (source name + link) so you can
   cite it. Never fabricate a citation or a statistic.
