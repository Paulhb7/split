# Split docs

The Split documentation site, built with [Mintlify](https://mintlify.com).

## Structure

- `docs.json` — site config: theme, colors, navbar, and the navigation tree
  (tabs → groups → pages).
- `*.mdx` — one file per page, grouped by tab: `get-started/`, `concepts/`,
  `architecture/`, `reference/`.
- `logo/`, `favicon.svg` — branding assets (copper `#d97757` on anthracite,
  placeholders — swap for the real Split mark when it exists).

## Preview locally

```bash
npm i -g mint        # the Mintlify CLI
mint dev             # serve this folder at http://localhost:3000
```

Run `mint dev` from inside `docs/` (or `mint dev --port 3333` to change the port).

## Source of truth

These pages are derived from the repo `README.md` and `CLAUDE.md`. When the
architecture changes, update both — `README.md` is canonical; this site is the
reader-facing projection of it.
