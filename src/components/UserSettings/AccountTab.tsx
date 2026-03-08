import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";

export default function AccountTab() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const api = useAuthStore((s) => s.api);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  if (!user) return null;

  async function handleChangePassword() {
    setPwError("");
    setPwSuccess("");
    if (!currentPassword || !newPassword) {
      setPwError(t("userSettings.account.allFieldsRequired"));
      return;
    }
    if (newPassword.length < 8) {
      setPwError(t("userSettings.account.passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("userSettings.account.passwordsDoNotMatch"));
      return;
    }
    setPwLoading(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess(t("userSettings.account.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(err.message || t("userSettings.account.failedChangePassword"));
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-card">
        <div className="settings-card-row">
          <div>
            <div className="settings-label">{t("userSettings.account.usernameLabel")}</div>
            <div className="settings-value">{user.username}</div>
          </div>
        </div>
        <div className="settings-card-row">
          <div>
            <div className="settings-label">{t("userSettings.account.displayNameLabel")}</div>
            <div className="settings-value">{user.display_name || user.username}</div>
          </div>
        </div>
      </div>

      <div className="settings-section-title">{t("userSettings.account.changePassword")}</div>
      <div className="settings-fields">
        <label className="settings-field-label">
          {t("userSettings.account.currentPassword")}
          <input
            className="settings-input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="settings-field-label">
          {t("userSettings.account.newPassword")}
          <input
            className="settings-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="settings-field-label">
          {t("userSettings.account.confirmNewPassword")}
          <input
            className="settings-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {pwError && <div className="settings-error">{pwError}</div>}
        {pwSuccess && <div className="settings-success">{pwSuccess}</div>}
        <button
          className="btn-primary settings-save-btn"
          onClick={handleChangePassword}
          disabled={pwLoading}
        >
          {pwLoading ? t("userSettings.account.changing") : t("userSettings.account.changePasswordBtn")}
        </button>
      </div>

      <div className="settings-section-title" style={{ marginTop: 32 }}>{t("userSettings.account.deleteAccount")}</div>
      <p className="settings-description">
        {t("userSettings.account.deleteAccountDesc")}
      </p>
      {!showDeleteConfirm ? (
        <button
          className="btn-danger"
          onClick={() => setShowDeleteConfirm(true)}
        >
          {t("userSettings.account.deleteAccountBtn")}
        </button>
      ) : (
        <div className="delete-account-confirm">
          <p className="settings-description" style={{ color: "var(--red)", fontWeight: 600 }}>
            {t("userSettings.account.deleteConfirmWarning")}
          </p>
          <label className="settings-field-label">
            {t("userSettings.account.confirmPassword")}
            <input
              className="settings-input"
              type="password"
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
              placeholder={t("userSettings.account.confirmPasswordPlaceholder")}
              autoComplete="current-password"
            />
          </label>
          {deleteError && <div className="settings-error">{deleteError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeleteError(""); }}
            >
              {t("userSettings.account.cancel")}
            </button>
            <button
              className="btn-danger"
              disabled={deleteLoading || !deletePassword}
              onClick={async () => {
                setDeleteError("");
                setDeleteLoading(true);
                try {
                  await api.deleteAccount(deletePassword);
                  useAuthStore.getState().logout();
                } catch (err: any) {
                  setDeleteError(err.message || t("userSettings.account.failedDeleteAccount"));
                } finally {
                  setDeleteLoading(false);
                }
              }}
            >
              {deleteLoading ? t("userSettings.account.deleting") : t("userSettings.account.permanentlyDeleteAccount")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
