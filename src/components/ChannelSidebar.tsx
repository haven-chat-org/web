import { useTranslation } from "react-i18next";
import { useUiStore } from "../store/ui.js";
import UserPanel from "./UserPanel.js";
import DmView from "./ChannelSidebar/DmView.js";
import ServerView from "./ChannelSidebar/ServerView.js";

export default function ChannelSidebar() {
  const { t } = useTranslation();
  const selectedServerId = useUiStore((s) => s.selectedServerId);

  return (
    <aside className="channel-sidebar" aria-label={t("channelSidebar.ariaLabel")}>
      {selectedServerId === null ? <DmView /> : <ServerView serverId={selectedServerId} />}
      <UserPanel />
    </aside>
  );
}
