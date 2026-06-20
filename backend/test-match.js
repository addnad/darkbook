import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import dotenv from "dotenv";
dotenv.config();

const BACKEND = process.env.BACKEND_URL || "http://localhost:3001";
const PACKAGE_ID = process.env.PACKAGE_ID;
const VAULT_ID = process.env.VAULT_ID;
const VAULT_INITIAL_VERSION = Number(process.env.VAULT_INITIAL_VERSION);

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

function kp(envName) {
  const raw = process.env[envName];
  if (!raw) throw new Error(`Missing ${envName} env var`);
  const { secretKey } = decodeSuiPrivateKey(raw.trim());
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function deposit(keypair, side, amountSui, minPriceUsd) {
  const owner = keypair.getPublicKey().toSuiAddress();
  const amountMist = BigInt(Math.round(amountSui * 1e9));
  const minPriceScaled = Math.round(minPriceUsd * 1e6);
  const expiresAt = Date.now() + 120_000;

  const tx = new Transaction();
  tx.setGasBudget(50_000_000);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::deposit_and_intent`,
    arguments: [
      tx.sharedObjectRef({ objectId: VAULT_ID, initialSharedVersion: VAULT_INITIAL_VERSION, mutable: true }),
      coin,
      tx.pure.u8(side),
      tx.pure.u64(minPriceScaled),
      tx.pure.u64(expiresAt),
    ],
  });

  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== "success") {
    throw new Error(`Deposit failed: ${res.effects?.status?.error}`);
  }

  const created = (res.objectChanges || []).find(
    (c) => c.type === "created" && c.objectType?.endsWith("::vault::Intent")
  );
  if (!created) throw new Error("No Intent object created");

  const initialSharedVersion =
    created.owner?.Shared?.initial_shared_version ?? created.version;

  console.log(`  [${side === 0 ? "BUY " : "SELL"}] ${owner.slice(0,10)}… deposited ${amountSui} SUI @ $${minPriceUsd}`);
  console.log(`        intent: ${created.objectId}`);

  return { owner, onChainId: created.objectId, initialSharedVersion: Number(initialSharedVersion), side, amountMist: amountMist.toString(), minPriceScaled };
}

async function postIntent(d) {
  const res = await fetch(`${BACKEND}/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: d.owner,
      side: d.side,
      amount: d.amountMist,
      min_price: d.minPriceScaled,
      onChainId: d.onChainId,
      initialSharedVersion: d.initialSharedVersion,
    }),
  });
  return res.json();
}

async function main() {
  console.log("=== DarkBook dark pool match test ===");
  console.log(`Backend: ${BACKEND}`);
  console.log(`Vault:   ${VAULT_ID} (v${VAULT_INITIAL_VERSION})\n`);

  const buyer = kp("BUYER_KEY");
  const seller = kp("SELLER_KEY");

  console.log("Step 1 - on-chain deposits:");
  const buyIntent = await deposit(buyer, 0, 1.0, 0.65);
  const sellIntent = await deposit(seller, 1, 1.0, 0.65);

  console.log("\nStep 2 - submit buyer intent (will queue):");
  const r1 = await postIntent(buyIntent);
  console.log(" ", JSON.stringify(r1));

  console.log("\nStep 3 - submit seller intent (should match + settle):");
  const r2 = await postIntent(sellIntent);
  console.log(" ", JSON.stringify(r2));

  console.log("\n=== RESULT ===");
  if (r2.status === "matched") {
    console.log(`MATCHED & SETTLED on-chain`);
    console.log(`   digest: ${r2.digest}`);
    console.log(`   price:  ${r2.price}`);
  } else {
    console.log(`Not matched. Response: ${JSON.stringify(r2)}`);
  }
}

main().catch((e) => { console.error("Test error:", e.message); process.exit(1); });
