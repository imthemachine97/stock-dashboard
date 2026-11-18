"""Download one year of daily closing prices for every ticker in tickers.txt
and write them to data/prices.json. Uses only the Python standard library."""

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TICKERS_FILE = ROOT / "tickers.txt"
OUT_FILE = ROOT / "data" / "prices.json"
URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"


def read_tickers():
    tickers = []
    for line in TICKERS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip().upper()
        if line and not line.startswith("#") and line not in tickers:
            tickers.append(line)
    return tickers


def fetch(symbol):
    req = urllib.request.Request(
        URL.format(symbol=symbol), headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    result = payload["chart"]["result"][0]
    meta = result["meta"]
    closes = result["indicators"]["quote"][0]["close"]
    prices = []
    for ts, close in zip(result.get("timestamp", []), closes):
        if close is None:
            continue
        day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        if prices and prices[-1][0] == day:
            prices[-1][1] = round(close, 4)
        else:
            prices.append([day, round(close, 4)])
    return {
        "symbol": symbol,
        "name": meta.get("longName") or meta.get("shortName") or symbol,
        "currency": meta.get("currency", "USD"),
        "prices": prices,
    }


def main():
    stocks, failed = [], []
    for symbol in read_tickers():
        try:
            stocks.append(fetch(symbol))
            print(f"ok    {symbol}")
        except Exception as exc:  # keep going if one ticker fails
            failed.append(symbol)
            print(f"FAIL  {symbol}: {exc}")
        time.sleep(0.5)

    if not stocks:
        raise SystemExit("No data downloaded - leaving the old prices.json in place.")

    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(
            {
                "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "failed": failed,
                "stocks": stocks,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(stocks)} tickers to {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
