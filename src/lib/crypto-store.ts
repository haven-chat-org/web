/**
 * IndexedDB-backed persistence for encrypted E2EE session state.
 * Stores Double Ratchet sessions and sender keys so they survive logout.
 *
 * Encryption: BLAKE2b key derivation from identity private key + XSalsa20-Poly1305.
 * Same security boundary as localStorage (identity key already stored there).
 */

import { getSodium } from "@haven-chat-org/core";

const DB_NAME = "haven-crypto";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const KEY_CONTEXT = new TextEncoder().encode("haven-local-crypto-store");

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function deriveStorageKey(identityPrivateKey: Uint8Array): Uint8Array {
  const sodium = getSodium();
  return sodium.crypto_generichash(
    sodium.crypto_secretbox_KEYBYTES, // 32
    KEY_CONTEXT,
    identityPrivateKey,
  );
}

/**
 * Persist the current crypto state to IndexedDB, encrypted with a key
 * derived from the identity private key. Reuses buildBackupPayload()
 * for serialization.
 */
export async function persistCryptoState(
  userId: string,
  identityPrivateKey: Uint8Array,
): Promise<void> {
  // Dynamic import to avoid circular dependency (backup.ts → crypto.ts → crypto-store.ts)
  const { buildBackupPayload } = await import("./backup.js");

  const sodium = getSodium();
  const payload = buildBackupPayload();
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const key = deriveStorageKey(identityPrivateKey);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(plaintext, nonce, key);

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      userId,
      encrypted,
      nonce,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load and decrypt crypto state from IndexedDB, restoring all sessions
 * and sender keys into memory. Returns true if successful.
 */
export async function loadCryptoState(
  userId: string,
  identityPrivateKey: Uint8Array,
): Promise<boolean> {
  const { restoreCryptoFromPayload } = await import("./backup.js");

  const db = await openDb();
  const record = await new Promise<{ encrypted: Uint8Array; nonce: Uint8Array } | null>(
    (resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    },
  );

  if (!record) return false;

  try {
    const sodium = getSodium();
    const key = deriveStorageKey(identityPrivateKey);
    const plaintext = sodium.crypto_secretbox_open_easy(
      record.encrypted,
      record.nonce,
      key,
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    restoreCryptoFromPayload(payload);
    return true;
  } catch {
    // Decryption failed (wrong key, corrupted data) — discard silently
    return false;
  }
}

/**
 * Clear persisted crypto state. Call when identity key changes
 * (old sessions are useless with a new key).
 */
export async function clearCryptoStore(userId?: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    if (userId) {
      tx.objectStore(STORE_NAME).delete(userId);
    } else {
      tx.objectStore(STORE_NAME).clear();
    }
  } catch {
    // Silently fail
  }
}
