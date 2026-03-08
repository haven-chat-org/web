import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import Avatar from "../Avatar.js";
import EmojiPicker from "../EmojiPicker.js";

export default function ProfileTab() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const api = useAuthStore((s) => s.api);

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [aboutMe, setAboutMe] = useState(user?.about_me ?? "");
  const [customStatus, setCustomStatus] = useState(user?.custom_status ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [showStatusEmoji, setShowStatusEmoji] = useState(false);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function handleSaveProfile() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        display_name: displayName || null,
        about_me: aboutMe || null,
        custom_status: customStatus || null,
      });
      useAuthStore.setState({
        user: { ...user!, ...updated },
      });
      setSuccess(t("userSettings.profile.profileUpdated"));
    } catch (err: any) {
      setError(err.message || t("userSettings.profile.failedUpdateProfile"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t("userSettings.profile.avatarTooLarge"));
      return;
    }
    setError("");
    setAvatarUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const updated = await api.uploadAvatar(buf);
      useAuthStore.setState({
        user: { ...user!, ...updated },
      });
      setSuccess(t("userSettings.profile.avatarUpdated"));
    } catch (err: any) {
      setError(err.message || t("userSettings.profile.failedUploadAvatar"));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError(t("userSettings.profile.bannerTooLarge"));
      return;
    }
    setError("");
    setBannerUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const updated = await api.uploadBanner(buf);
      useAuthStore.setState({
        user: { ...user!, ...updated },
      });
      setSuccess(t("userSettings.profile.bannerUpdated"));
    } catch (err: any) {
      setError(err.message || t("userSettings.profile.failedUploadBanner"));
    } finally {
      setBannerUploading(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  return (
    <div className="settings-section">
      {/* Banner upload */}
      <div
        className="settings-banner-preview"
        onClick={() => bannerInputRef.current?.click()}
        style={user.banner_url ? { backgroundImage: `url(${user.banner_url})` } : undefined}
      >
        <div className="settings-banner-overlay">
          {bannerUploading ? t("userSettings.profile.uploading") : t("userSettings.profile.changeBanner")}
        </div>
      </div>
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: "none" }}
        onChange={handleBannerUpload}
      />

      <div className="settings-avatar-section">
        <div className="settings-avatar-preview" onClick={() => fileInputRef.current?.click()}>
          <Avatar
            avatarUrl={user.avatar_url}
            name={user.display_name || user.username}
            size={80}
          />
          <div className="settings-avatar-overlay">
            {avatarUploading ? t("userSettings.profile.uploading") : t("userSettings.profile.changeAvatar")}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={handleAvatarUpload}
        />
      </div>

      <div className="settings-fields">
        <label className="settings-field-label">
          {t("userSettings.profile.displayName")}
          <input
            className="settings-input"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder={user.username}
          />
        </label>
        <label className="settings-field-label">
          {t("userSettings.profile.aboutMe")}
          <textarea
            className="settings-textarea"
            value={aboutMe}
            onChange={(e) => setAboutMe(e.target.value)}
            maxLength={190}
            rows={3}
            placeholder={t("userSettings.profile.aboutMePlaceholder")}
          />
          <span className="settings-char-count">{aboutMe.length}/190</span>
        </label>
        <div className="settings-field-label">
          {t("userSettings.profile.customStatus")}
          <div className="settings-input-with-emoji">
            <input
              ref={statusInputRef}
              className="settings-input"
              type="text"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              maxLength={128}
              placeholder={t("userSettings.profile.customStatusPlaceholder")}
            />
            <div className="settings-emoji-btn-wrap">
              <button
                type="button"
                className="create-channel-emoji-btn"
                onClick={() => setShowStatusEmoji(!showStatusEmoji)}
                title={t("userSettings.profile.addEmojiTitle")}
                aria-label={t("userSettings.profile.addEmojiAriaLabel")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
              </button>
              {showStatusEmoji && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    const input = statusInputRef.current;
                    const start = input?.selectionStart ?? customStatus.length;
                    const end = input?.selectionEnd ?? customStatus.length;
                    setCustomStatus(customStatus.slice(0, start) + emoji + customStatus.slice(end));
                    setShowStatusEmoji(false);
                    requestAnimationFrame(() => {
                      const pos = start + emoji.length;
                      input?.setSelectionRange(pos, pos);
                      input?.focus();
                    });
                  }}
                  onClose={() => setShowStatusEmoji(false)}
                />
              )}
            </div>
          </div>
        </div>
        {error && <div className="settings-error">{error}</div>}
        {success && <div className="settings-success">{success}</div>}
        <button
          className="btn-primary settings-save-btn"
          onClick={handleSaveProfile}
          disabled={saving}
        >
          {saving ? t("userSettings.profile.saving") : t("userSettings.profile.saveChanges")}
        </button>
      </div>
    </div>
  );
}
