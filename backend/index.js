import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import dotenv from "dotenv";

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
    arguments: [
      vault,
      intentARef,
      intentBRef,
      tx.pure.u64(agreedPrice),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  await client.waitForTransaction({ digest: result.digest });
  return result;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", matcher: matcherAddress });
});

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
    pendingIntents.delete(matchedId);

    try {
      const result = await settleOnChain(intent, matchedIntent);
      console.log("Settled:", result.digest);
      return res.json({
        status: "matched",
        digest: result.digest,
        matchedWith: matchedIntent.owner,
      });
    } catch (err) {
      console.error("Settle failed:", err.message);
      pendingIntents.set(matchedId, matchedIntent);
      return res.status(500).json({ error: "Settlement failed", detail: err.message });
    }
  } else {
    pendingIntents.set(intent.id, intent);
    console.log("Intent queued, pending match. Total pending:", pendingIntents.size);
    return res.json({
      status: "pending",
      intentId: intent.id,
      message: "Intent queued, waiting for counterparty",
    });
  }
});

app.get("/intents", (req, res) => {
  const intents = Array.from(pendingIntents.values()).map((i) => ({
    id: i.id,
    side: i.side === 0 ? "buy" : "sell",
    amount: i.amount,
    min_price: i.min_price,
    createdAt: i.createdAt,
  }));
  res.json({ count: intents.length, intents });
});

app.get("/intent/:id", (req, res) => {
  const intent = pendingIntents.get(req.params.id);
  if (!intent) {
    return res.json({ status: "matched_or_unknown" });
  }
  res.json({ status: "pending", intent });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("DarkBook intent engine running on port " + PORT);
});
