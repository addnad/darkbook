import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { DeepBookClient } from "@mysten/deepbook-v3";
import dotenv from "dotenv";
dotenv.config();

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const { secretKey } = decodeSuiPrivateKey(process.env.MATCHER_PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.getPublicKey().toSuiAddress();

console.log("Matcher address:", address);

const dbClient = new DeepBookClient({
  address,
  network: "testnet",
  client,
});

const tx = new Transaction();
dbClient.balanceManager.createAndShareBalanceManager()(tx);

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true },
});

await client.waitForTransaction({ digest: result.digest });

const balanceManager = result.objectChanges?.find(
  (o) => o.type === "created" && o.objectType?.includes("BalanceManager")
);

console.log("✅ BalanceManager created!");
console.log("Digest:", result.digest);
console.log("BalanceManager ID:", balanceManager?.objectId);
console.log("Initial Version:", balanceManager?.version);
console.log("\nAdd this to your .env:");
console.log(`BALANCE_MANAGER_ID=${balanceManager?.objectId}`);
console.log(`BALANCE_MANAGER_VERSION=${balanceManager?.version}`);
