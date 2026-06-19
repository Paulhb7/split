---
name: market-data
description: Pull live market data — equity / ETF / FX / crypto prices and fundamentals — from the shell using **keyless** open sources. Also covers writing the result to a tidy Excel/CSV model with assumptions, scenarios, and sensitivity. Use whenever a task needs current prices, historical series, fundamentals, or a downloadable spreadsheet model. No API key required for any source listed here.
---

# Market Data

Fetch live market data from the user's machine and, when asked, ship the
result as either a tidy Excel/CSV model or a self-contained HTML report.
You have the shell, the filesystem, and `pip`. Use them — don't make up
numbers.

**Discipline**: every source documented here is **keyless**. No
`*_API_KEY` in `.env`, no signup, no rate-limit dance. If a future need
genuinely requires a paid / keyed source, that's a separate skill — keep
this one clean.

## Source ladder — keyless only

| Need                                          | Source                  |
| --------------------------------------------- | ----------------------- |
| Equity / ETF prices + fundamentals (global)   | **yfinance**            |
| FX rates                                      | **exchangerate.host**   |
| Crypto (spot + history)                       | **CoinGecko** free tier |
| News headlines / macro context on a ticker    | native web search    |
| Macro context (rates, CPI, unemployment, GDP) | native web search on fred.stlouisfed.org / tradingeconomics.com / ecb.europa.eu |

## yfinance — equity / ETF / FX / crypto

Install on the fly into the active venv:

```bash
python -m pip install --quiet yfinance pandas
```

Quick recipes:

```python
import yfinance as yf, pandas as pd

# 1y of daily OHLCV
hist = yf.Ticker("AAPL").history(period="1y", auto_adjust=True)

# Multiple tickers, adjusted close only
prices = yf.download(["AAPL", "MSFT", "^GSPC"], period="2y",
                     auto_adjust=True, progress=False)["Close"]

# Fundamentals snapshot
info = yf.Ticker("AAPL").info            # market cap, sector, P/E…
fin  = yf.Ticker("AAPL").financials       # income statement
bs   = yf.Ticker("AAPL").balance_sheet
cf   = yf.Ticker("AAPL").cashflow

# Crypto: ticker is "BTC-USD", FX is "EURUSD=X", index is "^GSPC"
```

Always pass `auto_adjust=True` so splits/dividends are folded in. If a
ticker returns empty, surface it — don't silently skip.

## FX — exchangerate.host

```python
import requests
fx = requests.get("https://api.exchangerate.host/latest",
                  params={"base": "EUR", "symbols": "USD,GBP,JPY,CHF"}).json()["rates"]
```

Historical FX too:
```python
hist = requests.get("https://api.exchangerate.host/timeseries",
                    params={"base": "EUR", "symbols": "USD",
                            "start_date": "2025-01-01",
                            "end_date":   "2026-05-27"}).json()["rates"]
```

## CoinGecko — crypto (free tier, no key)

```python
import requests
spot = requests.get("https://api.coingecko.com/api/v3/coins/markets",
                    params={"vs_currency": "usd",
                            "ids": "bitcoin,ethereum,solana"}).json()
hist = requests.get("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
                    params={"vs_currency": "usd", "days": "365"}).json()
```

CoinGecko's free tier rate-limits aggressively (~10-30 req/min). Cache
locally — see Caching below — and don't loop without backoff.

## Macro & news — via native web search

The macro context for any pitch (US 10y, Fed path, EU inflation, China
PMI, etc.) is best fetched via native web search against authoritative pages
rather than a structured API. Workflow:

1. `search` query: `"US 10 year treasury yield site:fred.stlouisfed.org"`
   or `"EU CPI April 2026 site:ec.europa.eu"`.
2. `fetch_content` the top result to read the actual number with its
   as-of date.
3. Cite the source URL in the deliverable.

This is slower than a structured API but it's keyless and the source
quality is excellent. For repeat use, cache the parsed number locally.

## Caching — be a good citizen

Every series you fetch goes to
`~/.cache/split-market-data/<source>/<key>.parquet` (or `.json`) keyed
by the request. On the next call, read the cache if it's fresh —
default TTL: 1 day for prices, 7 days for fundamentals, 30 days for
macro indicators. State once at the start: "from cache" vs "fetched
live".

## Writing an Excel model — conventions

Use `openpyxl` (no Microsoft Office needed). Save to
`~/Desktop/<topic>-<YYYYMMDD>.xlsx`.

A model is **four sheets**, in this order:

1. **`Cover`** — title, author = "Split / Financier", date, one-paragraph
   summary, key outputs (one cell each, named ranges).
2. **`Assumptions`** — every input in one column, with units and source.
   Cells the user is expected to tweak go on a light fill
   (`fill="FFF6D6"`). No magic numbers anywhere else in the workbook —
   every formula references this sheet.
3. **`Data`** — raw series pulled from the source. One column per
   series, first row = header, second row = units, third row = source URL.
4. **`Model`** — the actual computation. Cells are formulas referencing
   `Assumptions` and `Data`. Right-align numerics, format with
   `number_format = '#,##0.00'` or `'0.0%'`.

Optional fifth sheet **`Scenarios`** for sensitivity — base / bear /
bull as three columns, each toggling a multiplier on the Assumptions
sheet.

Skeleton:

```python
import openpyxl as xl
wb = xl.Workbook()
cov, asm, dat, mod = wb.active, wb.create_sheet("Assumptions"), \
                     wb.create_sheet("Data"), wb.create_sheet("Model")
cov.title = "Cover"
# … write headers, units, sources, formulas referencing =Assumptions!$B$3 etc.
wb.save(out_path)
```

## Writing an HTML report — when

When the deliverable is "show me the picture", prefer a self-contained
HTML report (the **dashboard** skill, `terminal` preset) over an Excel
model.

## Output discipline

- Always state the **as-of date** for any price or rate, in the user's
  timezone.
- Always cite the source per series
  (`yfinance:AAPL 2026-05-27`, `CoinGecko:bitcoin`, `web search · fred.stlouisfed.org`).
- If the source is delayed (yfinance is end-of-day for most exchanges,
  ~15-min lag intraday on US equities), say so once at the top.
- Never hand the user a number without its unit. Currencies always
  carry the ISO code (EUR, not €, in tables).
- Save outputs to `~/Desktop/` or `~/Documents/split-finance/<topic>/`,
  never overwrite silently — append a date suffix.
