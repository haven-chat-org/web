import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { QRCodeSVG } from "qrcode.react";
import { generateRecoveryKey, generatePassphrase } from "@haven-chat-org/core";
import {
  uploadBackup,
  cacheSecurityPhrase,
  getCachedPhrase,
  checkBackupStatus,
  verifyBackupPhrase,
} from "../../lib/backup.js";

export default function SecurityTab() {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const user = useAuthStore((s) => s.user);

  const [backupExists, setBackupExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Session management
  const [sessions, setSessions] = useState<import("@haven-chat-org/core").SessionResponse[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // TOTP 2FA
  const [totpEnabled, setTotpEnabled] = useState(user?.totp_enabled ?? false);
  type TotpMode = "idle" | "setup" | "disable";
  const [totpMode, setTotpMode] = useState<TotpMode>("idle");
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qr_code_uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpSuccess, setTotpSuccess] = useState("");
  const [totpSaving, setTotpSaving] = useState(false);
  const [totpSecretCopied, setTotpSecretCopied] = useState(false);

  // Change phrase flow
  type Mode = "idle" | "change" | "setup" | "generated";
  const [mode, setMode] = useState<Mode>("idle");
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkBackupStatus()
      .then(({ hasBackup }) => {
        if (!cancelled) {
          setBackupExists(hasBackup);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    // Load sessions
    api.getSessions()
      .then((s) => { if (!cancelled) setSessions(s); })
      .catch(() => { if (!cancelled) setSessionError(t("userSettings.security.failedLoadSessions")); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [api]);

  async function handleRevokeSession(familyId: string) {
    setRevokingId(familyId);
    setSessionError("");
    try {
      await api.revokeSession(familyId);
      setSessions((prev) => prev.filter((s) => s.family_id !== familyId));
    } catch {
      setSessionError(t("userSettings.security.failedRevokeSession"));
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAllOther() {
    setSessionError("");
    const others = sessions.filter((s) => !s.is_current && s.family_id);
    for (const s of others) {
      try {
        await api.revokeSession(s.family_id!);
      } catch { /* continue */ }
    }
    setSessions((prev) => prev.filter((s) => s.is_current));
  }

  async function handleChangePhrase() {
    setError("");
    setSuccess("");
    if (newPhrase.length < 8) {
      setError(t("userSettings.security.changePhrase.phraseMinLength"));
      return;
    }
    if (newPhrase !== confirmPhrase) {
      setError(t("userSettings.security.changePhrase.phrasesDoNotMatch"));
      return;
    }
    setSaving(true);
    try {
      // If we have a cached phrase, use it; otherwise require the current phrase
      const cached = getCachedPhrase();
      if (!cached && !currentPhrase) {
        setError(t("userSettings.security.changePhrase.enterCurrentPhrase"));
        setSaving(false);
        return;
      }
      // Verify current phrase by decrypting the backup (without restoring state)
      if (!cached) {
        await verifyBackupPhrase(currentPhrase);
      }
      // Upload new backup with new phrase
      await uploadBackup(newPhrase);
      cacheSecurityPhrase(newPhrase);
      setSuccess(t("userSettings.security.changePhrase.phraseUpdated"));
      setMode("idle");
      setBackupExists(true);
      setCurrentPhrase("");
      setNewPhrase("");
      setConfirmPhrase("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("userSettings.security.changePhrase.failedUpdate"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSetupWithPhrase(phrase: string) {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await uploadBackup(phrase);
      cacheSecurityPhrase(phrase);
      setBackupExists(true);
      setSuccess(t("userSettings.security.setup.backupCreated"));
      setMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("userSettings.security.setup.failedCreate"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBackup() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api.deleteKeyBackup();
      setBackupExists(false);
      setSuccess(t("userSettings.security.backupDeleted"));
      setMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("userSettings.security.failedDeleteBackup"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTotpSetup() {
    setTotpError("");
    setTotpSuccess("");
    setTotpSaving(true);
    try {
      const data = await api.totpSetup();
      setTotpSetupData(data);
      setTotpMode("setup");
    } catch (e: any) {
      setTotpError(e?.message || t("userSettings.security.totp.setupFailed"));
    } finally {
      setTotpSaving(false);
    }
  }

  async function handleTotpVerify() {
    setTotpError("");
    setTotpSaving(true);
    try {
      await api.totpVerify({ code: totpCode });
      setTotpEnabled(true);
      setTotpMode("idle");
      setTotpSetupData(null);
      setTotpCode("");
      setTotpSuccess(t("userSettings.security.totp.enableSuccess"));
    } catch {
      setTotpError(t("userSettings.security.totp.invalidCode"));
    } finally {
      setTotpSaving(false);
    }
  }

  async function handleTotpDisable() {
    setTotpError("");
    setTotpSaving(true);
    try {
      await api.totpDisable();
      setTotpEnabled(false);
      setTotpMode("idle");
      setTotpSuccess(t("userSettings.security.totp.disableSuccess"));
    } catch (e: any) {
      setTotpError(e?.message || "Failed to disable 2FA");
    } finally {
      setTotpSaving(false);
    }
  }

  if (loading) {
    return <div className="settings-section"><p className="settings-loading">{t("userSettings.security.loading")}</p></div>;
  }

  return (
    <>
    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.security.activeSessions")}</div>
      <p className="settings-description">
        {t("userSettings.security.activeSessionsDesc")}
      </p>
      {sessionsLoading && <p className="settings-loading">{t("userSettings.security.loadingSessions")}</p>}
      {sessionError && <div className="settings-error">{sessionError}</div>}
      {!sessionsLoading && sessions.length > 0 && (
        <div className="session-list">
          {sessions.map((s) => (
            <div key={s.id} className={`session-card${s.is_current ? " session-current" : ""}`}>
              <div className="session-card-info">
                <div className="session-card-device">
                  {s.device_name || t("userSettings.security.unknownDevice")}
                  {s.is_current && <span className="session-badge-current">{t("userSettings.security.current")}</span>}
                </div>
                <div className="session-card-meta">
                  {s.ip_address && <span>{s.ip_address}</span>}
                  {s.last_activity && (
                    <span>{t("userSettings.security.active")} {new Date(s.last_activity).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  )}
                  <span>{t("userSettings.security.created")} {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
              </div>
              {!s.is_current && s.family_id && (
                <button
                  className="btn-secondary btn-danger-outline btn-sm"
                  onClick={() => handleRevokeSession(s.family_id!)}
                  disabled={revokingId === s.family_id}
                >
                  {revokingId === s.family_id ? t("userSettings.security.revoking") : t("userSettings.security.revoke")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!sessionsLoading && sessions.length > 1 && (
        <button
          className="btn-secondary btn-danger-outline"
          style={{ marginTop: 12 }}
          onClick={handleRevokeAllOther}
        >
          {t("userSettings.security.revokeAllOther")}
        </button>
      )}
    </div>

    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.security.totp.title")}</div>
      <p className="settings-description">
        {t("userSettings.security.totp.desc")}
      </p>

      {totpMode === "idle" && (
        <>
          <div className="settings-card" style={{ marginBottom: 16 }}>
            <div className="settings-card-row">
              <div>
                <div className="settings-label">{t("userSettings.security.statusLabel")}</div>
                <div className="settings-value">
                  {totpEnabled ? (
                    <span style={{ color: "var(--green)" }}>{t("userSettings.security.totp.enabled")}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>{t("userSettings.security.totp.disabled")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="security-phrase-actions">
            {totpEnabled ? (
              <button
                className="btn-secondary btn-danger-outline"
                onClick={() => { setTotpMode("disable"); setTotpError(""); setTotpSuccess(""); }}
              >
                {t("userSettings.security.totp.disable")}
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleTotpSetup}
                disabled={totpSaving}
              >
                {totpSaving ? t("userSettings.security.loading") : t("userSettings.security.totp.enable")}
              </button>
            )}
          </div>
        </>
      )}

      {totpMode === "setup" && totpSetupData && (
        <div className="settings-fields">
          <p className="settings-description" style={{ marginBottom: 8 }}>
            {t("userSettings.security.totp.scanQrCode")}
          </p>
          <div className="totp-qr-container">
            <QRCodeSVG value={totpSetupData.qr_code_uri} size={180} bgColor="transparent" fgColor="var(--text-normal)" />
          </div>
          <p className="settings-description" style={{ marginTop: 12, marginBottom: 4 }}>
            {t("userSettings.security.totp.manualEntry")}
          </p>
          <div className="totp-secret-display">
            <code>{totpSetupData.secret}</code>
            <button
              className="btn-secondary btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => {
                navigator.clipboard.writeText(totpSetupData.secret);
                setTotpSecretCopied(true);
                setTimeout(() => setTotpSecretCopied(false), 2000);
              }}
            >
              {totpSecretCopied ? t("userSettings.security.totp.copied") : t("userSettings.security.totp.copySecret")}
            </button>
          </div>
          <label className="settings-field-label" style={{ marginTop: 16 }}>
            {t("userSettings.security.totp.enterCode")}
            <input
              className="settings-input totp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={totpCode}
              onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, "")); setTotpError(""); }}
              placeholder={t("userSettings.security.totp.codePlaceholder")}
              autoFocus
            />
          </label>
          {totpError && <div className="settings-error">{totpError}</div>}
          <div className="security-phrase-actions">
            <button className="btn-secondary" onClick={() => { setTotpMode("idle"); setTotpSetupData(null); setTotpCode(""); setTotpError(""); }}>
              {t("userSettings.security.totp.cancel")}
            </button>
            <button
              className="btn-primary"
              onClick={handleTotpVerify}
              disabled={totpSaving || totpCode.length !== 6}
              style={{ marginLeft: 8 }}
            >
              {totpSaving ? t("userSettings.security.totp.verifying") : t("userSettings.security.totp.verifyAndEnable")}
            </button>
          </div>
        </div>
      )}

      {totpMode === "disable" && (
        <div className="settings-fields">
          <p className="settings-description" style={{ color: "var(--red)" }}>
            {t("userSettings.security.totp.disableWarning")}
          </p>
          {totpError && <div className="settings-error">{totpError}</div>}
          <div className="security-phrase-actions">
            <button className="btn-secondary" onClick={() => { setTotpMode("idle"); setTotpError(""); }}>
              {t("userSettings.security.totp.cancel")}
            </button>
            <button
              className="btn-secondary btn-danger-outline"
              onClick={handleTotpDisable}
              disabled={totpSaving}
              style={{ marginLeft: 8 }}
            >
              {totpSaving ? t("userSettings.security.totp.disabling") : t("userSettings.security.totp.confirmDisable")}
            </button>
          </div>
        </div>
      )}

      {totpSuccess && <div className="settings-success" style={{ marginTop: 12 }}>{totpSuccess}</div>}
    </div>

    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.security.keyBackupStatus")}</div>
      <p className="settings-description">
        {t("userSettings.security.keyBackupDesc")}
      </p>
      <div className="settings-card" style={{ marginBottom: 16 }}>
        <div className="settings-card-row">
          <div>
            <div className="settings-label">{t("userSettings.security.statusLabel")}</div>
            <div className="settings-value">
              {backupExists ? (
                <span style={{ color: "var(--status-online, #3ba55d)" }}>{t("userSettings.security.backupExists")}</span>
              ) : (
                <span style={{ color: "var(--status-dnd, #ed4245)" }}>{t("userSettings.security.noBackup")}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {mode === "idle" && (
        <div className="security-phrase-actions">
          {backupExists ? (
            <>
              <button
                className="btn-primary"
                onClick={() => { setMode("change"); setError(""); setSuccess(""); }}
                style={{ marginRight: 8 }}
              >
                {t("userSettings.security.changeSecurityPhrase")}
              </button>
              <button
                className="btn-secondary btn-danger-outline"
                onClick={handleDeleteBackup}
                disabled={saving}
              >
                {t("userSettings.security.deleteBackup")}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-primary"
                onClick={() => { setMode("setup"); setError(""); setSuccess(""); }}
                style={{ marginRight: 8 }}
              >
                {t("userSettings.security.setUpSecurityPhrase")}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setRecoveryKey(generateRecoveryKey());
                  setMode("generated");
                  setError("");
                  setSuccess("");
                }}
              >
                {t("userSettings.security.generateRecoveryKey")}
              </button>
            </>
          )}
        </div>
      )}

      {mode === "change" && (
        <div className="settings-fields">
          <div className="settings-section-title">{t("userSettings.security.changePhrase.title")}</div>
          {!getCachedPhrase() && (
            <label className="settings-field-label">
              {t("userSettings.security.changePhrase.currentLabel")}
              <input
                className="settings-input"
                type="password"
                value={currentPhrase}
                onChange={(e) => { setCurrentPhrase(e.target.value); setError(""); }}
                placeholder={t("userSettings.security.changePhrase.currentPlaceholder")}
              />
            </label>
          )}
          <button
            className="btn-secondary"
            style={{ marginBottom: 12 }}
            onClick={() => {
              const phrase = generatePassphrase();
              setNewPhrase(phrase);
              setConfirmPhrase(phrase);
              setError("");
            }}
          >
            {t("userSettings.security.changePhrase.generatePhrase")}
          </button>
          {newPhrase && newPhrase === confirmPhrase && newPhrase.includes("-") && (
            <div className="recovery-key-display" style={{ marginBottom: 12 }}>
              <code>{newPhrase}</code>
              <button
                className="btn-secondary"
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => navigator.clipboard.writeText(newPhrase)}
              >
                {t("userSettings.security.changePhrase.copyToClipboard")}
              </button>
            </div>
          )}
          <label className="settings-field-label">
            {t("userSettings.security.changePhrase.newLabel")}
            <input
              className="settings-input"
              type="password"
              value={newPhrase}
              onChange={(e) => { setNewPhrase(e.target.value); setError(""); }}
              placeholder={t("userSettings.security.changePhrase.newPlaceholder")}
            />
          </label>
          <label className="settings-field-label">
            {t("userSettings.security.changePhrase.confirmLabel")}
            <input
              className="settings-input"
              type="password"
              value={confirmPhrase}
              onChange={(e) => { setConfirmPhrase(e.target.value); setError(""); }}
              placeholder={t("userSettings.security.changePhrase.confirmPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleChangePhrase()}
            />
          </label>
          {error && <div className="settings-error">{error}</div>}
          <div className="security-phrase-actions">
            <button className="btn-secondary" onClick={() => setMode("idle")}>{t("userSettings.security.changePhrase.cancel")}</button>
            <button
              className="btn-primary"
              onClick={handleChangePhrase}
              disabled={saving || !newPhrase || !confirmPhrase}
              style={{ marginLeft: 8 }}
            >
              {saving ? t("userSettings.security.changePhrase.saving") : t("userSettings.security.changePhrase.updatePhrase")}
            </button>
          </div>
        </div>
      )}

      {mode === "setup" && (
        <div className="settings-fields">
          <div className="settings-section-title">{t("userSettings.security.setup.title")}</div>
          <p className="settings-description">
            {t("userSettings.security.setup.desc")}
          </p>
          <button
            className="btn-secondary"
            style={{ marginBottom: 12 }}
            onClick={() => {
              const phrase = generatePassphrase();
              setNewPhrase(phrase);
              setConfirmPhrase(phrase);
              setError("");
            }}
          >
            {t("userSettings.security.setup.generatePhrase")}
          </button>
          {newPhrase && newPhrase === confirmPhrase && newPhrase.includes("-") && (
            <div className="recovery-key-display" style={{ marginBottom: 12 }}>
              <code>{newPhrase}</code>
              <button
                className="btn-secondary"
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => navigator.clipboard.writeText(newPhrase)}
              >
                {t("userSettings.security.setup.copyToClipboard")}
              </button>
            </div>
          )}
          <label className="settings-field-label">
            {t("userSettings.security.setup.phraseLabel")}
            <input
              className="settings-input"
              type="password"
              value={newPhrase}
              onChange={(e) => { setNewPhrase(e.target.value); setError(""); }}
              placeholder={t("userSettings.security.setup.phrasePlaceholder")}
              autoFocus
            />
          </label>
          <label className="settings-field-label">
            {t("userSettings.security.setup.confirmLabel")}
            <input
              className="settings-input"
              type="password"
              value={confirmPhrase}
              onChange={(e) => { setConfirmPhrase(e.target.value); setError(""); }}
              placeholder={t("userSettings.security.setup.confirmPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPhrase.length >= 8 && newPhrase === confirmPhrase) {
                  handleSetupWithPhrase(newPhrase);
                }
              }}
            />
          </label>
          {error && <div className="settings-error">{error}</div>}
          <div className="security-phrase-actions">
            <button className="btn-secondary" onClick={() => setMode("idle")}>{t("userSettings.security.setup.cancel")}</button>
            <button
              className="btn-primary"
              onClick={() => {
                if (newPhrase.length < 8) { setError(t("userSettings.security.setup.mustBeMinLength")); return; }
                if (newPhrase !== confirmPhrase) { setError(t("userSettings.security.setup.phrasesDoNotMatch")); return; }
                handleSetupWithPhrase(newPhrase);
              }}
              disabled={saving || !newPhrase || !confirmPhrase}
              style={{ marginLeft: 8 }}
            >
              {saving ? t("userSettings.security.setup.saving") : t("userSettings.security.setup.createBackup")}
            </button>
          </div>
        </div>
      )}

      {mode === "generated" && (
        <div className="settings-fields">
          <div className="settings-section-title">{t("userSettings.security.generated.title")}</div>
          <p className="settings-description">
            {t("userSettings.security.generated.desc")}
          </p>
          <div className="recovery-key-display">
            <code>{recoveryKey}</code>
          </div>
          <button
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 12 }}
            onClick={() => navigator.clipboard.writeText(recoveryKey)}
          >
            {t("userSettings.security.generated.copyToClipboard")}
          </button>
          <label className="security-phrase-confirm-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("userSettings.security.generated.savedConfirm")}
          </label>
          {error && <div className="settings-error">{error}</div>}
          <div className="security-phrase-actions">
            <button className="btn-secondary" onClick={() => setMode("idle")}>{t("userSettings.security.generated.cancel")}</button>
            <button
              className="btn-primary"
              onClick={() => handleSetupWithPhrase(recoveryKey)}
              disabled={!confirmed || saving}
              style={{ marginLeft: 8 }}
            >
              {saving ? t("userSettings.security.generated.saving") : t("userSettings.security.generated.saveBackup")}
            </button>
          </div>
        </div>
      )}

      {success && <div className="settings-success" style={{ marginTop: 12 }}>{success}</div>}
    </div>
    </>
  );
}
