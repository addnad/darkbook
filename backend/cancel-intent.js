import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import dotenv from "dotenv";
dotenv.config();

const PACKAGE_ID = process.env.PACKAGE_ID;
const VAULT_ID = process.env.VAULT_ID;
const VAULT_INITIAL_VERSION = Number(process.env.VAULT_INITIAL_VERSION);

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

const { secretKey } = decodeSuiPrivateKey("suiprivkey1qzjxljlers46a8c32u00e6e833tqqd60kv44emcngpjcrdfn9ll952cz82f");
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
console.log("Cancelling from:", keypair.getPublicKey().toSuiAddress());

const INTENT_ID = "0x4f8ed919924dd8109e6b72c98879814a7642c6b6865ad4fc7d754b2b1bab040f";
const INTENT_VERSION = 906430848;

const tx = new Transaction();
tx.setGasBudget(50_000_000);
tx.moveCall({
  target: `${PACKAGE_ID}::vault::cancel`,
  arguments: [
    tx.sharedObjectRef({ objectId: VAULT_ID, initialSharedVersion: VAULT_INITIAL_VERSION, mutable: true }),
    tx.sharedObjectRef({ objectId: INTENT_ID, initialSharedVersion: INTENT_VERSION, mutable: true }),
  ],
});

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true },
});

await client.waitForTransaction({ digest: result.digest });
console.log("Status:", result.effects?.status?.status);
console.log("Digest:", result.digest);
