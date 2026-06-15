# DarkBook

**Private OTC Dark Pool on Sui**

Off-chain intent matching · On-chain atomic settlement · DeepBook V3 liquidity fallback

> Sui Overflow 2026 — DeepBook Track + DeFi and Payments Track

---

## Overview

DarkBook is an on-chain OTC trading platform built on Sui that enables large-block trades without market impact. Traders post signed intents off-chain specifying side, amount, and minimum acceptable price. The matching engine pairs opposing intents privately and settles them atomically through a Move vault — no order appears on-chain until the trade is already done.

When no peer match is found within 30 seconds, the unmatched intent routes automatically to DeepBook V3, ensuring every trade gets filled.

**Core privacy guarantee:** Your price and size are never visible on-chain before execution. Front-running is impossible because there is nothing to front-run.

---

## Deployed Contracts (Sui Testnet)

| Object | Address |
|--------|---------|
| Package ID | 0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3 |
| Vault (shared) | 0x84e7da902cf30f0946a320a17dee1b52d39bb040ef03822aab2084ab41f2eaba |
| Vault Initial Version | 349181739 |
| Confirmed Settlement | 9fJ6QE6ShmqcZ1c2BvfcjNY49H75FWbB7eAR79ZhXq82 |
| Matcher | 0x5d66049199c27d0bbd6e5cf0b4148720b6304643439dda84b6b292a8c5ce99f0 |

---

## Architecture

### 1. Move Vault Contract

Shared Sui object holding user funds and executing atomic settlements.

| Function | Description |
|----------|-------------|
| deposit_and_intent() | Locks SUI, creates a shared Intent object, emits Deposited event |
| settle() | Matcher-only. Atomically swaps balances between buyer and seller. Emits Settled event |
| cancel() | User reclaims funds if intent is unmatched |

Intents are shared objects so the matcher can reference them in a PTB without owning them. Coins are stored as dynamic fields keyed by depositor address.

### 2. Intent Matching Engine

Stateless Node.js / Express server.

1. Validates request fields
2. Scans pending intents for price overlap: buyer.min_price >= seller.min_price
3. Match found: builds PTB calling vault::settle, signs, executes, returns digest
4. No match: queues intent with 30-second DeepBook fallback timer

### 3. DeepBook V3 Integration

Live market data from the DeepBook V3 Indexer across 6 active pairs. Unmatched orders route to DeepBook after the timeout.

Supported pairs: SUI_DBUSDC · DEEP_SUI · DEEP_DBUSDC · WAL_SUI · WAL_DBUSDC · DBUSDT_DBUSDC

---

## How a Trade Executes

1. Buyer calls deposit_and_intent with side=0, min_price=3_500_000. Vault locks 0.2 SUI.
2. Seller calls deposit_and_intent with side=1, min_price=3_400_000. Vault locks 0.2 SUI.
3. Both POST their Intent object IDs to /intent. Engine detects overlap: 3.50 >= 3.40. Agreed price = 3.45.
4. Matcher calls settle(vault, intent_buyer, intent_seller, agreed_price). Balances swap atomically.
5. Settled event on-chain: { buyer, seller, amount: 200000000, price: 3450000 }
6. If no peer match in 30s: routes to DeepBook V3 automatically.

---

## API Reference

### Intent Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /intent | POST | Submit intent. Returns matched with digest or pending with timer |
| /intents | GET | All pending intents with DeepBook fallback countdown |
| /intent/:id | GET | Status and time remaining for a specific intent |
| /health | GET | Server status and matcher address |

### DeepBook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /deepbook/pairs | GET | All active pairs with live price, bid, ask, volume |
| /deepbook/price?pool= | GET | Live price. Default: SUI_DBUSDC |
| /deepbook/orderbook?pool=&depth= | GET | Bid and ask levels. Default depth: 10 |
| /deepbook/trades?pool= | GET | Recent trades with price, volume, fees, digest |

### POST /intent Request Body

owner: Sui wallet address
side: 0 = buy, 1 = sell
amount: in MIST (1 SUI = 1,000,000,000)
min_price: scaled by 1e6 (3500000 = $3.50)
onChainId: Intent shared object ID from deposit transaction
initialSharedVersion: from deposit transaction output

---

## Local Setup

Prerequisites: Sui CLI >= 1.73.0, Node.js >= 20, funded Sui testnet wallet.

Clone and install:

    git clone https://github.com/addnad/darkbook
    cd darkbook/backend
    npm install

Create backend/.env:

    PORT=3001
    SUI_NETWORK=testnet
    PACKAGE_ID=0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3
    VAULT_ID=0x84e7da902cf30f0946a320a17dee1b52d39bb040ef03822aab2084ab41f2eaba
    VAULT_INITIAL_VERSION=349181739
    MATCHER_PRIVATE_KEY=suiprivkey1...

Run:

    node index.js

Deploy your own vault:

    cd contracts
    sui client switch --env testnet
    rm -f Published.toml
    sui client publish --gas-budget 50000000

Update PACKAGE_ID, VAULT_ID, and VAULT_INITIAL_VERSION in .env with new output.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Move (Sui 2024 edition) |
| Contract Tooling | Sui CLI 1.73.0 |
| Intent Engine | Node.js 22 + Express |
| Sui SDK | @mysten/sui@1.21.0 |
| DeepBook Data | DeepBook V3 Indexer REST API |
| Frontend | React + Vite + TypeScript + @mysten/dapp-kit |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Built by

@1st_bernice · Sui Overflow 2026
