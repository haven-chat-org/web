import { useTranslation } from "react-i18next";
import { useChatStore } from "../../store/chat.js";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChannelResponse, CategoryResponse } from "@haven-chat-org/core";
import SortableChannelItem from "./SortableChannelItem.js";

function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${id}`,
    data: { type: "category-drop", categoryId: id },
  });
  return (
    <div ref={setNodeRef} className={`droppable-category ${isOver ? "over" : ""}`}>
      {children}
    </div>
  );
}

export { DroppableZone };

export default function SortableCategorySection({
  cat,
  channels: catChannels,
  canManageChannels,
  isCollapsed,
  onToggleCollapse,
  onCreateChannel,
  onCategoryContextMenu,
  renamingCatId,
  renameCatValue,
  setRenameCatValue,
  onRenameCategory,
  setRenamingCatId,
  renamingId,
  renameValue,
  setRenameValue,
  onRenameChannel,
  setRenamingId,
  onChannelContextMenu,
  activeChannelId,
}: {
  cat: CategoryResponse;
  channels: ChannelResponse[];
  canManageChannels: boolean;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onCreateChannel: (catId: string, catName: string) => void;
  onCategoryContextMenu: (e: React.MouseEvent, catId: string) => void;
  renamingCatId: string | null;
  renameCatValue: string;
  setRenameCatValue: (v: string) => void;
  onRenameCategory: (catId: string) => void;
  setRenamingCatId: (v: string | null) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameChannel: (chId: string) => void;
  setRenamingId: (v: string | null) => void;
  onChannelContextMenu: (e: React.MouseEvent, chId: string) => void;
  activeChannelId: string | null;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `cat-${cat.id}`,
    disabled: false,
    data: { type: "category" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const unreadCounts = useChatStore((s) => s.unreadCounts);

  // When collapsed, still show unread or active channels
  const visibleChannels = isCollapsed
    ? catChannels.filter(
        (ch) =>
          ch.id === currentChannelId ||
          (unreadCounts[ch.id] ?? 0) > 0
      )
    : catChannels;

  const channelIds = catChannels.map((ch) => ch.id);

  return (
    <div ref={setNodeRef} style={style}>
      <DroppableZone id={cat.id}>
        <div
          className="channel-category-header"
          onContextMenu={(e) => onCategoryContextMenu(e, cat.id)}
        >
          {renamingCatId === cat.id ? (
            <div className="dm-input-row" style={{ flex: 1 }}>
              <input
                type="text"
                value={renameCatValue}
                onChange={(e) => setRenameCatValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameCategory(cat.id);
                  if (e.key === "Escape") setRenamingCatId(null);
                }}
                autoFocus
              />
              <button className="btn-small" onClick={() => onRenameCategory(cat.id)}>{t("channelSidebar.server.save")}</button>
            </div>
          ) : (
            <>
              <button
                className="category-collapse-btn"
                onClick={() => onToggleCollapse(cat.id)}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${cat.name}`}
                aria-expanded={!isCollapsed}
                {...attributes}
                {...listeners}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={`category-chevron ${isCollapsed ? "collapsed" : ""}`}
                >
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
                <span>{cat.name.toUpperCase()}</span>
              </button>
              {canManageChannels && (
                <button
                  className="btn-icon"
                  onClick={() => onCreateChannel(cat.id, cat.name)}
                  title={`Create Channel in ${cat.name}`}
                  aria-label={t("channelSidebar.server.createChannelAriaLabel")}
                >
                  +
                </button>
              )}
            </>
          )}
        </div>

        <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
          <ul className="channel-list">
            {(isCollapsed ? visibleChannels : catChannels).map((ch) => {
              if (renamingId === ch.id) {
                return (
                  <li key={ch.id}>
                    <div className="dm-input-row">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onRenameChannel(ch.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        autoFocus
                      />
                      <button className="btn-small" onClick={() => onRenameChannel(ch.id)}>{t("channelSidebar.server.save")}</button>
                    </div>
                  </li>
                );
              }
              return (
                <SortableChannelItem
                  key={ch.id}
                  ch={ch}
                  disabled={isCollapsed}
                  onContextMenu={onChannelContextMenu}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DroppableZone>
    </div>
  );
}
