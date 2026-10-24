# idx-finance

[![npm version](https://img.shields.io/npm/v/idx-finance.svg)](https://www.npmjs.com/package/idx-finance) [![tests](https://img.shields.io/badge/tests-33%20passing-brightgreen)]() [![license](https://img.shields.io/npm/l/idx-finance.svg)](https://github.com/sulthonzh/idx-finance/blob/main/LICENSE) [![node](https://img.shields.io/node/v/idx-finance.svg)]()

TypeScript library + CLI for Indonesian Stock Exchange (IDX) data. Zero API key required.

> "The easiest way to get Indonesian stock data in your terminal or code."

## Install

```bash
npm install idx-finance
```

## CLI Usage

```bash
npx idx price BBCA
# BBCA (Bank Central Asia Tbk)
# Rp 9.725  ▲ +50 (+0.52%)
# Vol: 15.2M  H: Rp 9.800  L: Rp 9.675

npx idx quote BBCA        # Detailed quote
npx idx gainers           # Top 10 gainers
npx idx losers 20         # Top 20 losers
npx idx index IHSG        # Index value
npx idx index LQ45        # LQ45 index
npx idx search "bank"     # Search stocks
```

Install globally:

```bash
npm install -g idx-finance
idx price BBCA
```

## Library API

```typescript
import {
  getQuote,
  getQuotes,
  getTopGainers,
  getTopLosers,
  getIndex,
  searchStock,
} from 'idx-finance'

// Single stock quote
const quote = await getQuote('BBCA')
// { symbol: 'BBCA', name: 'Bank Central Asia Tbk', price: 9725, ... }

// Batch quotes
const quotes = await getQuotes(['BBCA', 'TLKM', 'ASII'])

// Top gainers/losers
const gainers = await getTopGainers(10)
const losers = await getTopLosers(10)

// Index values (IHSG, LQ45, IDX30)
const ihsg = await getIndex('IHSG')

// Search stocks
const results = await searchStock('bank')
```

## Features

- **Zero config** — no API keys needed
- **Dual CJS/ESM** — works everywhere
- **CLI + Library** — use from command line or as a dependency
- **Type-safe** — full TypeScript types
- **Input validation** — all user inputs sanitized
- **Rate limited** — respects API limits
- **Timeout protection** — 10s default timeout on all requests

## Data Sources

- Yahoo Finance v8/v6 API (primary)
- idx.co.id (supplementary)

## Types

```typescript
interface StockQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  prevClose: number
  marketCap?: number
  currency: string
}

interface IndexValue {
  name: string
  value: number
  change: number
  changePercent: number
}

interface SearchResult {
  symbol: string
  name: string
  exchange: string
}
```

## License

MIT
