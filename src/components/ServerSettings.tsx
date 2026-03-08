import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth.js";
import { useChatStore } from "../store/chat.js";
import { Permission, type InviteResponse, type ServerMemberResponse, type CategoryResponse, type BanResponse } from "@haven-chat-org/core";
import { usePermissions } from "../hooks/usePermissions.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import RoleSettings from "./RoleSettings.js";
import ConfirmDialog from "./ConfirmDialog.js";
import BanMemberModal from "./BanMemberModal.js";
import EditMemberRolesModal from "./EditMemberRolesModal.js";
import OverviewTab from "./ServerSettings/OverviewTab.js";
import MembersTab from "./ServerSettings/MembersTab.js";
import InvitesTab from "./ServerSettings/InvitesTab.js";
import CategoriesTab from "./ServerSettings/CategoriesTab.js";
import BansTab from "./ServerSettings/BansTab.js";
import EmojiTab from "./ServerSettings/EmojiTab.js";
import AuditLogTab from "./ServerSettings/AuditLogTab.js";
import ContentFiltersTab from "./ServerSettings/ContentFiltersTab.js";
import BackupTab from "./ServerSettings/BackupTab.js";

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function ServerSettings({ serverId, onClose }: Props) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const { can } = usePermissions(serverId);

  const canManageServer = can(Permission.MANAGE_SERVER);
  const canManageInvites = can(Permission.MANAGE_INVITES);
  const canCreateInvites = can(Permission.CREATE_INVITES);
  const canManageChannels = can(Permission.MANAGE_CHANNELS);
  const canManageRoles = can(Permission.MANAGE_ROLES);
  const canBanMembers = can(Permission.BAN_MEMBERS);
  const canKickMembers = can(Permission.KICK_MEMBERS);
  const canManageEmojis = can(Permission.MANAGE_EMOJIS);
  const canViewAuditLog = can(Permission.VIEW_AUDIT_LOG);

  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [members, setMembers] = useState<ServerMemberResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [bans, setBans] = useState<BanResponse[]>([]);

  const [tab, setTab] = useState<"overview" | "members" | "invites" | "categories" | "roles" | "bans" | "emoji" | "audit" | "backup" | "filters">(
    canManageServer ? "overview" : "members"
  );
  const [error, setError] = useState("");

  // Confirmation modals
  const [kickTarget, setKickTarget] = useState<{ userId: string; username: string } | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; username: string } | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ id: string; name: string } | null>(null);
  const [editRolesTarget, setEditRolesTarget] = useState<{ userId: string; username: string } | null>(null);
  const [deleteEmojiTarget, setDeleteEmojiTarget] = useState<{ id: string; name: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    loadData();
  }, [serverId]);

  async function loadData() {
    try {
      const m = await api.listServerMembers(serverId);
      setMembers(m);

      const [inv, cats, b] = await Promise.all([
        (canManageInvites || canCreateInvites)
          ? api.listInvites(serverId) : Promise.resolve([] as InviteResponse[]),
        canManageChannels
          ? api.listCategories(serverId) : Promise.resolve([] as CategoryResponse[]),
        canBanMembers
          ? api.listBans(serverId) : Promise.resolve([] as BanResponse[]),
      ]);
      setInvites(inv);
      setCategories(cats);
      setBans(b);
    } catch (err: any) {
      setError(err.message || t("serverSettings.failedLoadData"));
    }
  }

  async function handleKick(userId: string) {
    try {
      await api.kickMember(serverId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      setKickTarget(null);
    } catch (err: any) {
      setError(err.message || t("serverSettings.failedKick"));
    }
  }

  async function handleDeleteCategory(catId: string) {
    setError("");
    try {
      await api.deleteCategory(serverId, catId);
      setCategories((prev) => prev.filter((c) => c.id !== catId));
      setDeleteCatTarget(null);
      useChatStore.getState().loadChannels();
    } catch (err: any) {
      setError(err.message || t("serverSettings.categories.failedDelete"));
    }
  }

  return (
    <>
      <div className="user-settings-overlay" role="presentation">
        <div className="user-settings-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("serverSettings.ariaLabel")}>
          <nav className="user-settings-sidebar">
            <div className="user-settings-sidebar-header">{t("serverSettings.sidebarHeader")}</div>
            {canManageServer && (
              <button
                className={`user-settings-nav-item ${tab === "overview" ? "active" : ""}`}
                onClick={() => setTab("overview")}
              >
                {t("serverSettings.tab.overview")}
              </button>
            )}
            <button
              className={`user-settings-nav-item ${tab === "members" ? "active" : ""}`}
              onClick={() => setTab("members")}
            >
              {t("serverSettings.tab.members")}
            </button>
            {(canManageInvites || canCreateInvites) && (
              <button
                className={`user-settings-nav-item ${tab === "invites" ? "active" : ""}`}
                onClick={() => setTab("invites")}
              >
                {t("serverSettings.tab.invites")}
              </button>
            )}
            {canManageChannels && (
              <button
                className={`user-settings-nav-item ${tab === "categories" ? "active" : ""}`}
                onClick={() => setTab("categories")}
              >
                {t("serverSettings.tab.categories")}
              </button>
            )}
            {canManageRoles && (
              <button
                className={`user-settings-nav-item ${tab === "roles" ? "active" : ""}`}
                onClick={() => setTab("roles")}
              >
                {t("serverSettings.tab.roles")}
              </button>
            )}
            {canBanMembers && (
              <button
                className={`user-settings-nav-item ${tab === "bans" ? "active" : ""}`}
                onClick={() => setTab("bans")}
              >
                {t("serverSettings.tab.bans")}
              </button>
            )}
            {canManageEmojis && (
              <button
                className={`user-settings-nav-item ${tab === "emoji" ? "active" : ""}`}
                onClick={() => setTab("emoji")}
              >
                {t("serverSettings.tab.emoji")}
              </button>
            )}
            {canViewAuditLog && (
              <button
                className={`user-settings-nav-item ${tab === "audit" ? "active" : ""}`}
                onClick={() => setTab("audit")}
              >
                {t("serverSettings.tab.auditLog")}
              </button>
            )}
            {canManageServer && (
              <button
                className={`user-settings-nav-item ${tab === "filters" ? "active" : ""}`}
                onClick={() => setTab("filters")}
              >
                {t("serverSettings.tab.contentFilters")}
              </button>
            )}
            {canManageServer && (
              <button
                className={`user-settings-nav-item ${tab === "backup" ? "active" : ""}`}
                onClick={() => setTab("backup")}
              >
                {t("serverSettings.tab.backup")}
              </button>
            )}
            <div className="user-settings-sidebar-divider" />
          </nav>

          <div className="user-settings-content">
            <button className="settings-esc-close" onClick={onClose} aria-label={t("serverSettings.closeAriaLabel")}>
              <div className="settings-esc-circle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </div>
              <span className="settings-esc-label">{t("serverSettings.escLabel")}</span>
            </button>
            {error && <div className="settings-error" style={{ marginBottom: 16 }}>{error}</div>}

            {tab === "overview" && canManageServer && (
              <OverviewTab serverId={serverId} error={error} setError={setError} />
            )}

            {tab === "members" && (
              <MembersTab
                serverId={serverId}
                members={members}
                setMembers={setMembers}
                canManageRoles={canManageRoles}
                canKickMembers={canKickMembers}
                canBanMembers={canBanMembers}
                setError={setError}
                setKickTarget={setKickTarget}
                setBanTarget={setBanTarget}
                setEditRolesTarget={setEditRolesTarget}
              />
            )}

            {tab === "invites" && (canManageInvites || canCreateInvites) && (
              <InvitesTab
                serverId={serverId}
                invites={invites}
                setInvites={setInvites}
                canManageInvites={canManageInvites}
                setError={setError}
              />
            )}

            {tab === "categories" && canManageChannels && (
              <CategoriesTab
                serverId={serverId}
                categories={categories}
                setCategories={setCategories}
                setError={setError}
                setDeleteCatTarget={setDeleteCatTarget}
              />
            )}

            {tab === "bans" && canBanMembers && (
              <BansTab
                serverId={serverId}
                bans={bans}
                setBans={setBans}
                setError={setError}
              />
            )}

            {tab === "roles" && canManageRoles && (
              <RoleSettings serverId={serverId} />
            )}

            {tab === "emoji" && canManageEmojis && (
              <EmojiTab
                serverId={serverId}
                setError={setError}
                setDeleteEmojiTarget={setDeleteEmojiTarget}
              />
            )}

            {tab === "audit" && canViewAuditLog && (
              <AuditLogTab
                serverId={serverId}
                setError={setError}
              />
            )}

            {tab === "filters" && canManageServer && (
              <ContentFiltersTab
                serverId={serverId}
                setError={setError}
              />
            )}

            {tab === "backup" && canManageServer && (
              <BackupTab
                serverId={serverId}
                setError={setError}
              />
            )}
          </div>
        </div>
      </div>

      {/* Kick confirmation */}
      {kickTarget && (
        <ConfirmDialog
          title={t("serverSettings.confirm.kickTitle")}
          message={t("serverSettings.confirm.kickMessage", { username: kickTarget.username })}
          confirmLabel={t("serverSettings.confirm.kickLabel")}
          danger
          onConfirm={() => handleKick(kickTarget.userId)}
          onCancel={() => setKickTarget(null)}
        />
      )}

      {/* Ban modal */}
      {banTarget && (
        <BanMemberModal
          serverId={serverId}
          userId={banTarget.userId}
          username={banTarget.username}
          onBanned={(userId) => {
            setMembers((prev) => prev.filter((m) => m.user_id !== userId));
            loadData();
          }}
          onClose={() => setBanTarget(null)}
        />
      )}

      {/* Edit member roles */}
      {editRolesTarget && (
        <EditMemberRolesModal
          serverId={serverId}
          userId={editRolesTarget.userId}
          username={editRolesTarget.username}
          onClose={() => setEditRolesTarget(null)}
        />
      )}

      {/* Delete category confirmation */}
      {deleteCatTarget && (
        <ConfirmDialog
          title={t("serverSettings.confirm.deleteCategoryTitle")}
          message={t("serverSettings.confirm.deleteCategoryMessage", { name: deleteCatTarget.name })}
          confirmLabel={t("serverSettings.confirm.deleteCategoryLabel")}
          danger
          onConfirm={() => handleDeleteCategory(deleteCatTarget.id)}
          onCancel={() => setDeleteCatTarget(null)}
        />
      )}

      {/* Delete emoji confirmation */}
      {deleteEmojiTarget && (
        <ConfirmDialog
          title={t("serverSettings.confirm.deleteEmojiTitle")}
          message={t("serverSettings.confirm.deleteEmojiMessage", { name: deleteEmojiTarget.name })}
          confirmLabel={t("serverSettings.confirm.deleteEmojiLabel")}
          danger
          onConfirm={async () => {
            try {
              await api.deleteEmoji(serverId, deleteEmojiTarget.id);
              setDeleteEmojiTarget(null);
            } catch (err: any) {
              setError(err.message || t("serverSettings.emoji.failedDelete"));
              setDeleteEmojiTarget(null);
            }
          }}
          onCancel={() => setDeleteEmojiTarget(null)}
        />
      )}
    </>
  );
}
