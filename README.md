# DarkBook

Private OTC dark pool on Sui — off-chain intent matching, on-chain atomic settlement, DeepBook V3 liquidity fallback.

> Sui Overflow 2026 — DeepBook Track + DeFi & Payments Track

## What it does

Traders submit signed intents off-chain (side, amount, min price). The matching engine finds opposing intents and settles them atomically on-chain through a Move vault. No order is visible on-chain before execution — eliminating front-running and market impact. Unmatched orders route to DeepBook V3 after 30 seconds.

## Deployed Contracts (Sui Testnet)

| Object | Address |
|--------|---------|
| Package | `0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3` |
| Vault | `0x84e7da902cf30f0946a320a17dee1b52d39bb040ef03822aab2084ab41f2eaba` |
| Settlement Tx | `9fJ6QE6ShmqcZ1c2BvfcjNY49H75FWbB7eAR79ZhXq82` |

## Architecture

- **Move Vault** — deposit_and_intent, settle, cancel. Intents are shared objects for permissionless matcher access.
- **Intent Engine** — Node.js/Express. Price-overlap matching. 30s DeepBook fallback timer per intent.
- **DeepBook Integration** — Live price, order book depth, recent trades via DeepBook V3 Indexer. 6 active pairs.

## API

| Endpoint | Description |
|----------|-------------|
| POST /intent | Submit intent. Returns matched or pending |
| GET /intents | All pending intents with countdown |
| GET /deepbook/pairs | All live DeepBook pairs |
| GET /deepbook/price?pool=SUI_DBUSDC | Live price |
| GET /deepbook/orderbook?pool=SUI_DBUSDC | Bid/ask depth |
| GET /deepbook/trades?pool=SUI_DBUSDC | Recent trades |

## Setup

```bash
git clone https://github.com/addnad/darkbook
cd darkbook/backend && npm install
cp .env.example .env
node index.js
```

## Tech Stack

- Smart Contract: Move (Sui 2024 edition)
- Intent Engine: Node.js + Express
- DeepBook Data: DeepBook V3 Indexer REST API
- Frontend: React + Vite + @mysten/dapp-kit

## Built by

@1st_bernice
