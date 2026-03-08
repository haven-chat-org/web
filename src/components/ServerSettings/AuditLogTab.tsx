import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { type AuditLogEntry } from "@haven-chat-org/core";

/** Format snake_case audit action into a readable label. */
function formatAuditAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface AuditLogTabProps {
  serverId: string;
  setError: (msg: string) => void;
}

export default function AuditLogTab({
  serverId,
  setError,
}: AuditLogTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(true);

  // Load audit log when tab mounts
  useEffect(() => {
    if (auditEntries.length > 0) return; // already loaded
    setAuditLoading(true);
    api.getAuditLog(serverId, { limit: 50 }).then((entries) => {
      setAuditEntries(entries);
      setAuditHasMore(entries.length >= 50);
    }).catch(() => {
      setError(t("serverSettings.audit.failedLoad"));
    }).finally(() => setAuditLoading(false));
  }, [serverId]);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.audit.title")}</div>
      {auditLoading && auditEntries.length === 0 && (
        <p className="settings-description">{t("serverSettings.audit.loading")}</p>
      )}
      {auditEntries.length === 0 && !auditLoading && (
        <p className="settings-description">{t("serverSettings.audit.emptyMessage")}</p>
      )}
      <div className="audit-log-list">
        {auditEntries.map((entry) => (
          <div key={entry.id} className="audit-log-entry">
            <div className="audit-log-entry-header">
              <span className="audit-log-actor">{entry.actor_username}</span>
              <span className="audit-log-action">{formatAuditAction(entry.action)}</span>
              {entry.target_type && (
                <span className="audit-log-target">
                  {entry.target_type}{entry.target_id ? ` ${entry.target_id.slice(0, 8)}` : ""}
                </span>
              )}
            </div>
            {entry.reason && (
              <div className="audit-log-reason">{t("serverSettings.audit.reason")} {entry.reason}</div>
            )}
            {entry.changes && Object.keys(entry.changes).length > 0 && (
              <div className="audit-log-changes">
                {Object.entries(entry.changes).map(([key, val]) => (
                  <span key={key} className="audit-log-change">
                    {key}: {typeof val === "string" ? val : JSON.stringify(val)}
                  </span>
                ))}
              </div>
            )}
            <time className="audit-log-time">
              {new Date(entry.created_at).toLocaleString()}
            </time>
          </div>
        ))}
      </div>
      {auditHasMore && auditEntries.length > 0 && (
        <button
          className="btn-ghost"
          style={{ marginTop: 12 }}
          disabled={auditLoading}
          onClick={async () => {
            setAuditLoading(true);
            try {
              const last = auditEntries[auditEntries.length - 1];
              const more = await api.getAuditLog(serverId, { limit: 50, before: last.id });
              setAuditEntries((prev) => [...prev, ...more]);
              setAuditHasMore(more.length >= 50);
            } catch {
              setError(t("serverSettings.audit.failedLoadMore"));
            } finally {
              setAuditLoading(false);
            }
          }}
        >
          {auditLoading ? t("serverSettings.audit.loading") : t("serverSettings.audit.loadMore")}
        </button>
      )}
    </div>
  );
}
