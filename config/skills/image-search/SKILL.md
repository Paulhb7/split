---
name: image-search
description: Find a real, free, properly-licensed image by keyword from the shell — no API key required. Primary source Openverse (the Creative Commons image search engine, aggregates Wikimedia + Flickr CC + museums); fallback Lorem Picsum for seeded atmospheric placeholders. Returns direct image URLs with attribution (creator, license, license URL, source page). Use whenever a deck, page, or report needs a real photograph or illustration.
---

# Image Search

Two sources. No API key. Real attribution.

| Need                                          | Source         | Auth |
| --------------------------------------------- | -------------- | ---- |
| A real photo or illustration on a topic       | **Openverse**  | None |
| Seeded atmospheric placeholder (no subject)   | **Lorem Picsum** | None |

## Openverse — the primary tool

Openverse (formerly CC Search) is the WordPress-maintained search engine
for openly-licensed images. It aggregates Wikimedia Commons, Flickr CC,
museums (Met, Smithsonian, Cleveland, Rijksmuseum), Europeana, and more.
The API is public and unauthenticated.

### Endpoint

```
GET https://api.openverse.org/v1/images/?q=<query>&page_size=10
```

Useful filter parameters:

| Param          | Values                                       | Use                                       |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| `q`            | free text                                    | the search query                          |
| `page_size`    | 1–500                                        | how many results (default 20)             |
| `license_type` | `commercial`, `modification`, `commercial,modification` | safe-for-everything filter                |
| `license`      | `cc0`, `by`, `by-sa`, `by-nc`, …             | exact license filter                      |
| `source`       | `wikimedia`, `flickr`, `met`, `smithsonian`, … | narrow to a curator if useful           |
| `aspect_ratio` | `tall`, `wide`, `square`                     | `wide` for 16:9 slides                    |
| `size`         | `small`, `medium`, `large`                   | the file dimension bucket                 |
| `extension`    | `jpg`, `jpeg`, `png`, `webp`                 | skip GIFs/SVGs when you want a photo      |

### Recipe

```bash
curl -s "https://api.openverse.org/v1/images/?q=alpine+landscape&page_size=10&license_type=commercial,modification&aspect_ratio=wide&size=large&extension=jpg,jpeg" \
  | jq '.results[] | {title, creator, license, license_version, url, thumbnail, source, foreign_landing_url, attribution}'
```

Per result you get:
- `url` — direct full-size image URL (host varies: upload.wikimedia.org, live.staticflickr.com, …)
- `thumbnail` — small preview, use to vet the candidate before downloading
- `title`, `creator` — for the caption
- `license` + `license_version` (e.g. `by-sa` `3.0`)
- `license_url` — the legal text URL (Creative Commons)
- `source` — the upstream platform (`wikimedia`, `flickr`, `met`…)
- `foreign_landing_url` — the page on the upstream platform
- `attribution` — a **pre-formatted attribution string** you can paste under the image

### Vet before you ship

CC-licensed results include maps, diagrams, illustrations, vintage prints,
not just contemporary photos. **Read the title and open the thumbnail**
before committing. Re-run the search with better terms rather than
shipping a misleading image.

If the first 10 results aren't great:
- Tighten with `source=wikimedia,flickr`
- Add concrete words (`portrait`, `landscape`, `dawn`, `aerial`)
- Try a synonym

### Download locally for offline decks

A self-contained HTML deck will break if you hotlink to Wikimedia — their
URLs can change and `Referer` policies can block embeds. Always download:

```bash
curl -L "<url>" -o ~/Documents/split-images/<slug>-<n>.jpg
```

Then reference the local file in the deck (or base64-inline if the deck
must be single-file).

### Attribution — non-negotiable

Every embedded image carries a caption. Two acceptable formats:

- **Inline caption** (under the image):
  `Photo: <creator> via <source> · <license> <version>`
  with the license name linking to `license_url` and the title linking to
  `foreign_landing_url`.
- **Chrome-bot footer** (for full-bleed slides where a caption would
  compete with the title): same format, placed in the bottom-right of the
  chrome row.

CC0 images do not legally require attribution but should still get a
credit line — it's good practice and consistent with the rest of the
deck.

## Lorem Picsum — seeded placeholder

When the subject is abstract ("operations", "growth", "the team") and no
specific photo is needed, use Picsum for a deterministic atmospheric
image:

```
https://picsum.photos/seed/<slug>/1920/1080
```

The same `<slug>` always returns the same image. Use kebab-case of the
slide topic (`https://picsum.photos/seed/q2-recap/1920/1080`).

Picsum images are Unsplash-derived but exposed under Picsum's own terms.
The proper credit is `Atmospheric placeholder · picsum.photos` — do not
claim it as a curated editorial photo.

## Cache locally

Save fetched images to `~/.cache/split-images/<query-slug>-<hash>.<ext>`.
Cache TTL: 30 days for Openverse photos (they don't change), no expiry
for Picsum (the seed is deterministic). State once at the top of the
deliverable: "from cache" vs "fetched live".

## When NOT to use an image

The `frontend-slides` skill is explicit about avoiding stock filler.
Before adding an image, ask:
- Does the image **add information** the text can't carry alone?
- Is the image **specific** to the subject (a particular city, a real
  product, the actual photographer's eye on the topic) — or is it generic
  ("business handshake", "abstract data")?

If the answer to either is no, the slide is better without the image.
Typography carries most decks; images are a tool, not a default.

## Output discipline

- Every image carries a caption with creator + license + source link.
- Local file path is reported once after download.
- For HTML decks, hotlink only if the deck will never be opened offline;
  otherwise download and reference the local file.
- For the `split-default` preset specifically, follow the layout rules in
  `bold-template-pack/templates/split-default/design.md` — full-bleed
  cover, full-bleed section divider, or inline 4:5 in a compare column,
  with a 40% dark overlay for legibility on full-bleed.
