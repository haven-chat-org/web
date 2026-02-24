import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../store/ui.js";
import { useAuthStore } from "../store/auth.js";
import { useChatStore, type DecryptedMessage, type AttachmentMeta } from "../store/chat.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { parseChannelName, parseServerName } from "../lib/channel-utils.js";
import { decryptIncoming } from "../lib/crypto.js";
import { cacheMessage, getCachedMessage } from "../lib/message-cache.js";
import { unicodeAtob } from "../lib/base64.js";
import { Permission, toBase64, type MessageResponse, type HavenChannelExport, type HavenServerExport, type HavenExportMessage, type HavenAttachmentRef } from "@haven-chat-org/core";
import { usePermissions } from "../hooks/usePermissions.js";

type Scope = "channel" | "server";
type DateRangeMode = "all" | "30days" | "90days" | "custom";
type Format = "haven" | "json";

interface ExportProgress {
  phase: "messages" | "attachments" | "building" | "complete" | "failed";
  messagesLoaded: number;
  messagesTotal: number;
  attachmentsLoaded: number;
  attachmentsTotal: number;
  startTime: number;
  error?: string;
}

export default function ExportModal() {
  const { t } = useTranslation();
  const context = useUiStore((s) => s.exportModalContext);
  const closeExportModal = useUiStore((s) => s.closeExportModal);
  const api = useAuthStore((s) => s.api);
  const user = useAuthStore((s) => s.user);
  const channels = useChatStore((s) => s.channels);
  const servers = useChatStore((s) => s.servers);
  const storeMessages = useChatStore((s) => s.messages);
  const userNames = useChatStore((s) => s.userNames);
  const categories = useChatStore((s) => s.categories);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const [scope, setScope] = useState<Scope>(context?.type === "server" ? "server" : "channel");
  const [dateRange, setDateRange] = useState<DateRangeMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includePinned, setIncludePinned] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [includeAuditLog, setIncludeAuditLog] = useState(false);
  const [format, setFormat] = useState<Format>("haven");
  const [signExport, setSignExport] = useState(true);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !progress) closeExportModal();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeExportModal, progress]);

  if (!context) return null;

  const channel = channels.find((c) => c.id === context.id);
  const server = context.type === "server"
    ? servers.find((s) => s.id === context.id)
    : channel?.server_id
      ? servers.find((s) => s.id === channel.server_id)
      : null;

  let displayName = "";
  if (context.type === "server" && server) {
    displayName = parseServerName(server.encrypted_meta);
  } else if (channel) {
    displayName = parseChannelName(channel.encrypted_meta);
  }

  const title = context.type === "server"
    ? t("export.title.server", { name: displayName })
    : context.type === "dm"
      ? t("export.title.dm")
      : t("export.title.channel", { name: displayName });

  const isServerContext = context.type === "channel" && channel?.server_id;
  const serverId = server?.id ?? channel?.server_id ?? "";
  const { can } = usePermissions(serverId || "");
  const canExportAll = context.type === "dm" || can(Permission.MANAGE_MESSAGES);

  function getDateFilter(): { after?: string; before?: string } {
    const now = new Date();
    switch (dateRange) {
      case "30days": {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return { after: d.toISOString() };
      }
      case "90days": {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        return { after: d.toISOString() };
      }
      case "custom":
        return {
          ...(customFrom ? { after: new Date(customFrom).toISOString() } : {}),
          ...(customTo ? { before: new Date(customTo).toISOString() } : {}),
        };
      default:
        return {};
    }
  }

  function formatElapsed(startTime: number): string {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function convertAttachment(a: AttachmentMeta): HavenAttachmentRef {
    return {
      id: a.id,
      filename: a.filename,
      mime_type: a.mime_type,
      size: a.size,
      ...(a.width != null ? { width: a.width } : {}),
      ...(a.height != null ? { height: a.height } : {}),
      file_ref: `attachments/${a.id}.bin`,
    };
  }

  function formatSystemMessageText(jsonText: string): string {
    try {
      const data = JSON.parse(jsonText);
      const name = data.username ?? data.user_id ?? "Someone";
      switch (data.event) {
        case "member_joined": return `${name} joined the server.`;
        case "member_left": return `${name} left the server.`;
        case "member_kicked": return `${name} was kicked.`;
        case "encryption_enabled": return `${name} enabled encryption for this channel.`;
        case "encryption_disabled": return `${name} disabled encryption for this channel.`;
        case "export_consent_enabled": return `${name} enabled conversation export.`;
        case "export_consent_disabled": return `${name} disabled conversation export.`;
        case "channel_created": return `${name} created this channel.`;
        default: return data.event ? `${name} — ${data.event}` : jsonText;
      }
    } catch {
      return jsonText;
    }
  }

  function convertMessage(msg: DecryptedMessage): HavenExportMessage {
    const isSystem = msg.messageType === "system";
    return {
      id: msg.id,
      sender_id: msg.senderId,
      sender_name: isSystem ? "System" : (userNames[msg.senderId] ?? msg.senderId),
      sender_display_name: null,
      timestamp: msg.timestamp,
      text: isSystem && msg.text ? formatSystemMessageText(msg.text) : msg.text,
      content_type: isSystem ? "text/plain" : (msg.contentType ?? "text/plain"),
      formatting: msg.formatting ? JSON.stringify(msg.formatting) : null,
      edited: msg.edited ?? false,
      reply_to: msg.replyToId ?? null,
      type: msg.messageType ?? "user",
      reactions: [],
      pinned: false,
      attachments: (msg.attachments ?? []).map(convertAttachment),
    };
  }

  function filterByDate(messages: DecryptedMessage[]): DecryptedMessage[] {
    const { after, before } = getDateFilter();
    let filtered = messages;
    if (after) {
      const afterTs = new Date(after).getTime();
      filtered = filtered.filter((m) => new Date(m.timestamp).getTime() >= afterTs);
    }
    if (before) {
      const beforeTs = new Date(before).getTime();
      filtered = filtered.filter((m) => new Date(m.timestamp).getTime() <= beforeTs);
    }
    return filtered;
  }

  async function decryptRawMessages(rawMessages: MessageResponse[]): Promise<DecryptedMessage[]> {
    const decrypted: DecryptedMessage[] = [];
    for (const raw of rawMessages) {
      if (raw.message_type === "system") {
        let sysText: string;
        try { sysText = unicodeAtob(raw.encrypted_body); } catch { sysText = raw.encrypted_body; }
        decrypted.push({
          id: raw.id, channelId: raw.channel_id, senderId: raw.sender_token,
          text: sysText, timestamp: raw.timestamp, messageType: "system", raw,
        });
        continue;
      }
      try {
        const msg = await decryptIncoming(raw);
        msg.edited = raw.edited;
        msg.replyToId = raw.reply_to_id;
        cacheMessage(msg);
        decrypted.push(msg);
      } catch {
        const cached = getCachedMessage(raw.id, raw.channel_id, raw.timestamp, raw.edited, raw);
        if (cached) {
          cached.replyToId = raw.reply_to_id;
          decrypted.push(cached);
        } else {
          decrypted.push({
            id: raw.id, channelId: raw.channel_id, senderId: "unknown",
            text: "[encrypted message]", timestamp: raw.timestamp, replyToId: raw.reply_to_id, raw,
          });
        }
      }
    }
    return decrypted;
  }

  async function fetchAllChannelMessages(channelId: string, onProgress: (count: number) => void): Promise<DecryptedMessage[]> {
    // Use already-decrypted messages from store if available
    const cached = storeMessages[channelId];
    if (cached && cached.length > 0) {
      return filterByDate(cached);
    }

    // Paginated fetch + decrypt for channels not yet loaded
    const PAGE_SIZE = 100;
    const allMessages: DecryptedMessage[] = [];
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (cancelledRef.current) return allMessages;
      const raw = await api.getMessages(channelId, { limit: PAGE_SIZE, before: cursor });
      if (raw.length === 0) break;

      // Process in chronological order (oldest first) for E2EE session setup
      raw.reverse();
      const batch = await decryptRawMessages(raw);
      allMessages.push(...batch);
      onProgress(allMessages.length);

      if (raw.length < PAGE_SIZE) break;
      // cursor is the oldest message ID in this batch (raw is reversed, so first is oldest)
      cursor = raw[0].id;
    }

    return filterByDate(allMessages);
  }

  async function runExport() {
    if (!context) return;
    cancelledRef.current = false;
    const startTime = Date.now();
    setProgress({
      phase: "messages",
      messagesLoaded: 0,
      messagesTotal: 0,
      attachmentsLoaded: 0,
      attachmentsTotal: 0,
      startTime,
    });

    try {
      const channelIds = scope === "server" && server
        ? channels.filter((c) => c.server_id === server.id && c.channel_type === "text").map((c) => c.id)
        : [context.id];

      const channelExports: HavenChannelExport[] = [];
      let totalMessages = 0;

      for (const chId of channelIds) {
        if (cancelledRef.current) return;
        const ch = channels.find((c) => c.id === chId);
        if (!ch) continue;

        const msgs = await fetchAllChannelMessages(chId, (count) => {
          setProgress((p) => p ? { ...p, messagesLoaded: totalMessages + count } : p);
        });
        totalMessages += msgs.length;
        setProgress((p) => p ? { ...p, messagesLoaded: totalMessages } : p);

        const chName = parseChannelName(ch.encrypted_meta);
        const exportMessages = msgs.map(convertMessage);
        const timestamps = exportMessages.map((m) => m.timestamp).filter(Boolean);

        // Resolve category name from ID
        const serverCategories = ch.server_id ? (categories[ch.server_id] ?? []) : [];
        const categoryName = ch.category_id
          ? serverCategories.find((cat) => cat.id === ch.category_id)?.name
          : undefined;

        channelExports.push({
          channel: {
            id: chId,
            name: chName,
            type: ch.channel_type,
            encrypted: ch.encrypted,
            created_at: ch.created_at,
            ...(categoryName ? { category: categoryName } : {}),
          },
          exported_at: new Date().toISOString(),
          exported_by: user?.id ?? "",
          message_count: exportMessages.length,
          date_range: {
            from: timestamps.length > 0 ? timestamps[timestamps.length - 1] : new Date().toISOString(),
            to: timestamps.length > 0 ? timestamps[0] : new Date().toISOString(),
          },
          messages: exportMessages,
        });
      }

      if (cancelledRef.current) return;

      setProgress((p) => p ? { ...p, phase: "building", messagesTotal: totalMessages } : p);

      // Build export data
      if (format === "json") {
        const exportData = channelExports.length === 1
          ? channelExports[0]
          : { channels: channelExports, exported_at: new Date().toISOString() };
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        triggerDownload(blob, `haven-${context.type}-${displayName || "export"}-${new Date().toISOString().slice(0, 10)}.json`);
      } else {
        // .haven archive mode using HavenArchiveBuilder
        try {
          const { HavenArchiveBuilder } = await import("@haven-chat-org/core");
          const exportScope = context.type === "server" ? "server" as const : context.type === "dm" ? "dm" as const : "channel" as const;
          const identityKeyPair = useAuthStore.getState().identityKeyPair;
          const builder = new HavenArchiveBuilder({
            exportedBy: {
              user_id: user?.id ?? "",
              username: user?.username ?? "",
              identity_key: identityKeyPair ? toBase64(identityKeyPair.publicKey) : "",
            },
            scope: exportScope,
            serverId: server?.id,
            channelId: channelExports.length === 1 ? channelExports[0].channel.id : undefined,
            instanceUrl: window.location.origin,
          });

          for (const chExport of channelExports) {
            builder.addChannel(chExport);
          }

          // Add server metadata for server exports
          if (exportScope === "server" && server) {
            try {
              const [categories, roles, members] = await Promise.all([
                api.listCategories(server.id),
                api.listRoles(server.id),
                api.listServerMembers(server.id),
              ]);
              const serverChannels = channels.filter((c) => c.server_id === server.id);
              const serverMeta: HavenServerExport = {
                server: {
                  id: server.id,
                  name: displayName,
                  description: null,
                  icon_url: server.icon_url ?? null,
                  created_at: server.created_at,
                },
                categories: categories.map((c) => ({ id: c.id, name: c.name, position: c.position })),
                channels: serverChannels.map((c) => ({
                  id: c.id,
                  name: parseChannelName(c.encrypted_meta),
                  type: c.channel_type,
                  category_id: c.category_id,
                  position: c.position,
                  encrypted: c.encrypted,
                  is_private: c.is_private,
                })),
                roles: roles.map((r) => ({
                  id: r.id, name: r.name, color: r.color,
                  permissions: Number(r.permissions), position: r.position, is_default: r.is_default,
                })),
                members: members.map((m) => ({
                  user_id: m.user_id, username: m.username,
                  display_name: m.display_name, nickname: m.nickname ?? null,
                  roles: m.role_ids, joined_at: m.joined_at,
                })),
                emojis: [],
                permission_overwrites: [],
              };
              builder.addServerMeta(serverMeta);

              // Add audit log if requested
              if (includeAuditLog) {
                try {
                  const auditEntries = await api.getAuditLog(server.id, { limit: 1000 });
                  builder.addAuditLog(auditEntries);
                } catch { /* audit log optional */ }
              }
            } catch { /* server metadata optional — export still works without it */ }
          }

          const signingKey = signExport && identityKeyPair ? identityKeyPair.privateKey : undefined;
          const zip = await builder.build(signingKey);
          const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
          triggerDownload(blob, `haven-${context.type}-${displayName || "export"}-${new Date().toISOString().slice(0, 10)}.${context.type}.haven`);
        } catch {
          // Fallback to JSON if haven-core archive builder not available
          const exportData = channelExports.length === 1
            ? channelExports[0]
            : { channels: channelExports, exported_at: new Date().toISOString() };
          const json = JSON.stringify(exportData, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          triggerDownload(blob, `haven-${context.type}-${displayName || "export"}-${new Date().toISOString().slice(0, 10)}.json`);
        }
      }

      setProgress((p) => p ? { ...p, phase: "complete" } : p);

      // Log export to audit log (best-effort, don't block on failure)
      try {
        await api.logExport({
          scope: context.type,
          server_id: server?.id,
          channel_id: channel?.id,
          message_count: channelExports.reduce((sum, ch) => sum + ch.messages.length, 0),
        });
      } catch { /* audit log is best-effort */ }

      setTimeout(closeExportModal, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setProgress((p) => p ? { ...p, phase: "failed", error: message } : p);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleCancel = useCallback(() => {
    if (progress && progress.phase !== "complete" && progress.phase !== "failed") {
      cancelledRef.current = true;
    }
    setProgress(null);
  }, [progress]);

  // Progress overlay
  if (progress) {
    const pct = progress.messagesTotal > 0
      ? Math.round((progress.messagesLoaded / progress.messagesTotal) * 100)
      : progress.phase === "complete" ? 100
      : progress.phase === "building" ? 90
      : 0;

    return (
      <div className="modal-overlay" role="presentation">
        <div className="modal-dialog export-progress-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("export.progress.title")}>
          <h3 className="modal-title">{progress.phase === "complete" ? t("export.progress.complete") : progress.phase === "failed" ? t("export.progress.failed") : t("export.progress.title")}</h3>
          <div className="export-progress-bar-container">
            <div className="export-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="export-progress-details">
            <p>{t("export.progress.messages", { loaded: progress.messagesLoaded, total: progress.messagesTotal || "?" })}</p>
            {progress.phase === "building" && <p>{t("export.progress.building")}</p>}
            {progress.error && <p className="export-error">{progress.error}</p>}
            <p className="export-elapsed">{t("export.progress.elapsed", { time: formatElapsed(progress.startTime) })}</p>
          </div>
          <div className="modal-footer">
            {progress.phase !== "complete" && (
              <button className="btn-ghost" onClick={handleCancel}>{t("export.progress.cancel")}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={closeExportModal} role="presentation">
      <div className="modal-dialog export-modal" onClick={(e) => e.stopPropagation()} ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("export.ariaLabel")}>
        <h3 className="modal-title">{title}</h3>

        {!canExportAll && context.type !== "dm" && (
          <div className="export-permissions-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            {t("export.ownMessagesWarning")}
          </div>
        )}

        {/* Scope */}
        {isServerContext && (
          <fieldset className="export-section">
            <legend className="export-section-title">{t("export.scope")}</legend>
            <label className="export-radio">
              <input type="radio" name="scope" checked={scope === "channel"} onChange={() => setScope("channel")} />
              {t("export.scope.channelOnly")}
            </label>
            <label className="export-radio">
              <input type="radio" name="scope" checked={scope === "server"} onChange={() => setScope("server")} />
              {t("export.scope.entireServer")}
            </label>
          </fieldset>
        )}

        {/* Date Range */}
        <fieldset className="export-section">
          <legend className="export-section-title">{t("export.dateRange")}</legend>
          <label className="export-radio">
            <input type="radio" name="dateRange" checked={dateRange === "all"} onChange={() => setDateRange("all")} />
            {t("export.dateRange.allTime")}
          </label>
          <label className="export-radio">
            <input type="radio" name="dateRange" checked={dateRange === "30days"} onChange={() => setDateRange("30days")} />
            {t("export.dateRange.last30Days")}
          </label>
          <label className="export-radio">
            <input type="radio" name="dateRange" checked={dateRange === "90days"} onChange={() => setDateRange("90days")} />
            {t("export.dateRange.last90Days")}
          </label>
          <label className="export-radio">
            <input type="radio" name="dateRange" checked={dateRange === "custom"} onChange={() => setDateRange("custom")} />
            {t("export.dateRange.custom")}
          </label>
          {dateRange === "custom" && (
            <div className="export-date-inputs">
              <label>
                {t("export.dateRange.from")}
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                {t("export.dateRange.to")}
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}
        </fieldset>

        {/* Include */}
        <fieldset className="export-section">
          <legend className="export-section-title">{t("export.include")}</legend>
          <label className="export-checkbox">
            <input type="checkbox" checked={includeMessages} onChange={(e) => setIncludeMessages(e.target.checked)} />
            {t("export.include.messages")}
          </label>
          <label className="export-checkbox">
            <input type="checkbox" checked={includePinned} onChange={(e) => setIncludePinned(e.target.checked)} />
            {t("export.include.pinned")}
          </label>
          <label className="export-checkbox">
            <input type="checkbox" checked={includeAttachments} onChange={(e) => setIncludeAttachments(e.target.checked)} />
            {t("export.include.attachments")}
          </label>
          {scope === "server" && (
            <label className="export-checkbox">
              <input type="checkbox" checked={includeAuditLog} onChange={(e) => setIncludeAuditLog(e.target.checked)} />
              {t("export.include.auditLog")}
            </label>
          )}
        </fieldset>

        {/* Format */}
        <fieldset className="export-section">
          <legend className="export-section-title">{t("export.format")}</legend>
          <label className="export-radio">
            <input type="radio" name="format" checked={format === "haven"} onChange={() => setFormat("haven")} />
            <span>
              {t("export.format.haven")}
              <span className="export-hint">{t("export.format.havenDesc")}</span>
            </span>
          </label>
          <label className="export-radio">
            <input type="radio" name="format" checked={format === "json"} onChange={() => setFormat("json")} />
            <span>
              {t("export.format.json")}
              <span className="export-hint">{t("export.format.jsonDesc")}</span>
            </span>
          </label>
        </fieldset>

        {/* Security */}
        {format === "haven" && (
          <fieldset className="export-section">
            <legend className="export-section-title">{t("export.security")}</legend>
            <label className="export-checkbox">
              <input type="checkbox" checked={signExport} onChange={(e) => setSignExport(e.target.checked)} />
              {t("export.security.sign")}
            </label>
          </fieldset>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={closeExportModal}>{t("export.cancel")}</button>
          <button className="btn-primary" onClick={runExport}>{t("export.startExport")}</button>
        </div>
      </div>
    </div>
  );
}
