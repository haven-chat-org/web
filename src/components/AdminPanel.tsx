import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore, useIsAdmin } from "../store/auth.js";
import type { AdminStats, AdminUserResponse, AdminReportResponse, ReportCounts, InstanceBanResponse, BlockedHashResponse } from "@haven-chat-org/core";

type Tab = "stats" | "users" | "reports" | "bans" | "hashes";

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const isAdmin = useIsAdmin();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("stats");

  // Report state
  const [reports, setReports] = useState<AdminReportResponse[]>([]);
  const [reportCounts, setReportCounts] = useState<ReportCounts | null>(null);
  const [reportFilter, setReportFilter] = useState<string>("");
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");

  // Ban state
  const [instanceBans, setInstanceBans] = useState<InstanceBanResponse[]>([]);
  const [banReason, setBanReason] = useState("");
  const [banningUserId, setBanningUserId] = useState<string | null>(null);

  // Blocked hash state
  const [blockedHashes, setBlockedHashes] = useState<BlockedHashResponse[]>([]);
  const [newHash, setNewHash] = useState("");
  const [newHashDesc, setNewHashDesc] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const s = await api.getAdminStats();
      setStats(s);
    } catch {
      setError(t("adminPanel.errors.failedLoadStats"));
    }
  }, [api]);

  const loadUsers = useCallback(async (q?: string) => {
    try {
      const u = await api.listAdminUsers(q || undefined, 50, 0);
      setUsers(u);
    } catch {
      setError(t("adminPanel.errors.failedLoadUsers"));
    }
  }, [api]);

  const loadReports = useCallback(async () => {
    try {
      const [r, counts] = await Promise.all([
        api.listAdminReports(reportFilter || undefined, 50, 0),
        api.getReportCounts(),
      ]);
      setReports(r);
      setReportCounts(counts);
    } catch {
      setError(t("adminPanel.errors.failedLoadReports"));
    }
  }, [api, reportFilter]);

  const loadInstanceBans = useCallback(async () => {
    try {
      const b = await api.listInstanceBans(50, 0);
      setInstanceBans(b);
    } catch {
      setError(t("adminPanel.errors.failedLoadBans"));
    }
  }, [api]);

  const loadBlockedHashes = useCallback(async () => {
    try {
      const h = await api.listBlockedHashes(50, 0);
      setBlockedHashes(h);
    } catch {
      setError(t("adminPanel.errors.failedLoadHashes"));
    }
  }, [api]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([loadStats(), loadUsers()]).finally(() => setLoading(false));
  }, [isAdmin, loadStats, loadUsers]);

  useEffect(() => {
    if (tab === "reports") loadReports();
  }, [tab, loadReports]);

  useEffect(() => {
    if (tab === "bans") loadInstanceBans();
  }, [tab, loadInstanceBans]);

  useEffect(() => {
    if (tab === "hashes") loadBlockedHashes();
  }, [tab, loadBlockedHashes]);

  const handleSearch = useCallback(() => {
    loadUsers(search);
  }, [search, loadUsers]);

  const toggleAdmin = useCallback(async (userId: string, currentlyAdmin: boolean) => {
    try {
      await api.setUserAdmin(userId, !currentlyAdmin);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_instance_admin: !currentlyAdmin } : u
        )
      );
    } catch {
      setError(t("adminPanel.errors.failedUpdateAdmin"));
    }
  }, [api]);

  const deleteUser = useCallback(async (userId: string, username: string) => {
    if (!confirm(t("adminPanel.users.deleteConfirm", { username }))) return;
    try {
      await api.adminDeleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      loadStats();
    } catch {
      setError(t("adminPanel.errors.failedDeleteUser"));
    }
  }, [api, loadStats]);

  // ─── Report actions ─────────────────────────────────

  const expandReport = (report: AdminReportResponse) => {
    if (expandedReportId === report.id) {
      setExpandedReportId(null);
      return;
    }
    setExpandedReportId(report.id);
    setEditNotes(report.admin_notes || "");
    setEditStatus(report.status);
  };

  const saveReport = useCallback(async (reportId: string) => {
    try {
      await api.updateAdminReport(reportId, { status: editStatus, admin_notes: editNotes || undefined });
      setExpandedReportId(null);
      loadReports();
    } catch {
      setError(t("adminPanel.errors.failedUpdateReport"));
    }
  }, [api, editStatus, editNotes, loadReports]);

  const escalateReport = useCallback(async (reportId: string) => {
    if (!confirm(t("adminPanel.reports.escalateConfirm"))) return;
    try {
      await api.updateAdminReport(reportId, { status: "escalated_ncmec" });
      setExpandedReportId(null);
      loadReports();
    } catch {
      setError(t("adminPanel.errors.failedEscalateReport"));
    }
  }, [api, loadReports]);

  // ─── Instance ban actions ───────────────────────────

  const showBanModal = (userId: string) => {
    setBanningUserId(userId);
    setBanReason("");
  };

  const confirmInstanceBan = useCallback(async () => {
    if (!banningUserId) return;
    try {
      const ban = await api.instanceBanUser(banningUserId, { reason: banReason || undefined });
      setInstanceBans((prev) => [ban, ...prev]);
      setUsers((prev) => prev.filter((u) => u.id !== banningUserId));
      setBanningUserId(null);
      loadStats();
    } catch {
      setError(t("adminPanel.errors.failedBanUser"));
    }
  }, [api, banningUserId, banReason, loadStats]);

  const revokeInstanceBan = useCallback(async (userId: string) => {
    if (!confirm(t("adminPanel.bans.revokeConfirm"))) return;
    try {
      await api.instanceRevokeBan(userId);
      setInstanceBans((prev) => prev.filter((b) => b.user_id !== userId));
    } catch {
      setError(t("adminPanel.errors.failedRevokeBan"));
    }
  }, [api]);

  // ─── Blocked hash actions ─────────────────────────

  const addBlockedHash = useCallback(async () => {
    const hash = newHash.trim().toLowerCase();
    if (hash.length !== 64 || !/^[0-9a-f]+$/.test(hash)) {
      setError(t("adminPanel.hashes.invalidHash"));
      return;
    }
    try {
      const created = await api.createBlockedHash({ hash, description: newHashDesc || undefined });
      setBlockedHashes((prev) => [created, ...prev]);
      setNewHash("");
      setNewHashDesc("");
    } catch {
      setError(t("adminPanel.errors.failedCreateHash"));
    }
  }, [api, newHash, newHashDesc]);

  const deleteBlockedHash = useCallback(async (hashId: string) => {
    if (!confirm(t("adminPanel.hashes.deleteConfirm"))) return;
    try {
      await api.deleteBlockedHash(hashId);
      setBlockedHashes((prev) => prev.filter((h) => h.id !== hashId));
    } catch {
      setError(t("adminPanel.errors.failedDeleteHash"));
    }
  }, [api]);

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "pending": return "report-status-badge status-pending";
      case "reviewed": return "report-status-badge status-reviewed";
      case "dismissed": return "report-status-badge status-dismissed";
      case "escalated_ncmec": return "report-status-badge status-escalated";
      default: return "report-status-badge";
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-panel-header">
          <h2>{t("adminPanel.title")}</h2>
          <button className="admin-close-btn" onClick={onClose} aria-label={t("adminPanel.closeAriaLabel")}>
            &times;
          </button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${tab === "stats" ? "active" : ""}`}
            onClick={() => setTab("stats")}
          >
            {t("adminPanel.tab.overview")}
          </button>
          <button
            className={`admin-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            {t("adminPanel.tab.users")}
          </button>
          <button
            className={`admin-tab ${tab === "reports" ? "active" : ""}`}
            onClick={() => setTab("reports")}
          >
            {t("adminPanel.tab.reports")}
            {reportCounts && reportCounts.pending > 0 && (
              <span className="admin-tab-badge">{reportCounts.pending}</span>
            )}
          </button>
          <button
            className={`admin-tab ${tab === "bans" ? "active" : ""}`}
            onClick={() => setTab("bans")}
          >
            {t("adminPanel.tab.bans")}
          </button>
          <button
            className={`admin-tab ${tab === "hashes" ? "active" : ""}`}
            onClick={() => setTab("hashes")}
          >
            {t("adminPanel.tab.hashes")}
          </button>
        </div>

        {error && <div className="settings-error" style={{ padding: "0 24px" }}>{error}</div>}

        {loading && tab === "stats" ? (
          <div className="admin-loading">{t("adminPanel.loading")}</div>
        ) : tab === "stats" ? (
          <div className="admin-stats">
            <div className="admin-stat-card">
              <span className="admin-stat-value">{stats?.total_users ?? 0}</span>
              <span className="admin-stat-label">{t("adminPanel.stats.users")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{stats?.total_servers ?? 0}</span>
              <span className="admin-stat-label">{t("adminPanel.stats.servers")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{stats?.total_channels ?? 0}</span>
              <span className="admin-stat-label">{t("adminPanel.stats.channels")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{stats?.total_messages ?? 0}</span>
              <span className="admin-stat-label">{t("adminPanel.stats.messages")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{stats?.active_connections ?? 0}</span>
              <span className="admin-stat-label">{t("adminPanel.stats.activeConnections")}</span>
            </div>
          </div>
        ) : tab === "users" ? (
          <div className="admin-users">
            <div className="admin-search-row">
              <input
                className="settings-input"
                type="text"
                placeholder={t("adminPanel.users.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button className="btn-primary" onClick={handleSearch}>{t("adminPanel.users.search")}</button>
            </div>
            <div className="admin-user-list">
              {users.map((u) => (
                <div key={u.id} className="admin-user-row">
                  <div className="admin-user-info">
                    {u.avatar_url ? (
                      <img className="admin-user-avatar" src={u.avatar_url} alt="" />
                    ) : (
                      <div className="admin-user-avatar admin-user-avatar-placeholder">
                        {(u.display_name || u.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="admin-user-details">
                      <span className="admin-user-name">
                        {u.display_name || u.username}
                        {u.is_instance_admin && <span className="admin-badge">{t("adminPanel.users.adminBadge")}</span>}
                      </span>
                      <span className="admin-user-meta">
                        @{u.username} &middot; {u.server_count} server{u.server_count !== 1 ? "s" : ""} &middot; {t("adminPanel.users.joined")} {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="admin-user-actions">
                    {u.id !== currentUserId && (
                      <>
                        <button
                          className={`btn-small ${u.is_instance_admin ? "btn-danger-outline" : "btn-primary-outline"}`}
                          onClick={() => toggleAdmin(u.id, u.is_instance_admin)}
                        >
                          {u.is_instance_admin ? t("adminPanel.users.revokeAdmin") : t("adminPanel.users.grantAdmin")}
                        </button>
                        <button
                          className="btn-small btn-danger-outline"
                          onClick={() => showBanModal(u.id)}
                          title={t("adminPanel.users.instanceBan")}
                        >
                          {t("adminPanel.users.instanceBan")}
                        </button>
                        <button
                          className="btn-small btn-danger"
                          onClick={() => deleteUser(u.id, u.username)}
                        >
                          {t("adminPanel.users.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="admin-empty">{t("adminPanel.users.noUsersFound")}</div>
              )}
            </div>
          </div>
        ) : tab === "reports" ? (
          <div className="admin-reports" style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
            <div className="admin-search-row" style={{ marginBottom: 12 }}>
              <select
                className="settings-input"
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                style={{ maxWidth: 180 }}
              >
                <option value="">{t("adminPanel.reports.filterAll")}</option>
                <option value="pending">{t("adminPanel.reports.filterPending")}</option>
                <option value="reviewed">{t("adminPanel.reports.filterReviewed")}</option>
                <option value="dismissed">{t("adminPanel.reports.filterDismissed")}</option>
                <option value="escalated_ncmec">{t("adminPanel.reports.filterEscalated")}</option>
              </select>
            </div>
            <div className="admin-reports-table">
              {reports.map((r) => (
                <div key={r.id}>
                  <div className="admin-report-row" onClick={() => expandReport(r)}>
                    <span className="admin-report-reporter">@{r.reporter_username}</span>
                    <span className="admin-report-reason">{r.reason.length > 60 ? r.reason.slice(0, 60) + "..." : r.reason}</span>
                    <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    <span className="admin-report-date">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {expandedReportId === r.id && (
                    <div className="report-detail">
                      <div className="report-detail-field">
                        <label>{t("adminPanel.reports.reason")}</label>
                        <p>{r.reason}</p>
                      </div>
                      <div className="report-detail-field">
                        <label>{t("adminPanel.reports.status")}</label>
                        <select
                          className="settings-input"
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          style={{ maxWidth: 200 }}
                        >
                          <option value="pending">pending</option>
                          <option value="reviewed">reviewed</option>
                          <option value="dismissed">dismissed</option>
                        </select>
                      </div>
                      <div className="report-detail-field">
                        <label>{t("adminPanel.reports.adminNotes")}</label>
                        <textarea
                          className="settings-input"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                          style={{ resize: "vertical", width: "100%" }}
                        />
                      </div>
                      {r.escalated_to && (
                        <div className="report-detail-field">
                          <label>{t("adminPanel.reports.escalatedInfo")}</label>
                          <p>{t("adminPanel.reports.escalatedAt", { date: new Date(r.escalated_at!).toLocaleString() })}</p>
                        </div>
                      )}
                      <div className="report-actions">
                        <button className="btn-primary btn-small" onClick={() => saveReport(r.id)}>
                          {t("adminPanel.reports.save")}
                        </button>
                        {r.status !== "escalated_ncmec" && (
                          <button className="btn-small btn-danger" onClick={() => escalateReport(r.id)}>
                            {t("adminPanel.reports.escalateNcmec")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {reports.length === 0 && (
                <div className="admin-empty">{t("adminPanel.reports.noReports")}</div>
              )}
            </div>
          </div>
        ) : tab === "bans" ? (
          <div className="admin-bans" style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
            <div className="admin-reports-table">
              {instanceBans.map((b) => (
                <div key={b.id} className="admin-ban-row">
                  <div className="admin-ban-info">
                    <span className="admin-ban-username">@{b.username}</span>
                    <span className="admin-ban-reason">{b.reason || t("adminPanel.bans.noReason")}</span>
                    <span className="admin-ban-meta">
                      {t("adminPanel.bans.bannedBy", { admin: b.banned_by_username })} &middot; {new Date(b.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button className="btn-small btn-danger-outline" onClick={() => revokeInstanceBan(b.user_id)}>
                    {t("adminPanel.bans.revoke")}
                  </button>
                </div>
              ))}
              {instanceBans.length === 0 && (
                <div className="admin-empty">{t("adminPanel.bans.noBans")}</div>
              )}
            </div>
          </div>
        ) : tab === "hashes" ? (
          <div className="admin-hashes" style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
            <div className="hash-add-form" style={{ marginBottom: 16 }}>
              <input
                className="settings-input"
                type="text"
                placeholder={t("adminPanel.hashes.hashPlaceholder")}
                value={newHash}
                onChange={(e) => setNewHash(e.target.value)}
                style={{ fontFamily: "monospace", marginBottom: 8, width: "100%" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="settings-input"
                  type="text"
                  placeholder={t("adminPanel.hashes.descriptionPlaceholder")}
                  value={newHashDesc}
                  onChange={(e) => setNewHashDesc(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={addBlockedHash}>
                  {t("adminPanel.hashes.add")}
                </button>
              </div>
            </div>
            <div className="admin-reports-table">
              {blockedHashes.map((h) => (
                <div key={h.id} className="admin-ban-row">
                  <div className="admin-ban-info">
                    <span className="hash-value">{h.hash}</span>
                    <span className="admin-ban-reason">{h.description || "\u2014"}</span>
                    <span className="admin-ban-meta">
                      {t("adminPanel.hashes.addedBy")} {h.added_by_username} &middot; {new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button className="btn-small btn-danger-outline" onClick={() => deleteBlockedHash(h.id)}>
                    {t("adminPanel.hashes.delete")}
                  </button>
                </div>
              ))}
              {blockedHashes.length === 0 && (
                <div className="admin-empty">{t("adminPanel.hashes.noHashes")}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Instance Ban Modal */}
      {banningUserId && (
        <div className="modal-overlay" onClick={() => setBanningUserId(null)} style={{ zIndex: 1001 }}>
          <div className="instance-ban-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("adminPanel.bans.banTitle")}</h3>
            <div className="report-detail-field">
              <label>{t("adminPanel.bans.reasonLabel")}</label>
              <textarea
                className="settings-input"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                rows={3}
                placeholder={t("adminPanel.bans.reasonPlaceholder")}
                style={{ resize: "vertical", width: "100%" }}
              />
            </div>
            <div className="report-actions">
              <button className="btn-small btn-danger" onClick={confirmInstanceBan}>
                {t("adminPanel.bans.confirmBan")}
              </button>
              <button className="btn-small btn-primary-outline" onClick={() => setBanningUserId(null)}>
                {t("adminPanel.bans.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
