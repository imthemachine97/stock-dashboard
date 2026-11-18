# Stock Watchlist

A small dashboard of daily stock prices, hosted free on GitHub Pages.

- **Change the stocks:** edit `tickers.txt` (one symbol per line), then commit and push.
- **Refresh now:** on GitHub, open the **Actions** tab → **Update prices** → **Run workflow**.
- **Automatic updates:** every weekday after the US market closes.

Prices come from Yahoo Finance's public chart data, via `scripts/fetch_prices.py`
(Python standard library only, no API key). For information only, not investment advice.

## Run it on your computer

```
python scripts/fetch_prices.py
python -m http.server 8000
```

Then open http://localhost:8000.
