import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { type ServerMemberResponse } from "@haven-chat-org/core";
import Avatar from "../Avatar.js";

interface MembersTabProps {
  serverId: string;
  members: ServerMemberResponse[];
  setMembers: React.Dispatch<React.SetStateAction<ServerMemberResponse[]>>;
  canManageRoles: boolean;
  canKickMembers: boolean;
  canBanMembers: boolean;
  setError: (msg: string) => void;
  setKickTarget: (target: { userId: string; username: string } | null) => void;
  setBanTarget: (target: { userId: string; username: string } | null) => void;
  setEditRolesTarget: (target: { userId: string; username: string } | null) => void;
}

export default function MembersTab({
  serverId,
  members,
  setMembers,
  canManageRoles,
  canKickMembers,
  canBanMembers,
  setError,
  setKickTarget,
  setBanTarget,
  setEditRolesTarget,
}: MembersTabProps) {
  const { t } = useTranslation();
  const user = useAuthStore.getState().user;

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.members.title")} ({members.length})</div>
      <div className="server-settings-member-list">
        {members.map((m) => (
          <div key={m.user_id} className="server-member-row">
            <Avatar
              avatarUrl={m.avatar_url}
              name={m.display_name || m.username}
              size={32}
            />
            <div className="server-member-info">
              <span className="server-member-name">
                {m.display_name || m.username}
              </span>
              <span className="server-member-username">@{m.username}</span>
            </div>
            {m.user_id !== user?.id && (canManageRoles || canKickMembers || canBanMembers) && (
              <div className="server-member-actions">
                {canManageRoles && (
                  <button
                    className="btn-ghost server-roles-btn"
                    onClick={() => setEditRolesTarget({ userId: m.user_id, username: m.display_name || m.username })}
                  >
                    {t("serverSettings.members.roles")}
                  </button>
                )}
                {canKickMembers && (
                  <button
                    className="btn-ghost server-kick-btn"
                    onClick={() => setKickTarget({ userId: m.user_id, username: m.display_name || m.username })}
                  >
                    {t("serverSettings.members.kick")}
                  </button>
                )}
                {canBanMembers && (
                  <button
                    className="btn-ghost server-ban-btn"
                    onClick={() => setBanTarget({ userId: m.user_id, username: m.display_name || m.username })}
                  >
                    {t("serverSettings.members.ban")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
