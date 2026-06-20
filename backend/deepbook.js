import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { DeepBookClient } from "@mysten/deepbook-v3";
import dotenv from "dotenv";
dotenv.config();

const DEEPBOOK_INDEXER = "https://deepbook-indexer.testnet.mystenlabs.com";
const POOL_KEY = "SUI_DBUSDC";
const MIN_ORDER_SUI = 1.0; // on-chain pool min_size, confirmed via poolBookParams
const LOT_SIZE_SUI = 0.1;  // on-chain pool lot_size, confirmed via poolBookParams

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const { secretKey } = decodeSuiPrivateKey(process.env.MATCHER_PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const matcherAddress = keypair.getPublicKey().toSuiAddress();

const BALANCE_MANAGER_ID = process.env.BALANCE_MANAGER_ID;
const BALANCE_MANAGER_VERSION = Number(process.env.BALANCE_MANAGER_VERSION);
const BALANCE_MANAGER_KEY = "DARKBOOK_MANAGER";

const dbClient = new DeepBookClient({
  address: matcherAddress,
  network: "testnet",
  client,
  balanceManagers: {
    [BALANCE_MANAGER_KEY]: {
      address: BALANCE_MANAGER_ID,
      tradeCap: undefined,
    },
  },
});

function assertSuccess(result, label) {
  const status = result.effects?.status?.status;
  if (status !== "success") {
    const errMsg = result.effects?.status?.error || "unknown on-chain abort";
    throw new Error(`${label} failed on-chain: ${errMsg} (digest: ${result.digest})`);
  }
}

export async function getSuiUsdcPrice(pool = "SUI_DBUSDC") {
  const res = await fetch(`${DEEPBOOK_INDEXER}/summary`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  const data = await res.json();
  const pair = data.find(p => p.trading_pairs === pool);
  if (!pair) throw new Error(`${pool} pair not found`);
  return {
    pool,
    last_price: pair.last_price,
    highest_bid: pair.highest_bid,
    lowest_ask: pair.lowest_ask,
    base_volume: pair.base_volume,
    quote_volume: pair.quote_volume,
    price_change_24h: pair.price_change_percent_24h,
    highest_price_24h: pair.highest_price_24h,
    lowest_price_24h: pair.lowest_price_24h,
  };
}

export async function getOrderBook(depth = 10, pool = "SUI_DBUSDC") {
  const res = await fetch(`${DEEPBOOK_INDEXER}/orderbook/${pool}?level=2&depth=${depth}`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  return await res.json();
}

export async function getRecentTrades(limit = 20, pool = "SUI_DBUSDC") {
  const res = await fetch(`${DEEPBOOK_INDEXER}/trades/${pool}?limit=${limit}`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  return await res.json();
}

export async function getPools() {
  const res = await fetch(`${DEEPBOOK_INDEXER}/get_pools`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  return await res.json();
}

export async function routeToDeepBook(intent) {
  const sideLabel = intent.side === 0 ? "BUY" : "SELL";
  const isBid = intent.side === 0;
  // For SUI_DBUSDC pool:
  // BUY  (bid)  = buying SUI with DBUSDC → deposit DBUSDC (quote), amount = SUI qty * price
  // SELL (ask)  = selling SUI for DBUSDC → deposit SUI (base), amount = SUI qty
  const DBUSDC_TYPE = "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";
  const DBUSDC_SCALAR = 1_000_000;
  const SUI_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
  const SUI_SCALAR = 1_000_000_000;
  const POOL_ADDRESS = "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
  const rawAmountSui = Number(intent.amount) / 1e9;

  console.log(`[DeepBook] Routing unmatched ${sideLabel} intent to DeepBook V3...`);
  console.log(`[DeepBook] Requested amount: ${rawAmountSui} SUI | Intent: ${intent.id}`);

  // Enforce pool minimum order size before attempting anything on-chain
  if (rawAmountSui < MIN_ORDER_SUI) {
    const msg = `Amount ${rawAmountSui} SUI is below DeepBook pool minimum of ${MIN_ORDER_SUI} SUI`;
    console.error(`[DeepBook] ${msg} - skipping route`);
    return {
      routed: false,
      venue: "DeepBook V3",
      intentId: intent.id,
      error: msg,
      timestamp: Date.now(),
    };
  }

  // Round down to the nearest lot size so the order passes on-chain validation
  const amountSui = Math.floor(rawAmountSui / LOT_SIZE_SUI) * LOT_SIZE_SUI;
  const amountMist = BigInt(Math.round(amountSui * 1e9));

  if (amountSui !== rawAmountSui) {
    console.log(`[DeepBook] Rounded to lot size: ${amountSui} SUI (lot size: ${LOT_SIZE_SUI})`);
  }

  try {
    const price = await getSuiUsdcPrice();
    console.log(`[DeepBook] SUI/USDC — last: $${price.last_price} | bid: $${price.highest_bid} | ask: $${price.lowest_ask}`);

    // --- Determine deposit coin & amount based on side ---
    const depositCoinKey = isBid ? "DBUSDC" : "SUI";
    const depositScalar = isBid ? DBUSDC_SCALAR : SUI_SCALAR;
    const depositCoinType = isBid ? DBUSDC_TYPE : SUI_TYPE;

    let depositAmount; // human units (not raw)
    if (isBid) {
      const pricePerSui = price.lowest_ask || price.last_price;
      const SLIPPAGE_BUFFER = 1.20; // 20% headroom for thin-book market-order slippage on testnet
      depositAmount = Math.ceil(amountSui * pricePerSui * SLIPPAGE_BUFFER * depositScalar) / depositScalar;
      console.log(`[DeepBook] BUY: will deposit ${depositAmount} DBUSDC at ask $${pricePerSui} (+20% slippage buffer)`);
    } else {
      depositAmount = amountSui;
      console.log(`[DeepBook] SELL: will deposit ${depositAmount} SUI`);
    }

    // --- Pre-flight balance checks (early, friendly errors) ---
    const depositCoins = await client.getCoins({ owner: matcherAddress, coinType: depositCoinType });
    const suiCoins = await client.getCoins({ owner: matcherAddress, coinType: SUI_TYPE });
    const totalDeposit = depositCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
    const totalSui = suiCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
    const depositAmountRaw = BigInt(Math.round(depositAmount * depositScalar));

    if (isBid) {
      if (totalDeposit < depositAmountRaw) {
        throw new Error(`Matcher has only ${Number(totalDeposit)/depositScalar} DBUSDC. Need ${depositAmount} DBUSDC. Fund the matcher with DBUSDC.`);
      }
      if (totalSui < 300_000_000n) {
        throw new Error(`Matcher needs at least 0.3 SUI for gas. Run: sui client faucet`);
      }
    } else {
      if (totalSui < depositAmountRaw + 300_000_000n) {
        throw new Error(`Matcher has only ${Number(totalSui)/1e9} SUI. Need ${depositAmount} + ~0.3 gas. Run: sui client faucet`);
      }
    }

    // --- Single atomic PTB: deposit -> market order -> withdraw all ---
    console.log(`[DeepBook] Building atomic deposit+order+withdraw PTB...`);
    const tx = new Transaction();
    tx.setGasBudget(300_000_000);

    // 1. Deposit (coinWithBalance auto-selects/merges/splits the funding coin)
    dbClient.balanceManager.depositIntoManager(
      BALANCE_MANAGER_KEY,
      depositCoinKey,
      depositAmount
    )(tx);

    // 2. Place market order (SDK generates owner proof internally)
    dbClient.deepBook.placeMarketOrder({
      poolKey: POOL_KEY,
      balanceManagerKey: BALANCE_MANAGER_KEY,
      clientOrderId: Date.now(),
      quantity: amountSui,
      isBid,
      payWithDeep: false,
    })(tx);

    // 3. Sweep BOTH coins back to the intent owner. Manager ends empty.
    dbClient.balanceManager.withdrawAllFromManager(BALANCE_MANAGER_KEY, "SUI", intent.owner)(tx);
    dbClient.balanceManager.withdrawAllFromManager(BALANCE_MANAGER_KEY, "DBUSDC", intent.owner)(tx);

    const txResult = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true, showBalanceChanges: true },
    });
    await client.waitForTransaction({ digest: txResult.digest });
    assertSuccess(txResult, "Atomic route");
    console.log(`[DeepBook] Atomic route confirmed: ${txResult.digest}`);

    const received = (txResult.balanceChanges ?? [])
      .filter(c => c.owner?.AddressOwner === intent.owner)
      .map(c => ({ amount: c.amount, coinType: c.coinType }));

    for (const r of received) {
      console.log(`[DeepBook] Owner received: ${r.amount} of ${r.coinType}`);
    }
    if (received.length === 0 || received.every(r => BigInt(r.amount) === 0n)) {
      console.warn(`[DeepBook] WARNING: owner received zero value - order may not have filled`);
    }

    return {
      routed: true,
      venue: "DeepBook V3",
      pool: POOL_KEY,
      intentId: intent.id,
      side: sideLabel,
      amount: intent.amount,
      amount_sui: amountSui.toFixed(4),
      price: price.last_price,
      digest: txResult.digest,
      received,
      timestamp: Date.now(),
    };

  } catch (err) {
    console.error(`[DeepBook] Routing failed:`, err.message);
    return {
      routed: false,
      venue: "DeepBook V3",
      intentId: intent.id,
      error: err.message,
      timestamp: Date.now(),
    };
  }
}
