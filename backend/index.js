import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import dotenv from "dotenv";
import { getSuiUsdcPrice, getOrderBook, getRecentTrades, routeToDeepBook } from "./deepbook.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const { secretKey } = decodeSuiPrivateKey(process.env.MATCHER_PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const matcherAddress = keypair.getPublicKey().toSuiAddress();

console.log("Matcher address:", matcherAddress);

const PACKAGE_ID = process.env.PACKAGE_ID;
const VAULT_ID = process.env.VAULT_ID;
const VAULT_INITIAL_VERSION = Number(process.env.VAULT_INITIAL_VERSION);
const MATCH_TIMEOUT_MS = 120000; // 30 seconds before routing to DeepBook

const pendingIntents = new Map();

function findMatch(newIntent) {
  for (const [id, intent] of pendingIntents.entries()) {
    if (intent.side === newIntent.side) continue;
    if (intent.owner === newIntent.owner) continue;
    const buyer  = newIntent.side === 0 ? newIntent : intent;
    const seller = newIntent.side === 1 ? newIntent : intent;
    if (buyer.min_price >= seller.min_price) {
      return { matchedId: id, matchedIntent: intent };
    }
  }
  return null;
}

async function settleOnChain(intentA, intentB) {
  const agreedPrice = BigInt(Math.floor((intentA.min_price + intentB.min_price) / 2));

  const tx = new Transaction();
  tx.setGasBudget(50000000);

  const vault = tx.sharedObjectRef({
    objectId: VAULT_ID,
    initialSharedVersion: VAULT_INITIAL_VERSION,
    mutable: true,
  });

  const intentARef = tx.sharedObjectRef({
    objectId: intentA.onChainId,
    initialSharedVersion: intentA.initialSharedVersion,
    mutable: true,
  });

  const intentBRef = tx.sharedObjectRef({
    objectId: intentB.onChainId,
    initialSharedVersion: intentB.initialSharedVersion,
    mutable: true,
  });

  tx.moveCall({
    target: PACKAGE_ID + "::vault::settle",
    arguments: [vault, intentARef, intentBRef, tx.pure.u64(agreedPrice)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  await client.waitForTransaction({ digest: result.digest });
  return result;
}

function scheduleDeepBookFallback(intent) {
  const timer = setTimeout(async () => {
    if (!pendingIntents.has(intent.id)) return; // already matched
    console.log(`[DeepBook] Intent ${intent.id} unmatched after ${MATCH_TIMEOUT_MS/1000}s — routing to DeepBook`);
    pendingIntents.delete(intent.id);
    try {
      const result = await routeToDeepBook(intent, PACKAGE_ID, VAULT_ID);
      console.log("[DeepBook] Routed:", result);
    } catch (err) {
      console.error("[DeepBook] Routing failed:", err.message);
    }
  }, MATCH_TIMEOUT_MS);
  return timer;
}

// === Routes ===

app.get("/health", (req, res) => {
  res.json({ status: "ok", matcher: matcherAddress, network: "testnet" });
});

// DeepBook all pairs
app.get("/deepbook/pairs", async (req, res) => {
  try {
    const res2 = await fetch("https://deepbook-indexer.testnet.mystenlabs.com/summary");
    const data = await res2.json();
    const pairs = data.map(p => ({
      pool: p.trading_pairs,
      base: p.base_currency,
      quote: p.quote_currency,
      last_price: p.last_price,
      highest_bid: p.highest_bid,
      lowest_ask: p.lowest_ask,
      price_change_24h: p.price_change_percent_24h,
      base_volume: p.base_volume,
    })).filter(p => p.highest_bid > 0 || p.lowest_ask > 0);
    res.json({ count: pairs.length, pairs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DeepBook price feed — ?pool=SUI_DBUSDC (default)
app.get("/deepbook/price", async (req, res) => {
  try {
    const pool = req.query.pool || "SUI_DBUSDC";
    const price = await getSuiUsdcPrice(pool);
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DeepBook order book depth
app.get("/deepbook/orderbook", async (req, res) => {
  try {
    const depth = parseInt(req.query.depth) || 10;
    const book = await getOrderBook(depth);
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DeepBook recent trades
app.get("/deepbook/trades", async (req, res) => {
  try {
    const trades = await getRecentTrades(20);
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit intent
app.post("/intent", async (req, res) => {
  const { owner, side, amount, min_price, onChainId, initialSharedVersion } = req.body;
  if (!owner || side === undefined || !amount || !min_price || !onChainId || !initialSharedVersion) {
    return res.status(400).json({ error: "Missing required fields: owner, side, amount, min_price, onChainId, initialSharedVersion" });
  }

  const intent = {
    id: uuidv4(),
    owner,
    side,
    amount,
    min_price,
    onChainId,
    initialSharedVersion,
    createdAt: Date.now(),
  };

  console.log("New intent:", intent);

  const match = findMatch(intent);

  if (match) {
    const { matchedId, matchedIntent } = match;
    console.log("Match found! Settling...", intent.id, "<>", matchedId);
    clearTimeout(matchedIntent.timer);
    pendingIntents.delete(matchedId);

    try {
      const result = await settleOnChain(intent, matchedIntent);
      console.log("Settled:", result.digest);
      return res.json({
        status: "matched",
        venue: "darkpool",
        digest: result.digest,
        matchedWith: matchedIntent.owner,
        price: Math.floor((intent.min_price + matchedIntent.min_price) / 2),
      });
    } catch (err) {
      console.error("Settle failed:", err.message);
      pendingIntents.set(matchedId, matchedIntent);
      return res.status(500).json({ error: "Settlement failed", detail: err.message });
    }
  } else {
    // No peer match — queue with DeepBook fallback timer
    intent.timer = scheduleDeepBookFallback(intent);
    pendingIntents.set(intent.id, intent);
    console.log("Intent queued, pending match. Total pending:", pendingIntents.size);
    return res.json({
      status: "pending",
      intentId: intent.id,
      message: "Intent queued — will route to DeepBook if unmatched in 30s",
      fallback: "DeepBook",
    });
  }
});

// Get all pending intents
app.get("/intents", (req, res) => {
  const intents = Array.from(pendingIntents.values()).map((i) => ({
    id: i.id,
    side: i.side === 0 ? "buy" : "sell",
    amount: i.amount,
    min_price: i.min_price,
    createdAt: i.createdAt,
    expiresAt: i.createdAt + MATCH_TIMEOUT_MS,
  }));
  res.json({ count: intents.length, intents });
});

// Get specific intent status
app.get("/intent/:id", (req, res) => {
  const intent = pendingIntents.get(req.params.id);
  if (!intent) {
    return res.json({ status: "matched_or_routed" });
  }
  res.json({
    status: "pending",
    timeRemaining: Math.max(0, (intent.createdAt + MATCH_TIMEOUT_MS) - Date.now()),
    intent,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("DarkBook intent engine running on port " + PORT);
});

// Get transaction details (used by frontend to extract Intent object)
app.get("/tx/:digest", async (req, res) => {
  try {
    const tx = await client.getTransactionBlock({
      digest: req.params.digest,
      options: { showObjectChanges: true, showEvents: true },
    });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
