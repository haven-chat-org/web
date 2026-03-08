import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { useChatStore } from "../../store/chat.js";
import { useUiStore } from "../../store/ui.js";
import { toBase64, randomBytes, type ImportMessage } from "@haven-chat-org/core";

interface BackupTabProps {
  serverId: string;
  setError: (msg: string) => void;
}

export default function BackupTab({
  serverId,
  setError,
}: BackupTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "parsing" | "preview" | "restoring" | "success" | "error">("idle");
  const [restoreError, setRestoreError] = useState("");
  const [restoreSummary, setRestoreSummary] = useState<{
    serverName: string;
    exportedBy: string;
    exportedAt: string;
    channelCount: number;
    messageCount: number;
    fileCount: number;
    signed: boolean;
    verified: boolean;
    issues: string[];
  } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<{ phase: string; detail?: string } | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    categories: number;
    channels: number;
    roles: number;
    messages: number;
  } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("export.backup.title")}</div>
      <p className="settings-description">{t("export.backup.description")}</p>
      <button
        className="btn-primary"
        style={{ marginTop: 12 }}
        onClick={() => {
          useUiStore.getState().openExportModal({ type: "server", id: serverId });
        }}
      >
        {t("export.backup.createBackup")}
      </button>

      <div className="settings-section-title" style={{ marginTop: 32 }}>
        {t("export.backup.restore")}
      </div>
      <p className="settings-description">{t("export.backup.restoreDesc")}</p>

      <div className="restore-actions">
        <label className="btn-ghost" style={{ display: "inline-block", cursor: "pointer" }}>
          {t("export.backup.uploadFile")}
          <input
            ref={restoreFileInputRef}
            type="file"
            accept=".haven,.server.haven"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRestoreFile(file);
              setRestoreStatus("parsing");
              setRestoreError("");
              setRestoreSummary(null);
              try {
                const { HavenArchiveReader } = await import("@haven-chat-org/core");
                const buf = new Uint8Array(await file.arrayBuffer());
                const reader = await HavenArchiveReader.fromBlob(buf);
                const manifest = reader.getManifest();
                // Validate this is a server backup
                const isServerBackup = manifest.scope === "server" || manifest.server_id;
                const serverMeta = reader.getServerMeta();
                if (!isServerBackup || !serverMeta) {
                  throw new Error(t("export.backup.notServerBackup"));
                }
                const verification = await reader.verify();
                setRestoreSummary({
                  serverName: serverMeta?.server?.name ?? manifest.server_id ?? t("export.backup.unknownServer"),
                  exportedBy: manifest.exported_by.username,
                  exportedAt: manifest.exported_at,
                  channelCount: serverMeta?.channels?.length ?? Object.keys(manifest.files).filter((f) => f.startsWith("channels/")).length,
                  messageCount: manifest.message_count,
                  fileCount: Object.keys(manifest.files).length,
                  signed: !!manifest.user_signature,
                  verified: verification.valid,
                  issues: verification.issues,
                });
                setRestoreStatus("preview");
              } catch (err) {
                setRestoreError(err instanceof Error ? err.message : t("export.backup.restoreFailed"));
                setRestoreStatus("error");
              }
            }}
          />
        </label>

        {restoreFile && restoreStatus !== "idle" && (
          <button
            className="btn-ghost"
            onClick={() => {
              setRestoreFile(null);
              setRestoreStatus("idle");
              setRestoreSummary(null);
              setRestoreError("");
              if (restoreFileInputRef.current) restoreFileInputRef.current.value = "";
            }}
          >
            {t("export.backup.clearFile")}
          </button>
        )}
      </div>

      {restoreFile && (
        <div className="restore-file-name">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
          </svg>
          {restoreFile.name}
        </div>
      )}

      {restoreStatus === "parsing" && (
        <div className="restore-status restore-status-parsing">
          <div className="restore-spinner" />
          {t("export.backup.parsing")}
        </div>
      )}

      {restoreStatus === "error" && (
        <div className="restore-status restore-status-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          {restoreError}
        </div>
      )}

      {restoreStatus === "preview" && restoreSummary && (
        <div className="restore-preview">
          <div className={`restore-verification ${restoreSummary.verified ? "verified" : restoreSummary.issues.length > 0 ? "invalid" : "unsigned"}`}>
            {restoreSummary.verified ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                {restoreSummary.signed ? t("export.backup.verifiedSigned") : t("export.backup.verifiedUnsigned")}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                {t("export.backup.verificationFailed")}
              </>
            )}
          </div>

          <div className="restore-summary-grid">
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.serverName")}</span>
              <span className="restore-summary-value">{restoreSummary.serverName}</span>
            </div>
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.exportedBy")}</span>
              <span className="restore-summary-value">{restoreSummary.exportedBy}</span>
            </div>
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.exportedAt")}</span>
              <span className="restore-summary-value">{new Date(restoreSummary.exportedAt).toLocaleString()}</span>
            </div>
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.channels")}</span>
              <span className="restore-summary-value">{restoreSummary.channelCount}</span>
            </div>
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.messages")}</span>
              <span className="restore-summary-value">{restoreSummary.messageCount.toLocaleString()}</span>
            </div>
            <div className="restore-summary-item">
              <span className="restore-summary-label">{t("export.backup.files")}</span>
              <span className="restore-summary-value">{restoreSummary.fileCount}</span>
            </div>
          </div>

          {restoreSummary.issues.length > 0 && (
            <div className="restore-issues">
              <div className="restore-issues-title">{t("export.backup.issues")}</div>
              {restoreSummary.issues.map((issue, i) => (
                <div key={i} className="restore-issue-item">{issue}</div>
              ))}
            </div>
          )}

          <div className="restore-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>{t("export.backup.restoreWarning")}</span>
          </div>

          <button
            className="btn-danger"
            style={{ marginTop: 12, width: "100%" }}
            disabled={!restoreSummary.verified}
            onClick={async () => {
              if (!restoreFile) return;
              if (!window.confirm(t("export.backup.restoreWarning"))) return;
              try {
                setRestoreStatus("restoring");
                setRestoreError("");
                setRestoreProgress({ phase: t("export.backup.restoringStructure") });

                // Re-parse archive to get full data
                const { HavenArchiveReader } = await import("@haven-chat-org/core");
                const buf = new Uint8Array(await restoreFile.arrayBuffer());
                const reader = await HavenArchiveReader.fromBlob(buf);
                const serverExport = reader.getServerMeta()!;

                // Phase 1: Restore structure (categories, channels, roles)
                const result = await api.restoreServer(serverId, serverExport);

                // Phase 2: Import messages per channel
                const channelExports = reader.getChannelExports();
                let totalMessages = 0;
                const BATCH_SIZE = 200;

                for (let i = 0; i < channelExports.length; i++) {
                  const chExport = channelExports[i];
                  const newChannelId = result.channel_id_map[chExport.channel.id];
                  if (!newChannelId || chExport.messages.length === 0) continue;

                  setRestoreProgress({
                    phase: t("export.backup.importingMessages"),
                    detail: `${chExport.channel.name} (${i + 1}/${channelExports.length})`,
                  });

                  // Build messages for import
                  const allMessages: ImportMessage[] = chExport.messages.map((msg: { sender_id: string; text: string | null; content_type?: string; formatting?: string | null; sender_name?: string; timestamp: string; type: string; attachments?: unknown[] }) => {
                    const isSystem = msg.type === "system";

                    if (isSystem) {
                      // System messages: store plain text as bytes (no 0x00 wire format)
                      // The client reads system messages via unicodeAtob(encrypted_body)
                      const textBytes = new TextEncoder().encode(msg.text ?? "");
                      return {
                        sender_token: toBase64(new Uint8Array(0)), // empty, like backend
                        encrypted_body: toBase64(textBytes),
                        timestamp: msg.timestamp,
                        sender_id: null,
                        message_type: "system",
                        reply_to_id: null,
                        has_attachments: false,
                      };
                    }

                    // Regular messages: use 0x00 unencrypted wire format
                    const payloadObj: Record<string, unknown> = {
                      sender_id: msg.sender_id,
                      text: msg.text,
                    };
                    if (msg.content_type) payloadObj.content_type = msg.content_type;
                    if (msg.formatting) payloadObj.formatting = msg.formatting;

                    const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
                    const body = new Uint8Array(1 + payloadBytes.length);
                    body[0] = 0x00; // unencrypted type byte
                    body.set(payloadBytes, 1);

                    return {
                      sender_token: toBase64(randomBytes(32)),
                      encrypted_body: toBase64(body),
                      timestamp: msg.timestamp,
                      sender_id: msg.sender_id || null,
                      message_type: "user",
                      reply_to_id: null, // old IDs don't map
                      has_attachments: (msg.attachments?.length ?? 0) > 0,
                    };
                  });

                  // Send in batches
                  for (let j = 0; j < allMessages.length; j += BATCH_SIZE) {
                    const batch = allMessages.slice(j, j + BATCH_SIZE);
                    const res = await api.importMessages(newChannelId, batch);
                    totalMessages += res.imported;
                  }
                }

                setRestoreResult({
                  categories: result.categories_created,
                  channels: result.channels_created,
                  roles: result.roles_created + result.roles_updated,
                  messages: totalMessages,
                });
                setRestoreStatus("success");

                // Refresh sidebar
                await useChatStore.getState().loadChannels();
              } catch (err) {
                setRestoreError(
                  err instanceof Error ? err.message : t("export.backup.restoreFailed"),
                );
                setRestoreStatus("error");
              }
            }}
          >
            {t("export.backup.restoreButton")}
          </button>

          {!restoreSummary.verified && (
            <p className="settings-description" style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--red)" }}>
              {t("export.backup.cannotRestoreUnverified")}
            </p>
          )}
        </div>
      )}

      {restoreStatus === "restoring" && restoreProgress && (
        <div className="restore-status restore-status-parsing">
          <div className="restore-spinner" />
          <div>
            <div>{restoreProgress.phase}</div>
            {restoreProgress.detail && (
              <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{restoreProgress.detail}</div>
            )}
          </div>
        </div>
      )}

      {restoreStatus === "success" && restoreResult && (
        <div className="restore-status restore-status-success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
          <div>
            <div>{t("export.backup.restoreComplete")}</div>
            <div className="restore-summary-grid" style={{ marginTop: 8 }}>
              <div className="restore-summary-item">
                <span className="restore-summary-label">{t("export.backup.categoriesCreated")}</span>
                <span className="restore-summary-value">{restoreResult.categories}</span>
              </div>
              <div className="restore-summary-item">
                <span className="restore-summary-label">{t("export.backup.channelsCreated")}</span>
                <span className="restore-summary-value">{restoreResult.channels}</span>
              </div>
              <div className="restore-summary-item">
                <span className="restore-summary-label">{t("export.backup.rolesCreated")}</span>
                <span className="restore-summary-value">{restoreResult.roles}</span>
              </div>
              {restoreResult.messages > 0 && (
                <div className="restore-summary-item">
                  <span className="restore-summary-label">{t("export.backup.messagesImported")}</span>
                  <span className="restore-summary-value">{restoreResult.messages.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="settings-description" style={{ marginTop: 12, fontSize: "0.8rem" }}>
        {t("export.backup.memberNote")}
      </p>
    </div>
  );
}
