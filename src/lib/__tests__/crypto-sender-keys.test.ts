/**
 * Integration tests for sender key self-copy logic in crypto.ts.
 *
 * These tests verify that ensureSenderKeyDistributed() stores a cloned copy
 * of the sender key in receivedSenderKeys so that decryptIncoming() can
 * decrypt the user's own group messages after session restore.
 *
 * Pure crypto correctness (encrypt/decrypt round-trips, chain ratcheting)
 * is covered in haven-core/src/crypto/sender-keys.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Hoisted mock values (available inside vi.mock factories) ───

const mocks = vi.hoisted(() => ({
  fakeDistId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
  fakeChainKey: new Uint8Array(32).fill(0xab),
  callCount: 0,
}));

// ─── Mock @haven-chat-org/core (avoid libsodium dependency in jsdom) ─────

vi.mock("@haven-chat-org/core", () => ({
  // Sender key functions under test
  generateSenderKey: vi.fn(() => {
    mocks.callCount++;
    const distId = new Uint8Array(mocks.fakeDistId);
    distId[0] = mocks.callCount; // Make each generation unique
    return {
      distributionId: distId,
      chainKey: new Uint8Array(mocks.fakeChainKey),
      chainIndex: 0,
    };
  }),
  createSkdmPayload: vi.fn(() => new Uint8Array(52)),
  encryptSkdm: vi.fn(() => new Uint8Array(80)),
  decryptSkdm: vi.fn(() => new Uint8Array(52)),
  parseSkdmPayload: vi.fn(() => ({
    distributionId: new Uint8Array(16),
    chainKey: new Uint8Array(32),
    chainIndex: 0,
  })),
  senderKeyEncrypt: vi.fn(() => new Uint8Array(100)),
  senderKeyDecrypt: vi.fn(() => new Uint8Array(0)),
  GROUP_MSG_TYPE: 0x03,

  // Utility functions
  toBase64: vi.fn((arr: Uint8Array) =>
    Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join(""),
  ),
  fromBase64: vi.fn(() => new Uint8Array(0)),
  randomBytes: vi.fn((n: number) => new Uint8Array(n)),
  initSodium: vi.fn(async () => {}),

  // DM / X3DH stubs (not exercised in these tests)
  DoubleRatchetSession: class {},
  serializeMessage: vi.fn(),
  deserializeMessage: vi.fn(),
  x3dhInitiate: vi.fn(),
  x3dhRespond: vi.fn(),

  // Auth store dependencies: HavenApi, MemoryStore (must be constructable)
  HavenApi: class {
    setAccessToken() {}
    getChannelMemberKeys() { return Promise.resolve([]); }
    distributeSenderKeys() { return Promise.resolve(undefined); }
  },
  MemoryStore: class {
    getSignedPreKey() {}
    consumeOneTimePreKey() {}
  },
  isLoginSuccess: vi.fn(() => false),
  generateIdentityKeyPair: vi.fn(),
  generateSignedPreKey: vi.fn(),
  generateOneTimePreKeys: vi.fn(),
  prepareRegistrationKeys: vi.fn(),
  verifySignature: vi.fn(),
  generateProfileKey: vi.fn(),
  encryptProfile: vi.fn(),
  decryptProfile: vi.fn(),
  encryptProfileKeyFor: vi.fn(),
  decryptProfileKey: vi.fn(),
  encryptProfileToBase64: vi.fn(),
  decryptProfileFromBase64: vi.fn(),
  encryptBackup: vi.fn(),
  decryptBackup: vi.fn(),
  deriveBackupKey: vi.fn(),
  generateRecoveryKey: vi.fn(),
  generatePassphrase: vi.fn(),
  getSodium: vi.fn(() => ({})),
}));

// ─── Mock sibling modules (prevent real timers/IO) ──────────────

vi.mock("../backup.js", () => ({
  scheduleAutoBackup: vi.fn(),
  checkBackupStatus: vi.fn(async () => false),
  clearCachedPhrase: vi.fn(),
}));

vi.mock("../crypto-store.js", () => ({
  persistCryptoState: vi.fn(async () => {}),
  loadCryptoState: vi.fn(async () => false),
  clearCryptoStore: vi.fn(async () => {}),
}));

vi.mock("../message-cache.js", () => ({
  clearMessageCache: vi.fn(),
}));

vi.mock("../notifications.js", () => ({
  initNotifications: vi.fn(),
}));

// ─── Imports (after mocks are registered) ───────────────────────

import {
  ensureSenderKeyDistributed,
  exportCryptoState,
  clearCryptoState,
  invalidateSenderKey,
} from "../crypto.js";
import { useAuthStore } from "../../store/auth.js";

// ─── Test setup ─────────────────────────────────────────────────

function setupAuthStore(userId = "user-1") {
  const mockApi = {
    getChannelMemberKeys: vi.fn().mockResolvedValue([]),
    distributeSenderKeys: vi.fn().mockResolvedValue(undefined),
  };

  useAuthStore.setState({
    user: { id: userId } as any,
    identityKeyPair: {
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    } as any,
    api: mockApi as any,
  });

  return mockApi;
}

beforeEach(() => {
  clearCryptoState();
  mocks.callCount = 0;
});

// ─── Tests ──────────────────────────────────────────────────────

describe("ensureSenderKeyDistributed — self-copy in receivedSenderKeys", () => {
  it("stores a self-copy when generating a new sender key", async () => {
    setupAuthStore("user-1");

    await ensureSenderKeyDistributed("ch-1");

    const { mySenderKeys, receivedSenderKeys } = exportCryptoState();

    // mySenderKeys should have an entry for this channel
    expect(mySenderKeys.has("ch-1")).toBe(true);

    // receivedSenderKeys should have exactly one entry (the self-copy)
    expect(receivedSenderKeys.size).toBe(1);

    const selfEntry = [...receivedSenderKeys.values()][0];
    expect(selfEntry.fromUserId).toBe("user-1");
  });

  it("self-copy has matching distributionId, chainKey, and chainIndex", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");

    const { mySenderKeys, receivedSenderKeys } = exportCryptoState();
    const senderKey = mySenderKeys.get("ch-1")!;
    const selfEntry = [...receivedSenderKeys.values()][0];

    expect(selfEntry.key.distributionId).toEqual(senderKey.distributionId);
    expect(selfEntry.key.chainKey).toEqual(senderKey.chainKey);
    expect(selfEntry.key.chainIndex).toBe(senderKey.chainIndex);
  });

  it("self-copy buffers are independent clones (not references)", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");

    const { mySenderKeys, receivedSenderKeys } = exportCryptoState();
    const senderKey = mySenderKeys.get("ch-1")!;
    const selfEntry = [...receivedSenderKeys.values()][0];

    // Same values but different Uint8Array instances
    expect(selfEntry.key.distributionId).not.toBe(senderKey.distributionId);
    expect(selfEntry.key.chainKey).not.toBe(senderKey.chainKey);

    // Mutating the sender key should NOT affect the self-copy
    const origChainKey = new Uint8Array(selfEntry.key.chainKey);
    senderKey.chainKey[0] = 0xff;
    expect(selfEntry.key.chainKey).toEqual(origChainKey);
    expect(selfEntry.key.chainKey[0]).not.toBe(0xff);
  });

  it("does not create a duplicate self-copy on second call (same channel)", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");
    await ensureSenderKeyDistributed("ch-1"); // second call — key already exists

    const { receivedSenderKeys } = exportCryptoState();
    const selfEntries = [...receivedSenderKeys.values()].filter(
      (e) => e.fromUserId === "user-1",
    );
    expect(selfEntries.length).toBe(1);
  });

  it("creates separate self-copies for different channels", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");
    await ensureSenderKeyDistributed("ch-2");

    const { mySenderKeys, receivedSenderKeys } = exportCryptoState();
    expect(mySenderKeys.size).toBe(2);

    const selfEntries = [...receivedSenderKeys.values()].filter(
      (e) => e.fromUserId === "user-1",
    );
    expect(selfEntries.length).toBe(2);

    // Each self-copy should have a different distribution ID
    expect(selfEntries[0].key.distributionId).not.toEqual(
      selfEntries[1].key.distributionId,
    );
  });

  it("generates new self-copy after invalidateSenderKey + re-distribute", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");
    const { mySenderKeys } = exportCryptoState();
    const origDistId = new Uint8Array(mySenderKeys.get("ch-1")!.distributionId);

    // Invalidate forces re-generation on next call
    invalidateSenderKey("ch-1");
    expect(mySenderKeys.has("ch-1")).toBe(false);

    await ensureSenderKeyDistributed("ch-1");
    const newDistId = mySenderKeys.get("ch-1")!.distributionId;

    // New key should have a different distribution ID
    expect(newDistId).not.toEqual(origDistId);

    // There should be two entries in receivedSenderKeys: old and new self-copies
    // (old one is stale but still there for decrypting old messages)
    const { receivedSenderKeys } = exportCryptoState();
    const selfEntries = [...receivedSenderKeys.values()].filter(
      (e) => e.fromUserId === "user-1",
    );
    expect(selfEntries.length).toBe(2);
  });

  it("does not store self-copy if user is not set in auth store", async () => {
    useAuthStore.setState({
      user: null as any,
      identityKeyPair: {
        publicKey: new Uint8Array(32),
        privateKey: new Uint8Array(64),
      } as any,
      api: {
        getChannelMemberKeys: vi.fn().mockResolvedValue([]),
        distributeSenderKeys: vi.fn().mockResolvedValue(undefined),
      } as any,
    });

    await ensureSenderKeyDistributed("ch-1");

    const { mySenderKeys, receivedSenderKeys } = exportCryptoState();
    // Sender key should still be generated
    expect(mySenderKeys.has("ch-1")).toBe(true);
    // But no self-copy (no userId to key it with)
    expect(receivedSenderKeys.size).toBe(0);
  });
});

describe("clearCryptoState", () => {
  it("clears all sender keys and self-copies", async () => {
    setupAuthStore();

    await ensureSenderKeyDistributed("ch-1");
    await ensureSenderKeyDistributed("ch-2");

    const state = exportCryptoState();
    expect(state.mySenderKeys.size).toBe(2);
    expect(state.receivedSenderKeys.size).toBe(2);

    clearCryptoState();

    expect(state.mySenderKeys.size).toBe(0);
    expect(state.receivedSenderKeys.size).toBe(0);
    expect(state.distributedChannels.size).toBe(0);
  });
});
