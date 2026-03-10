import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  prepareRegistrationKeys,
  toBase64,
  type SignedPreKey,
} from "@haven-chat-org/core";
import { downloadAndRestoreBackup, cacheSecurityPhrase } from "../lib/backup.js";
import { useAuthStore, persistIdentityKey } from "../store/auth.js";
import { clearCryptoState } from "../lib/crypto.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

const PREKEY_BATCH_SIZE = 20;

export default function SecurityPhraseRestore() {
  const { t } = useTranslation();
  const completeBackupSetup = useAuthStore((s) => s.completeBackupSetup);

  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const handleRestore = useCallback(async () => {
    if (!phrase.trim()) return;
    setRestoring(true);
    setError("");
    try {
      await downloadAndRestoreBackup(phrase.trim());
      cacheSecurityPhrase(phrase.trim());

      // After restore, upload fresh one-time prekeys and re-register the
      // restored signed prekey (identity key + signed prekey came from backup).
      // We must NOT generate a new signed prekey here — reuse the one from the
      // backup so pending X3DH initial messages (sent using the old key bundle)
      // can still be decrypted.
      const { api, identityKeyPair, signedPreKey, store } = useAuthStore.getState();
      if (identityKeyPair && signedPreKey) {
        const oneTimeKeys = generateOneTimePreKeys(PREKEY_BATCH_SIZE);
        await store.saveIdentityKeyPair(identityKeyPair);
        await store.saveSignedPreKey(signedPreKey);
        await store.saveOneTimePreKeys(oneTimeKeys);

        const keys = prepareRegistrationKeys(identityKeyPair, signedPreKey as SignedPreKey, oneTimeKeys);
        await Promise.all([
          api.updateKeys({
            identity_key: keys.identity_key,
            signed_prekey: keys.signed_prekey,
            signed_prekey_signature: keys.signed_prekey_signature,
          }),
          api.uploadPreKeys({ prekeys: keys.one_time_prekeys }),
        ]);
      }

      completeBackupSetup();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Restore failed";
      if (msg.includes("wrong secret key") || msg.includes("ciphertext")) {
        setError(t("securityPhraseRestore.incorrectPhrase"));
      } else {
        setError(msg);
      }
      setRestoring(false);
    }
  }, [phrase, completeBackupSetup, t]);

  const handleSkip = useCallback(async () => {
    // Generate fresh keys — historical messages won't be readable
    setRestoring(true);
    try {
      const { api, user, store } = useAuthStore.getState();
      if (!user) return;

      clearCryptoState();
      const identity = generateIdentityKeyPair();
      persistIdentityKey(user.id, identity);
      const signedPre = generateSignedPreKey(identity);
      const oneTimeKeys = generateOneTimePreKeys(PREKEY_BATCH_SIZE);

      await store.saveIdentityKeyPair(identity);
      await store.saveSignedPreKey(signedPre);
      await store.saveOneTimePreKeys(oneTimeKeys);

      const keys = prepareRegistrationKeys(identity, signedPre, oneTimeKeys);
      await Promise.all([
        api.updateKeys({
          identity_key: keys.identity_key,
          signed_prekey: keys.signed_prekey,
          signed_prekey_signature: keys.signed_prekey_signature,
        }),
        api.uploadPreKeys({ prekeys: keys.one_time_prekeys }),
      ]);

      useAuthStore.setState({
        identityKeyPair: identity,
        signedPreKey: signedPre,
      });
      completeBackupSetup();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("securityPhraseRestore.failedGenerateKeys"));
      setRestoring(false);
    }
  }, [completeBackupSetup, t]);

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-dialog" style={{ maxWidth: 460 }} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="security-restore-title">
        <h2 style={{ marginBottom: 8 }} id="security-restore-title">{t("securityPhraseRestore.title")}</h2>
        <p className="security-phrase-desc">
          {t("securityPhraseRestore.desc")}
        </p>
        <label className="security-phrase-label">{t("securityPhraseRestore.phraseLabel")}</label>
        <input
          type="password"
          className="modal-input"
          placeholder={t("securityPhraseRestore.phrasePlaceholder")}
          value={phrase}
          onChange={(e) => { setPhrase(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleRestore()}
          autoFocus
          disabled={restoring}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="security-phrase-actions">
          <button
            className="security-phrase-skip"
            onClick={handleSkip}
            disabled={restoring}
          >
            {t("securityPhraseRestore.skipGenerateNewKeys")}
          </button>
          <button
            className="btn-primary"
            onClick={handleRestore}
            disabled={restoring || !phrase.trim()}
          >
            {restoring ? t("securityPhraseRestore.restoring") : t("securityPhraseRestore.restoreKeys")}
          </button>
        </div>
        <p className="security-phrase-warning">
          {t("securityPhraseRestore.skipWarning")}
        </p>
      </div>
    </div>
  );
}
