import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { DeepBookClient } from "@mysten/deepbook-v3";
import dotenv from "dotenv";
dotenv.config();

const DEEPBOOK_INDEXER = "https://deepbook-indexer.testnet.mystenlabs.com";
const POOL_KEY = "SUI_DBUSDC";

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

export async function getCandles(interval = "1h", limit = 24) {
  const res = await fetch(`${DEEPBOOK_INDEXER}/ohclv/SUI_DBUSDC?interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  return await res.json();
}

export async function routeToDeepBook(intent, packageId, vaultId) {
  const sideLabel = intent.side === 0 ? "BUY" : "SELL";
  const isBid = intent.side === 0;
  const rawAmountSui = Number(intent.amount) / 1e9;
  const LOT_SIZE = 1;
  const amountSui = Math.max(LOT_SIZE, Math.floor(rawAmountSui / LOT_SIZE) * LOT_SIZE);

  if (amountSui !== rawAmountSui) {
    console.log(`[DeepBook] Adjusted quantity from ${rawAmountSui} to ${amountSui} SUI (lot size: ${LOT_SIZE})`);
  }

  console.log(`[DeepBook] Routing unmatched ${sideLabel} intent to DeepBook V3...`);
  console.log(`[DeepBook] Amount: ${amountSui} SUI | Intent: ${intent.id}`);

  try {
    const price = await getSuiUsdcPrice();
    console.log(`[DeepBook] SUI/USDC — last: $${price.last_price} | bid: $${price.highest_bid} | ask: $${price.lowest_ask}`);

    // Single transaction: deposit + market order
    console.log(`[DeepBook] Depositing ${amountSui} SUI and placing ${sideLabel} market order...`);
    const orderTx = new Transaction();
    orderTx.setGasBudget(100_000_000);

    const [depositCoin] = orderTx.splitCoins(orderTx.gas, [
      orderTx.pure.u64(BigInt(Math.round(amountSui * 1e9)))
    ]);

    orderTx.moveCall({
      target: `0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c::balance_manager::deposit`,
      typeArguments: [`0x2::sui::SUI`],
      arguments: [
        orderTx.sharedObjectRef({
          objectId: BALANCE_MANAGER_ID,
          initialSharedVersion: BALANCE_MANAGER_VERSION,
          mutable: true,
        }),
        depositCoin,
      ],
    });

    dbClient.deepBook.placeMarketOrder({
      poolKey: POOL_KEY,
      balanceManagerKey: BALANCE_MANAGER_KEY,
      clientOrderId: Date.now(),
      quantity: amountSui,
      isBid,
      payWithDeep: false,
    })(orderTx);

    const orderResult = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: orderTx,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: orderResult.digest });
    console.log(`[DeepBook] Deposit + order confirmed: ${orderResult.digest}`);

    // Withdraw both SUI and DBUSDC to intent owner
    console.log(`[DeepBook] Withdrawing proceeds to ${intent.owner}...`);
    const withdrawTx = new Transaction();
    withdrawTx.setGasBudget(50_000_000);

    dbClient.balanceManager.withdrawAllFromManager(
      BALANCE_MANAGER_KEY,
      "SUI",
      intent.owner
    )(withdrawTx);
    dbClient.balanceManager.withdrawAllFromManager(
      BALANCE_MANAGER_KEY,
      "DBUSDC",
      intent.owner
    )(withdrawTx);

    const withdrawResult = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: withdrawTx,
      options: { showEffects: true, showBalanceChanges: true },
    });
    await client.waitForTransaction({ digest: withdrawResult.digest });
    console.log(`[DeepBook] Withdrawal confirmed: ${withdrawResult.digest}`);

    // Log balance changes
    const changes = withdrawResult.balanceChanges ?? [];
    for (const change of changes) {
      if (change.owner?.AddressOwner === intent.owner) {
        console.log(`[DeepBook] Sent to owner: ${change.amount} of ${change.coinType}`);
      }
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
      orderDigest: orderResult.digest,
      withdrawDigest: withdrawResult.digest,
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
