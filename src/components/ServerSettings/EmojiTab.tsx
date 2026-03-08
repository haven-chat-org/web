import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { useChatStore } from "../../store/chat.js";

interface EmojiTabProps {
  serverId: string;
  setError: (msg: string) => void;
  setDeleteEmojiTarget: (target: { id: string; name: string } | null) => void;
}

export default function EmojiTab({
  serverId,
  setError,
  setDeleteEmojiTarget,
}: EmojiTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const customEmojis = useChatStore((s) => s.customEmojis);
  const userNames = useChatStore((s) => s.userNames);
  const serverEmojis = customEmojis[serverId] ?? [];
  const staticCount = serverEmojis.filter((e) => !e.animated).length;
  const animatedCount = serverEmojis.filter((e) => e.animated).length;

  const [emojiUploading, setEmojiUploading] = useState(false);
  const [pendingEmoji, setPendingEmoji] = useState<{ file: File; preview: string; name: string } | null>(null);
  const emojiFileRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  // Re-fetch emojis from API when emoji tab is opened (ensures persistence)
  useEffect(() => {
    api.listServerEmojis(serverId).then((emojis) => {
      useChatStore.setState((s) => ({
        customEmojis: { ...s.customEmojis, [serverId]: emojis },
      }));
    }).catch(() => {});
  }, [serverId]);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.emoji.title")}</div>
      <div className="emoji-slot-counters">
        <span>{staticCount}/25 {t("serverSettings.emoji.staticSlots")}</span>
        <span>{animatedCount}/10 {t("serverSettings.emoji.animatedSlots")}</span>
      </div>

      <input
        ref={emojiFileRef}
        type="file"
        accept="image/png,image/gif,image/jpeg"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (emojiFileRef.current) emojiFileRef.current.value = "";
          if (file.size > 256 * 1024) {
            setError(t("serverSettings.emoji.emojiTooLarge"));
            return;
          }
          // Auto-derive name from filename
          const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
          const name = baseName.length >= 2 ? baseName : "emoji";
          const preview = URL.createObjectURL(file);
          setPendingEmoji({ file, preview, name });
          setError("");
        }}
      />

      {pendingEmoji ? (
        <div className="emoji-pending-row">
          <img src={pendingEmoji.preview} alt={t("serverSettings.emoji.previewAlt")} className="emoji-manage-img" />
          <input
            className="settings-input"
            type="text"
            placeholder={t("serverSettings.emoji.namePlaceholder")}
            value={pendingEmoji.name}
            onChange={(e) => { setPendingEmoji({ ...pendingEmoji, name: e.target.value }); setError(""); }}
            style={{ flex: 1 }}
          />
          <button
            className="btn-primary"
            disabled={emojiUploading}
            onClick={async () => {
              if (uploadingRef.current) return;
              const name = pendingEmoji.name.trim();
              if (!/^[a-zA-Z0-9_]{2,}$/.test(name)) {
                setError(t("serverSettings.emoji.nameValidation"));
                return;
              }
              if (serverEmojis.some((e) => e.name === name)) {
                setError(t("serverSettings.emoji.nameExists"));
                return;
              }
              setError("");
              setEmojiUploading(true);
              uploadingRef.current = true;
              try {
                const buf = await pendingEmoji.file.arrayBuffer();
                await api.uploadEmoji(serverId, name, buf);
                URL.revokeObjectURL(pendingEmoji.preview);
                setPendingEmoji(null);
              } catch (err: any) {
                setError(err.message || t("serverSettings.emoji.failedUpload"));
              } finally {
                setEmojiUploading(false);
                uploadingRef.current = false;
              }
            }}
          >
            {emojiUploading ? t("serverSettings.emoji.saving") : t("serverSettings.emoji.save")}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              URL.revokeObjectURL(pendingEmoji.preview);
              setPendingEmoji(null);
              setError("");
            }}
          >
            {t("serverSettings.emoji.cancel")}
          </button>
        </div>
      ) : (
        <div className="emoji-upload-row">
          <button
            className="btn-primary"
            disabled={emojiUploading}
            onClick={() => emojiFileRef.current?.click()}
          >
            {t("serverSettings.emoji.uploadEmoji")}
          </button>
        </div>
      )}

      {serverEmojis.length > 0 ? (
        <div className="emoji-manage-table">
          <div className="emoji-manage-header emoji-manage-4col">
            <span>{t("serverSettings.emoji.tableImage")}</span>
            <span>{t("serverSettings.emoji.tableName")}</span>
            <span>{t("serverSettings.emoji.tableUploadedBy")}</span>
            <span></span>
          </div>
          {serverEmojis.map((emoji) => (
            <div key={emoji.id} className="emoji-manage-row emoji-manage-4col">
              <img
                src={emoji.image_url}
                alt={emoji.name}
                className="emoji-manage-img"
              />
              <span className="emoji-manage-name">
                :{emoji.name}:
                {emoji.animated && (
                  <span className="emoji-manage-badge">{t("serverSettings.emoji.animated")}</span>
                )}
              </span>
              <span className="emoji-manage-uploader">
                {emoji.uploaded_by ? (userNames[emoji.uploaded_by] ?? t("serverSettings.emoji.unknown")) : "\u2014"}
              </span>
              <button
                className="btn-ghost server-kick-btn"
                onClick={() => setDeleteEmojiTarget({ id: emoji.id, name: emoji.name })}
              >
                {t("serverSettings.categories.delete")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="settings-description" style={{ marginTop: 16 }}>
          {t("serverSettings.emoji.emptyMessage")}
        </p>
      )}
    </div>
  );
}
