import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/mac/darkbook/backend/.env" });

const PACKAGE_ID = process.env.PACKAGE_ID;
const VAULT_ID = process.env.VAULT_ID;
const VAULT_INITIAL_VERSION = Number(process.env.VAULT_INITIAL_VERSION);
const BACKEND_URL = "http://localhost:3001";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

const keypair = Ed25519Keypair.deriveKeypair(
  "result begin dress patrol dream control flavor wheat snow this axis love"
);
const address = keypair.getPublicKey().toSuiAddress();
console.log("Wallet address:", address);

const amountMist = BigInt(1_000_000_000);
const minPriceScaled = 500_000;
const sideU8 = 1;
const expiresAt = Date.now() + 120_000;

const tx = new Transaction();
tx.setGasBudget(50_000_000);
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
tx.moveCall({
  target: `${PACKAGE_ID}::vault::deposit_and_intent`,
  arguments: [
    tx.sharedObjectRef({ objectId: VAULT_ID, initialSharedVersion: VAULT_INITIAL_VERSION, mutable: true }),
    coin,
    tx.pure.u8(sideU8),
    tx.pure.u64(minPriceScaled),
    tx.pure.u64(expiresAt),
  ],
});

console.log("Submitting deposit_and_intent transaction...");
const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true },
});
await client.waitForTransaction({ digest: result.digest });
console.log("Transaction digest:", result.digest);

// Use backend proxy to get full tx details
await new Promise(resolve => setTimeout(resolve, 1500));
const txRes = await fetch(`${BACKEND_URL}/tx/${result.digest}`);
const txDetails = await txRes.json();

const events = txDetails?.events ?? [];
const depositedEvent = events.find(e => e.type?.includes("::vault::Deposited"));
const objectChanges = txDetails?.objectChanges ?? [];
const intentObjChange = objectChanges.find(
  c => c.type === "created" && c.objectType?.includes("::vault::Intent")
);

const onChainId = depositedEvent?.parsedJson?.intent_id ?? intentObjChange?.objectId;
const initialSharedVersion = Number(intentObjChange?.owner?.Shared?.initial_shared_version ?? 0);

console.log("Intent ID:", onChainId);
console.log("Initial Shared Version:", initialSharedVersion);

const res = await fetch(`${BACKEND_URL}/intent`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    owner: address,
    side: sideU8,
    amount: amountMist.toString(),
    min_price: minPriceScaled,
    onChainId,
    initialSharedVersion,
  }),
});

const data = await res.json();
console.log("Backend response:", JSON.stringify(data, null, 2));
console.log("\n✅ Intent submitted! ID:", data.intentId);
console.log("Waiting 2 minutes for DeepBook routing...");
console.log("Polling /routing/:intentId every 5s...");

// Poll for routing result
let routed = false;
for (let i = 0; i < 30; i++) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  const routeRes = await fetch(`${BACKEND_URL}/routing/${data.intentId}`);
  const routeData = await routeRes.json();
  console.log(`Poll ${i+1}: ${routeData.status}`);
  if (routeData.status === "routed") {
    console.log("✅ Routed to DeepBook!", JSON.stringify(routeData, null, 2));
    routed = true;
    break;
  }
}
if (!routed) console.log("Not routed yet after polling.");
