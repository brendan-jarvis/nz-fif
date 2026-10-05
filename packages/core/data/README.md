# Bundled data

## `rbnz-b1-daily.json`
- **Source:** Reserve Bank of New Zealand, table B1 "Exchange rates and TWI", daily (`hb1-daily.xlsx`),
  https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index
- **Licence:** "You are free to copy, distribute and adapt these statistics subject to the conditions listed
  on our copyright page." Attribution: Reserve Bank of New Zealand (see NOTICE).
- **Content:** foreign-currency units per 1 NZD (the 2 pm WM/LSEG fix as published by RBNZ) for USD, GBP, AUD,
  JPY, EUR, CAD, HKD, SGD, 2018-01-03 onwards. Missing days (weekends, holidays) walk back up to 7 days.
- **Rebuild:** download `hb1-daily.xlsx` from the page above (RBNZ blocks scripted downloads, so use a browser),
  then `bun scripts/build-rbnz.ts path/to/hb1-daily.xlsx`. The JSON is deterministic for a given file.
- **Snapshot:** published 2026-09-18. Check rates: 31 Mar 2025 USD 0.57095; 31 Mar 2026 USD 0.57235.
