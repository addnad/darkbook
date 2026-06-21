# DarkBook

**An OTC block-trading venue on Sui.**

Off-chain intent matching · on-chain atomic settlement · DeepBook V3 liquidity fallback.

[Live app →](https://darkbookapp.vercel.app/)

---

## Overview

DarkBook is an on-chain OTC venue on Sui for executing large-block trades without market impact. Traders submit intents specifying side, amount, and a minimum acceptable price. A matching engine pairs opposing intents and settles them atomically through a Move vault — both sides clear in a single transaction at a fair mid-price, with no slippage.

When no counterparty match is found within 120 seconds, the unmatched intent is routed automatically to DeepBook V3, Sui's native central limit order book, so every order has a path to execution.

**No market impact:** large blocks clear in a single atomic settlement at a fair mid-price, rather than resting on a public book where they move the market. Unmatched size routes to DeepBook V3 instead of splitting the trade.

---

## How it works

DarkBook has three layers: a Move settlement vault, an off-chain matching engine, and a DeepBook V3 fallback.

### 1 · Settlement vault (Move)

A shared Sui object that custodies SUI in a single pooled balance and tracks each participant's claim in a table. Settlement moves balances between counterparties as bookkeeping; participants withdraw their settled balance from the shared pool. This pooled design is what allows a settled counterparty to withdraw value that originated from the other side of the trade.

| Function | Description |
|----------|-------------|
| `deposit_and_intent` | Locks SUI into the pool, records the depositor's balance, creates a shared `Intent` object, emits `Deposited` |
| `settle` | Matcher-only. Adjusts buyer/seller balances atomically at the agreed price. Emits `Settled` |
| `cancel` | Returns an unmatched depositor's balance from the pool |
| `withdraw` | Withdraws a settled balance from the pool to the owner. Emits `Withdrawn` |

`Intent` objects are shared, so the matcher can reference them inside a programmable transaction block (PTB) without owning them.

### 2 · Intent matching engine (Node.js / Express)

A stateless service that pairs opposing intents.

1. Validates the request and creates an intent record.
2. Scans pending intents for a price overlap (`buyer.min_price >= seller.min_price`).
3. On a match: builds a PTB calling `vault::settle`, signs as the matcher, executes, and returns the digest.
4. On no match: queues the intent with a 120-second fallback timer. If it stays unmatched, it routes to DeepBook V3.

### 3 · DeepBook V3 fallback

Unmatched intents are filled on DeepBook V3 through the matcher's `BalanceManager`. The route is side-aware:

- **Sell** — deposits SUI (plus a small fee buffer), places a market sell, and sweeps both resulting coins back to the trader.
- **Buy** — deposits DBUSDC sized to the order with a slippage buffer, places a market buy, and sweeps the filled SUI plus any unused buffer back to the trader.

Buffers exist because DeepBook charges the taker fee from the input asset when not paying in DEEP; any unused remainder is always returned, so the trader never overpays. The `BalanceManager` is fully swept after each route, so no residual balance is left between trades.

The engine also serves live DeepBook market data — prices, order book, and recent trades — sourced from the DeepBook V3 Indexer across active pairs including SUI/DBUSDC, DEEP/SUI, DEEP/DBUSDC, WAL/SUI, WAL/DBUSDC, and DBUSDT/DBUSDC. On-chain execution is currently verified on SUI/DBUSDC.

---

## Trade lifecycle

1. Buyer calls `deposit_and_intent` (`side = 0`). The vault pools their SUI and records their balance.
2. Seller calls `deposit_and_intent` (`side = 1`). Same.
3. Both submit their on-chain `Intent` IDs to `POST /intent`. The engine detects the price overlap and computes the agreed mid price.
4. The matcher calls `settle`; balances adjust atomically and a `Settled` event is emitted.
5. Each party withdraws their settled balance from the pool.
6. If no peer match appears within 120 seconds, the intent routes to DeepBook V3 and fills on-chain.

---

## Deployment (Sui Testnet)

| Object | Address |
|--------|---------|
| Package ID | `0xd2ceb60740725ec1b962511378c8701b54173354a133175ec7663160af925eb5` |
| Vault (shared) | `0xadddb5525c4583602945353a143e7a19ce687b22cede1563b32f8cdfb45df160` |
| Vault initial version | `909793926` |
| BalanceManager | `0xe36aafc2602269e5641833c7261acaf3a655b8f98d535d446adcfffb09809ebd` |

---

## API reference

### Intent endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/intent` | POST | Submit an intent. Returns `matched` with a digest, or `pending` with a fallback timer |
| `/intents` | GET | All pending intents with their DeepBook fallback countdown |
| `/intent/:id` | GET | Status and time remaining for one intent |
| `/routing/:id` | GET | DeepBook routing result for an intent (by UUID or on-chain ID) |
| `/health` | GET | Service status and matcher address |

### DeepBook endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/deepbook/pairs` | GET | Active pairs with live price, bid, ask, and volume |
| `/deepbook/price?pool=` | GET | Live price (default `SUI_DBUSDC`) |
| `/deepbook/orderbook?pool=&depth=` | GET | Bid/ask levels (default depth 10) |
| `/deepbook/trades?pool=` | GET | Recent trades |

### `POST /intent` body

| Field | Description |
|-------|-------------|
| `owner` | Sui wallet address |
| `side` | `0` = buy, `1` = sell |
| `amount` | MIST (1 SUI = 1,000,000,000) |
| `min_price` | scaled by 1e6 (`3500000` = $3.50) |
| `onChainId` | `Intent` shared object ID from the deposit transaction |
| `initialSharedVersion` | from the deposit transaction output |

---

## Local setup

**Prerequisites:** Sui CLI, Node.js 20+, and a funded Sui testnet wallet.

Clone and install the backend:

```
git clone https://github.com/addnad/darkbook
cd darkbook/backend
npm install
```

Create `backend/.env`:

```
PORT=3001
SUI_NETWORK=testnet
PACKAGE_ID=0xd2ceb60740725ec1b962511378c8701b54173354a133175ec7663160af925eb5
VAULT_ID=0xadddb5525c4583602945353a143e7a19ce687b22cede1563b32f8cdfb45df160
VAULT_INITIAL_VERSION=909793926
BALANCE_MANAGER_ID=0xe36aafc2602269e5641833c7261acaf3a655b8f98d535d446adcfffb09809ebd
BALANCE_MANAGER_VERSION=885018947
MATCHER_PRIVATE_KEY=suiprivkey1...
```

Run the engine:

```
node index.js
```

Run the frontend:

```
cd ../frontend
npm install
npm run dev
```

### Deploying your own vault

```
cd contracts
sui client switch --env testnet
sui client publish --gas-budget 50000000
```

Update `PACKAGE_ID`, `VAULT_ID`, and `VAULT_INITIAL_VERSION` in `.env` with the published output. The matcher wallet also needs a DeepBook `BalanceManager`; set `BALANCE_MANAGER_ID` and `BALANCE_MANAGER_VERSION` accordingly.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Move (Sui 2024 edition) |
| Intent engine | Node.js + Express |
| Sui SDK | `@mysten/sui` (engine 1.45 · frontend 2.18) |
| DeepBook | `@mysten/deepbook-v3` 1.5 + DeepBook V3 Indexer |
| Frontend | Next.js 14 · React 18 · TypeScript · `@mysten/dapp-kit` 1.0 |
| Deployment | Render (engine) · Vercel (frontend) |

---

## License

MIT
