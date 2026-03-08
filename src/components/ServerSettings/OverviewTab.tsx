import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { useChatStore } from "../../store/chat.js";
import { parseChannelDisplay, parseServerName } from "../../lib/channel-utils.js";
import { unicodeBtoa } from "../../lib/base64.js";

interface OverviewTabProps {
  serverId: string;
  error: string;
  setError: (msg: string) => void;
}

export default function OverviewTab({ serverId, error, setError }: OverviewTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const server = useChatStore((s) => s.servers.find((sv) => sv.id === serverId));
  const allChannels = useChatStore((s) => s.channels);
  const serverChannels = useMemo(
    () => allChannels.filter((ch) => ch.server_id === serverId && ch.channel_type === "text"),
    [allChannels, serverId],
  );

  const [serverName, setServerName] = useState(() =>
    server ? parseServerName(server.encrypted_meta) : ""
  );
  const [systemChannelId, setSystemChannelId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setSystemChannelId(server?.system_channel_id ?? null);
  }, [server?.system_channel_id]);

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">{t("serverSettings.overview.serverName")}</div>
        <input
          type="text"
          className="settings-input"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          maxLength={100}
          style={{ marginBottom: 12 }}
        />
        <button
          className="btn-primary settings-save-btn"
          disabled={!serverName.trim()}
          onClick={async () => {
            setError("");
            try {
              const meta = unicodeBtoa(JSON.stringify({ name: serverName.trim() }));
              await api.updateServer(serverId, { encrypted_meta: meta });
              await useChatStore.getState().loadChannels();
              setSuccess(t("serverSettings.overview.serverNameUpdated"));
              setTimeout(() => setSuccess(""), 3000);
            } catch (err: any) {
              setError(err.message || t("serverSettings.overview.failedUpdateServer"));
            }
          }}
        >
          {t("serverSettings.overview.saveChanges")}
        </button>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">{t("serverSettings.overview.serverIcon")}</div>
        <p className="settings-description">
          {t("serverSettings.overview.serverIconDesc")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div
            className="server-icon-preview"
            style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, overflow: "hidden", cursor: "pointer" }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/gif,image/webp";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  setError(t("serverSettings.overview.iconTooLarge"));
                  return;
                }
                setError("");
                setSuccess("");
                try {
                  const buf = await file.arrayBuffer();
                  await api.uploadServerIcon(serverId, buf);
                  await useChatStore.getState().loadChannels();
                  setSuccess(t("serverSettings.overview.serverIconUpdated"));
                  setTimeout(() => setSuccess(""), 3000);
                } catch (err: any) {
                  setError(err.message || t("serverSettings.overview.failedUploadIcon"));
                }
              };
              input.click();
            }}
            title={t("serverSettings.overview.clickToUploadIcon")}
          >
            {server?.icon_url ? (
              <img src={server.icon_url} alt={t("serverSettings.overview.serverIconAlt")} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            ) : (
              <span style={{ color: "var(--text-muted)" }}>+</span>
            )}
          </div>
          {server?.icon_url && (
            <button
              className="btn-secondary"
              onClick={async () => {
                setError("");
                try {
                  await api.deleteServerIcon(serverId);
                  await useChatStore.getState().loadChannels();
                } catch (err: any) {
                  setError(err.message || t("serverSettings.overview.failedRemoveIcon"));
                }
              }}
            >
              {t("serverSettings.overview.removeIcon")}
            </button>
          )}
        </div>
        {success && <span className="settings-success" style={{ color: "var(--green)", display: "block", marginTop: 8, fontSize: 13 }}>{success}</span>}
      </div>
      <div className="settings-section">
        <div className="settings-section-title">{t("serverSettings.overview.systemMessagesChannel")}</div>
        <p className="settings-description">
          {t("serverSettings.overview.systemMessagesDesc")}
        </p>
        <select
          className="settings-input"
          value={systemChannelId ?? ""}
          onChange={(e) => setSystemChannelId(e.target.value || null)}
          style={{ marginBottom: 12 }}
        >
          <option value="">{t("serverSettings.overview.systemChannelNone")}</option>
          {serverChannels.map((ch) => {
            const display = parseChannelDisplay(ch.encrypted_meta, "");
            return (
              <option key={ch.id} value={ch.id}>
                #{display?.name ?? ch.id.slice(0, 8)}
              </option>
            );
          })}
        </select>
        <button
          className="btn-primary settings-save-btn"
          onClick={async () => {
            setError("");
            try {
              await api.updateServer(serverId, { system_channel_id: systemChannelId });
              await useChatStore.getState().loadChannels();
            } catch (err: any) {
              setError(err.message || t("serverSettings.overview.failedUpdateServer"));
            }
          }}
        >
          {t("serverSettings.overview.saveChanges")}
        </button>
      </div>
    </>
  );
}
