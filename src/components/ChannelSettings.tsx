import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth.js";
import { useChatStore } from "../store/chat.js";
import { parseChannelName } from "../lib/channel-utils.js";
import { unicodeBtoa, unicodeAtob } from "../lib/base64.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import EmojiPicker from "./EmojiPicker.js";

const ChannelPermissionsEditor = lazy(
  () => import("./ChannelPermissionsEditor.js")
);

type Tab = "overview" | "permissions";

interface ChannelSettingsProps {
  channelId: string;
  serverId: string;
  onClose: () => void;
}

export default function ChannelSettings({
  channelId,
  serverId,
  onClose,
}: ChannelSettingsProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const channels = useChatStore((s) => s.channels);
  const channel = channels.find((c) => c.id === channelId);

  const [tab, setTab] = useState<Tab>("overview");
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!channel) return null;

  // Parse current meta
  let currentName = "unnamed";
  let currentTopic = "";
  try {
    const meta = JSON.parse(unicodeAtob(channel.encrypted_meta));
    currentName = meta.name || "unnamed";
    currentTopic = meta.topic || "";
  } catch { /* ignore */ }

  return (
    <div className="user-settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="user-settings-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("channelSettings.ariaLabel")}
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="user-settings-sidebar">
          <div className="user-settings-sidebar-header">
            <span className="channel-settings-header-hash">#</span>
            {currentName}
          </div>
          <button
            className={`user-settings-nav-item ${tab === "overview" ? "active" : ""}`}
            onClick={() => setTab("overview")}
          >
            {t("channelSettings.tab.overview")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "permissions" ? "active" : ""}`}
            onClick={() => setTab("permissions")}
          >
            {t("channelSettings.tab.permissions")}
          </button>
          <div className="user-settings-sidebar-divider" />
          <button
            className="user-settings-nav-item danger"
            onClick={async () => {
              if (confirm(t("channelSettings.deleteConfirm"))) {
                try {
                  await api.deleteChannel(channelId);
                  useChatStore.getState().loadChannels();
                  onClose();
                } catch { /* non-fatal */ }
              }
            }}
          >
            {t("channelSettings.deleteChannel")}
          </button>
        </nav>
        <div className="user-settings-content">
          <div className="user-settings-content-header">
            <h2>{tab === "overview" ? t("channelSettings.tab.overview") : t("channelSettings.tab.permissions")}</h2>
            <button className="settings-esc-close" onClick={onClose} aria-label={t("channelSettings.closeAriaLabel")}>
              <div className="settings-esc-circle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </div>
              <span className="settings-esc-label">{t("channelSettings.escLabel")}</span>
            </button>
          </div>
          <div className="user-settings-content-body">
            {tab === "overview" && (
              <OverviewTab
                channelId={channelId}
                currentName={currentName}
                currentTopic={currentTopic}
                encryptedMeta={channel.encrypted_meta}
                channelEncrypted={channel.encrypted}
              />
            )}
            {tab === "permissions" && (
              <Suspense fallback={<p>{t("channelSettings.loading")}</p>}>
                <ChannelPermissionsEditor
                  channelId={channelId}
                  serverId={serverId}
                  onClose={() => setTab("overview")}
                  embedded
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Overview Tab ---

function OverviewTab({
  channelId,
  currentName,
  currentTopic,
  encryptedMeta,
  channelEncrypted,
}: {
  channelId: string;
  currentName: string;
  currentTopic: string;
  encryptedMeta: string;
  channelEncrypted: boolean;
}) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);

  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [encrypted, setEncrypted] = useState(channelEncrypted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync state when parent props change (e.g. after save triggers loadChannels)
  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
    setEncrypted(channelEncrypted);
  }, [currentName, currentTopic, channelEncrypted]);

  const hasChanges = name !== currentName || topic !== currentTopic || encrypted !== channelEncrypted;

  async function handleSave() {
    if (!name.trim()) {
      setError(t("channelSettings.overview.channelNameEmpty"));
      return;
    }
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      // Reconstruct meta preserving existing fields
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(unicodeAtob(encryptedMeta));
      } catch { /* start fresh */ }
      meta.name = name.trim();
      meta.topic = topic.trim() || undefined;

      await api.updateChannel(channelId, {
        encrypted_meta: unicodeBtoa(JSON.stringify(meta)),
        encrypted: encrypted !== channelEncrypted ? encrypted : undefined,
      });
      useChatStore.getState().loadChannels();
      setSuccess(t("channelSettings.overview.channelUpdated"));
    } catch (e: any) {
      setError(e.message || t("channelSettings.overview.failedUpdate"));
    } finally {
      setSaving(false);
    }
  }

  function handleEmojiSelect(emoji: string) {
    if (!nameInputRef.current) return;
    const input = nameInputRef.current;
    const start = input.selectionStart ?? name.length;
    const end = input.selectionEnd ?? name.length;
    const newName = name.slice(0, start) + emoji + name.slice(end);
    setName(newName);
    setShowEmojiPicker(false);
    // Restore cursor position after emoji
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
      input.focus();
    });
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("channelSettings.overview.channelName")}</div>
      <div className="channel-settings-name-row">
        <input
          ref={nameInputRef}
          className="settings-input"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          maxLength={100}
          placeholder={t("channelSettings.overview.channelNamePlaceholder")}
        />
        <div className="channel-settings-emoji-wrap">
          <button
            type="button"
            className="btn-secondary channel-settings-emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title={t("channelSettings.overview.addEmojiTitle")}
            aria-label={t("channelSettings.overview.addEmojiAriaLabel")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmojiPicker(false)}
              position="below"
            />
          )}
        </div>
      </div>

      <div className="settings-section-title" style={{ marginTop: 20 }}>{t("channelSettings.overview.channelTopic")}</div>
      <textarea
        className="settings-textarea channel-topic-textarea"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={125}
        rows={2}
        placeholder={t("channelSettings.overview.topicPlaceholder")}
      />
      <span className="settings-char-count">{topic.length}/125</span>

      <div className="settings-section-title" style={{ marginTop: 20 }}>{t("channelSettings.overview.encryption")}</div>
      <label className="create-channel-private-toggle">
        <input
          type="checkbox"
          checked={encrypted}
          onChange={(e) => setEncrypted(e.target.checked)}
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="lock-icon">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
        </svg>
        <span>{t("channelSettings.overview.encryptedLabel")}</span>
      </label>
      <p className="create-channel-private-hint">
        {encrypted ? t("channelSettings.overview.encryptedHint") : t("channelSettings.overview.unencryptedHint")}
      </p>

      {error && <div className="settings-error">{error}</div>}
      {success && <div className="settings-success">{success}</div>}
      {hasChanges && (
        <button
          className="btn-primary settings-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t("channelSettings.overview.saving") : t("channelSettings.overview.saveChanges")}
        </button>
      )}
    </div>
  );
}
