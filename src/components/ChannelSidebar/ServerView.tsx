import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../store/chat.js";
import { useAuthStore } from "../../store/auth.js";
import { useUiStore } from "../../store/ui.js";
import { Permission, type ChannelResponse, type CategoryResponse } from "@haven-chat-org/core";
import { usePermissions } from "../../hooks/usePermissions.js";
import { unicodeBtoa } from "../../lib/base64.js";
import { useRovingTabindex } from "../../hooks/useRovingTabindex.js";
import { parseChannelName, parseServerName } from "../../lib/channel-utils.js";
import CreateChannelModal from "../CreateChannelModal.js";
import ConfirmDialog from "../ConfirmDialog.js";
const ServerSettings = lazy(() => import("../ServerSettings.js"));
import ChannelSettings from "../ChannelSettings.js";
import InviteToServerModal from "../InviteToServerModal.js";
import {
  DndContext,
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor as DndPointerSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import ChannelContextMenu from "./ChannelContextMenu.js";
import CategoryContextMenuPopup from "./CategoryContextMenu.js";
import ServerHeaderContextMenu from "./ServerHeaderContextMenu.js";
import ServerDropdownMenu from "./ServerDropdownMenu.js";
import SortableChannelItem from "./SortableChannelItem.js";
import ChannelItemContent from "./ChannelItemContent.js";
import SortableCategorySection, { DroppableZone } from "./SortableCategorySection.js";

/** PointerSensor that ignores right-click so context menus don't trigger drag. */
class PointerSensor extends DndPointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (...args: Parameters<(typeof DndPointerSensor.activators)[0]["handler"]>) => {
        const [{ nativeEvent }] = args;
        if (nativeEvent.button === 2) return false;
        return DndPointerSensor.activators[0].handler(...args);
      },
    },
  ];
}

export default function ServerView({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const channels = useChatStore((s) => s.channels);
  const servers = useChatStore((s) => s.servers);
  const serverCategories = useChatStore((s) => s.categories[serverId]) ?? [];
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const selectChannel = useChatStore((s) => s.selectChannel);
  const loadChannels = useChatStore((s) => s.loadChannels);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const hideMutedChannels = useUiStore((s) => s.hideMutedChannels);
  const setHideMutedChannels = useUiStore((s) => s.setHideMutedChannels);
  const isChannelMuted = useUiStore((s) => s.isChannelMuted);
  const api = useAuthStore((s) => s.api);
  const user = useAuthStore((s) => s.user);

  const [showSettings, setShowSettings] = useState(false);
  const [createModal, setCreateModal] = useState<{ categoryId?: string | null; categoryName?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ channelId: string; x: number; y: number; submenu?: "mute" | "notify" } | null>(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState<{ categoryId: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renameCatValue, setRenameCatValue] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<string | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [serverContextMenu, setServerContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmLeaveServer, setConfirmLeaveServer] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  const channelListRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown: handleChannelRovingKeyDown } = useRovingTabindex(channelListRef);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server ? parseServerName(server.encrypted_meta) : "Server";
  const serverChannels = channels.filter((ch) => ch.server_id === serverId);

  const [chUnreadAbove, setChUnreadAbove] = useState(false);
  const [chUnreadBelow, setChUnreadBelow] = useState(false);

  const checkChannelScrollIndicators = useCallback(() => {
    const container = channelListRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let above = false;
    let below = false;
    const items = container.querySelectorAll(".channel-item.unread");
    for (const el of items) {
      const elRect = el.getBoundingClientRect();
      if (elRect.bottom < rect.top + 4) above = true;
      if (elRect.top > rect.bottom - 4) below = true;
    }
    setChUnreadAbove(above);
    setChUnreadBelow(below);
  }, [unreadCounts]);

  useEffect(() => {
    checkChannelScrollIndicators();
  }, [unreadCounts, serverChannels.length, checkChannelScrollIndicators]);

  useEffect(() => {
    const container = channelListRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkChannelScrollIndicators, { passive: true });
    return () => container.removeEventListener("scroll", checkChannelScrollIndicators);
  }, [checkChannelScrollIndicators]);
  const { can, isOwner } = usePermissions(serverId);
  const canManageChannels = can(Permission.MANAGE_CHANNELS);
  const canCreateInvites = can(Permission.CREATE_INVITES);
  const canManageServer = can(Permission.MANAGE_SERVER);

  // Auto-select a channel when switching to a server with no active channel
  useEffect(() => {
    if (serverChannels.length === 0) return;
    const currentInServer = currentChannelId && serverChannels.some((ch) => ch.id === currentChannelId);
    if (currentInServer) return;

    // Prefer the system channel, then fall back to first text channel
    const systemId = server?.system_channel_id;
    const target = (systemId && serverChannels.find((ch) => ch.id === systemId))
      || serverChannels.find((ch) => ch.channel_type === "text")
      || serverChannels[0];
    if (target) selectChannel(target.id);
  }, [serverId, serverChannels.length]);

  // Group channels by category, sorted by position
  const { uncategorized, categorized } = useMemo(() => {
    const uncategorized: ChannelResponse[] = [];
    const categorized: Record<string, ChannelResponse[]> = {};

    for (const cat of serverCategories) {
      categorized[cat.id] = [];
    }

    for (const ch of serverChannels) {
      if (ch.category_id && categorized[ch.category_id]) {
        categorized[ch.category_id].push(ch);
      } else {
        uncategorized.push(ch);
      }
    }

    // Sort channels by position within each group
    uncategorized.sort((a, b) => a.position - b.position);
    for (const catId of Object.keys(categorized)) {
      categorized[catId].sort((a, b) => a.position - b.position);
    }

    return { uncategorized, categorized };
  }, [serverChannels, serverCategories]);

  // Build a mutable local order map for optimistic reordering
  const [localOrder, setLocalOrder] = useState<Record<string, string[]> | null>(null);

  // Get ordered channel IDs for a container
  const getChannelIds = useCallback(
    (containerId: string) => {
      if (localOrder && localOrder[containerId]) return localOrder[containerId];
      const list = containerId === "uncategorized" ? uncategorized : (categorized[containerId] ?? []);
      return list.map((ch) => ch.id);
    },
    [localOrder, uncategorized, categorized],
  );

  // Get channel list for a container (using local order if dragging)
  const getOrderedChannels = useCallback(
    (containerId: string) => {
      const ids = getChannelIds(containerId);
      return ids
        .map((id) => serverChannels.find((ch) => ch.id === id))
        .filter((ch): ch is ChannelResponse => ch != null);
    },
    [getChannelIds, serverChannels],
  );

  function toggleCollapse(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  async function handleRename(channelId: string) {
    if (!renameValue.trim()) return;
    try {
      const meta = JSON.stringify({ name: renameValue.trim() });
      await api.updateChannel(channelId, { encrypted_meta: unicodeBtoa(meta) });
      await loadChannels();
      setRenamingId(null);
    } catch { /* non-fatal */ }
  }

  async function handleDelete(channelId: string) {
    try {
      const wasCurrent = useChatStore.getState().currentChannelId === channelId;
      await api.deleteChannel(channelId);
      await loadChannels();
      if (wasCurrent) {
        useChatStore.setState({ currentChannelId: null });
      }
    } catch { /* non-fatal */ }
  }

  async function handleRenameCategory(catId: string) {
    if (!renameCatValue.trim()) return;
    try {
      await api.updateCategory(serverId, catId, { name: renameCatValue.trim() });
      await loadChannels();
      setRenamingCatId(null);
    } catch { /* non-fatal */ }
  }

  async function handleDeleteCategory(catId: string) {
    try {
      await api.deleteCategory(serverId, catId);
      await loadChannels();
    } catch { /* non-fatal */ }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await api.createCategory(serverId, {
        name: newCategoryName.trim(),
        position: serverCategories.length,
      });
      await loadChannels();
      setNewCategoryName("");
      setShowCreateCategory(false);
    } catch { /* non-fatal */ }
  }

  async function handleLeaveServer() {
    try {
      await api.leaveServer(serverId);
      useUiStore.getState().selectServer(null);
      await loadChannels();
    } catch { /* non-fatal */ }
  }

  const headerBtnRef = useRef<HTMLButtonElement>(null);

  function handleContextMenu(e: React.MouseEvent, channelId: string) {
    e.preventDefault();
    setCategoryContextMenu(null);
    setServerContextMenu(null);
    setContextMenu({ channelId, x: e.clientX, y: e.clientY });
  }

  function handleCategoryContextMenu(e: React.MouseEvent, categoryId: string) {
    if (!canManageChannels) return;
    e.preventDefault();
    setContextMenu(null);
    setServerContextMenu(null);
    setCategoryContextMenu({ categoryId, x: e.clientX, y: e.clientY });
  }

  function handleServerContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu(null);
    setCategoryContextMenu(null);
    setServerContextMenu({ x: e.clientX, y: e.clientY });
  }

  // Close context menus on outside click
  useEffect(() => {
    if (!contextMenu && !categoryContextMenu && !serverContextMenu) return;
    const handler = () => { setContextMenu(null); setCategoryContextMenu(null); setServerContextMenu(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu, categoryContextMenu, serverContextMenu]);

  // ─── Drag & Drop ────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Find which container a channel belongs to
  function findContainer(channelId: string): string | null {
    // Check local order first
    if (localOrder) {
      for (const [containerId, ids] of Object.entries(localOrder)) {
        if (ids.includes(channelId)) return containerId;
      }
    }
    // Fallback to store data
    const ch = serverChannels.find((c) => c.id === channelId);
    if (!ch) return null;
    return ch.category_id ?? "uncategorized";
  }

  // Build initial order from store data
  function buildOrderMap(): Record<string, string[]> {
    const order: Record<string, string[]> = {};
    order.uncategorized = uncategorized.map((ch) => ch.id);
    for (const cat of serverCategories) {
      order[cat.id] = (categorized[cat.id] ?? []).map((ch) => ch.id);
    }
    return order;
  }

  // Custom collision detection: when dragging a category, only collide with other categories
  // using pointer Y position instead of closestCenter (which fails for tall containers)
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeData = args.active.data.current;
    if (activeData?.type === "category") {
      const catContainers = args.droppableContainers.filter(
        (c) => c.id.toString().startsWith("cat-")
      );
      // Use pointer Y coordinate to find the nearest category
      const pointerY = args.pointerCoordinates?.y;
      if (pointerY != null) {
        let closest: { id: string | number; distance: number } | null = null;
        for (const container of catContainers) {
          const rect = args.droppableRects.get(container.id);
          if (!rect) continue;
          // Distance from pointer to top of container (header area)
          const dist = Math.abs(pointerY - rect.top);
          if (!closest || dist < closest.distance) {
            closest = { id: container.id, distance: dist };
          }
        }
        if (closest) {
          return [{ id: closest.id }];
        }
      }
      return closestCenter({ ...args, droppableContainers: catContainers });
    }
    return closestCenter(args);
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveDragId(id);
    // Initialize local order on drag start
    setLocalOrder(buildOrderMap());
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Only handle channel drags (not category drags)
    const activeData = active.data.current;
    if (activeData?.type === "category") return;

    const activeContainer = findContainer(activeId);
    let overContainer: string | null = null;

    // Determine what we're over
    const overData = over.data.current;
    if (overData?.type === "category-drop") {
      overContainer = overData.categoryId;
    } else {
      overContainer = findContainer(overId);
    }

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Move channel between containers
    setLocalOrder((prev) => {
      const order = prev ? { ...prev } : buildOrderMap();
      const sourceIds = [...(order[activeContainer] ?? [])];
      const destIds = [...(order[overContainer!] ?? [])];

      const sourceIdx = sourceIds.indexOf(activeId);
      if (sourceIdx < 0) return prev;

      // Remove from source
      sourceIds.splice(sourceIdx, 1);

      // Find insert position in dest
      const overIdx = destIds.indexOf(overId);
      if (overIdx >= 0) {
        destIds.splice(overIdx, 0, activeId);
      } else {
        destIds.push(activeId);
      }

      return {
        ...order,
        [activeContainer]: sourceIds,
        [overContainer!]: destIds,
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) {
      setLocalOrder(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeData = active.data.current;

    // Handle category reorder
    if (activeData?.type === "category") {
      const catIds = serverCategories.map((c) => `cat-${c.id}`);
      const oldIdx = catIds.indexOf(activeId);
      const newIdx = catIds.indexOf(overId);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const newOrder = arrayMove(catIds, oldIdx, newIdx);
        try {
          await api.reorderCategories(serverId, {
            order: newOrder.map((cid, i) => ({
              id: cid.replace("cat-", ""),
              position: i,
            })),
          });
          await loadChannels();
        } catch {
          await loadChannels(); // reset to server state on permission error
        }
      }
      setLocalOrder(null);
      return;
    }

    // Handle channel reorder/move
    const currentOrder = localOrder ?? buildOrderMap();
    const container = findContainer(activeId);

    if (container) {
      const containerIds = [...(currentOrder[container] ?? [])];
      const oldIdx = containerIds.indexOf(activeId);
      const newIdx = containerIds.indexOf(overId);

      // Same container reorder
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        currentOrder[container] = arrayMove(containerIds, oldIdx, newIdx);
      }
    }

    // Persist all channel positions + category assignments
    const allPositions: Array<{ id: string; position: number; category_id: string | null }> = [];
    for (const [containerId, ids] of Object.entries(currentOrder)) {
      ids.forEach((chId, idx) => {
        allPositions.push({
          id: chId,
          position: idx,
          category_id: containerId === "uncategorized" ? null : containerId,
        });
      });
    }

    if (allPositions.length > 0) {
      try {
        await api.reorderChannels(serverId, { order: allPositions });
        await loadChannels();
      } catch {
        await loadChannels(); // reset to server state on permission error
      }
    }

    setLocalOrder(null);
  }

  // ─── Render ─────────────────────────────────────────

  const categoryIds = serverCategories.map((c) => `cat-${c.id}`);
  const uncatChannelIds = getChannelIds("uncategorized");
  const draggedChannel = activeDragId
    ? serverChannels.find((ch) => ch.id === activeDragId)
    : null;
  const draggedCategory = activeDragId?.startsWith("cat-")
    ? serverCategories.find((c) => `cat-${c.id}` === activeDragId)
    : null;

  return (
    <>
      <div className="channel-sidebar-header" onContextMenu={handleServerContextMenu}>
        <button
          ref={headerBtnRef}
          className="server-name-header"
          onClick={() => setShowServerDropdown((v) => !v)}
          title={t("channelSidebar.server.serverOptions")}
        >
          <span>{serverName}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={`server-name-chevron${showServerDropdown ? " server-name-chevron-open" : ""}`}>
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </button>
        {showServerDropdown && headerBtnRef.current && (
          <ServerDropdownMenu
            anchorRect={headerBtnRef.current.getBoundingClientRect()}
            onInvite={() => setShowInviteModal(true)}
            onSettings={() => setShowSettings(true)}
            onCreateChannel={() => setCreateModal({ categoryId: null })}
            onCreateCategory={() => setShowCreateCategory(true)}
            onLeave={() => setConfirmLeaveServer(true)}
            canCreateInvites={canCreateInvites}
            canManageServer={canManageServer}
            canManageChannels={canManageChannels}
            isOwner={isOwner}
            onClose={() => setShowServerDropdown(false)}
          />
        )}
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {chUnreadAbove && (
          <button
            className="channel-scroll-unread-indicator channel-scroll-unread-above"
            onClick={() => {
              const first = channelListRef.current?.querySelector(".channel-item.unread");
              first?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            aria-label={t("channelSidebar.server.unreadAboveAriaLabel")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
            {t("channelSidebar.server.new")}
          </button>
        )}
        {chUnreadBelow && (
          <button
            className="channel-scroll-unread-indicator channel-scroll-unread-below"
            onClick={() => {
              const items = channelListRef.current?.querySelectorAll(".channel-item.unread");
              items?.[items.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            aria-label={t("channelSidebar.server.unreadBelowAriaLabel")}
          >
            {t("channelSidebar.server.new")}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
          </button>
        )}
      <div className="channel-sidebar-content" ref={channelListRef} onKeyDown={handleChannelRovingKeyDown} onContextMenu={(e) => {
        // Only fire for empty space (not on channels/categories which have their own handlers)
        if (e.defaultPrevented) return;
        handleServerContextMenu(e);
      }}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Uncategorized channels */}
          {(uncategorized.length > 0 || serverCategories.length === 0) && (
            <DroppableZone id="uncategorized">
              <div className="channel-category-header">
                <span>{t("channelSidebar.server.textChannels")}</span>
                {canManageChannels && (
                  <button
                    className="btn-icon"
                    onClick={() => setCreateModal({ categoryId: null })}
                    title={t("channelSidebar.server.createChannelTitle")}
                    aria-label={t("channelSidebar.server.createChannelAriaLabel")}
                  >
                    +
                  </button>
                )}
              </div>

              <SortableContext items={uncatChannelIds} strategy={verticalListSortingStrategy}>
                <ul className="channel-list">
                  {getOrderedChannels("uncategorized").filter((ch) => !hideMutedChannels || !isChannelMuted(ch.id) || ch.id === currentChannelId).map((ch) => {
                    if (renamingId === ch.id) {
                      return (
                        <li key={ch.id}>
                          <div className="dm-input-row">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(ch.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              autoFocus
                            />
                            <button className="btn-small" onClick={() => handleRename(ch.id)}>{t("channelSidebar.server.save")}</button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <SortableChannelItem key={ch.id} ch={ch} onContextMenu={handleContextMenu} />
                    );
                  })}
                  {uncategorized.length === 0 && serverCategories.length === 0 && (
                    <li className="channel-empty">{t("channelSidebar.server.noChannelsYet")}</li>
                  )}
                </ul>
              </SortableContext>
            </DroppableZone>
          )}

          {/* Categories (sortable) */}
          <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
            {serverCategories.map((cat) => {
              const isCollapsed = collapsedCategories.has(cat.id);
              const catChannels = getOrderedChannels(cat.id).filter((ch) => !hideMutedChannels || !isChannelMuted(ch.id) || ch.id === currentChannelId);
              return (
                <SortableCategorySection
                  key={cat.id}
                  cat={cat}
                  channels={catChannels}
                  canManageChannels={canManageChannels}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={toggleCollapse}
                  onCreateChannel={(catId, catName) => setCreateModal({ categoryId: catId, categoryName: catName })}
                  onCategoryContextMenu={handleCategoryContextMenu}
                  renamingCatId={renamingCatId}
                  renameCatValue={renameCatValue}
                  setRenameCatValue={setRenameCatValue}
                  onRenameCategory={handleRenameCategory}
                  setRenamingCatId={setRenamingCatId}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onRenameChannel={handleRename}
                  setRenamingId={setRenamingId}
                  onChannelContextMenu={handleContextMenu}
                  activeChannelId={currentChannelId}
                />
              );
            })}
          </SortableContext>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedChannel ? (
              <div className="channel-drag-overlay">
                <ChannelItemContent ch={draggedChannel} isOverlay />
              </div>
            ) : draggedCategory ? (
              <div className="channel-drag-overlay category-drag-overlay">
                <span className="category-drag-label">{draggedCategory.name.toUpperCase()}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      </div>

      {/* Right-click context menu for channels */}
      {contextMenu && (
        <ChannelContextMenu
          channelId={contextMenu.channelId}
          x={contextMenu.x}
          y={contextMenu.y}
          submenu={contextMenu.submenu}
          canManageChannels={canManageChannels}
          onPermissions={() => {
            setEditingChannelId(contextMenu.channelId);
            setContextMenu(null);
          }}
          onDelete={() => {
            setConfirmDeleteChannel(contextMenu.channelId);
            setContextMenu(null);
          }}
          onShowSubmenu={(sub) => setContextMenu({ ...contextMenu, submenu: sub })}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Right-click context menu for categories */}
      {categoryContextMenu && (
        <CategoryContextMenuPopup
          x={categoryContextMenu.x}
          y={categoryContextMenu.y}
          onCreateChannel={() => {
            setCreateModal({ categoryId: categoryContextMenu.categoryId, categoryName: serverCategories.find((c) => c.id === categoryContextMenu.categoryId)?.name });
            setCategoryContextMenu(null);
          }}
          onRenameCategory={() => {
            const cat = serverCategories.find((c) => c.id === categoryContextMenu.categoryId);
            setRenameCatValue(cat?.name ?? "");
            setRenamingCatId(categoryContextMenu.categoryId);
            setCategoryContextMenu(null);
          }}
          onCreateCategory={() => {
            setShowCreateCategory(true);
            setCategoryContextMenu(null);
          }}
          onDeleteCategory={() => {
            setConfirmDeleteCategory(categoryContextMenu.categoryId);
            setCategoryContextMenu(null);
          }}
        />
      )}

      {/* Right-click context menu for server header / empty space */}
      {serverContextMenu && (
        <ServerHeaderContextMenu
          x={serverContextMenu.x}
          y={serverContextMenu.y}
          canManageChannels={canManageChannels}
          canCreateInvites={canCreateInvites}
          hideMutedChannels={hideMutedChannels}
          onCreateChannel={() => {
            setCreateModal({ categoryId: null });
            setServerContextMenu(null);
          }}
          onCreateCategory={() => {
            setShowCreateCategory(true);
            setServerContextMenu(null);
          }}
          onInvite={() => {
            setShowInviteModal(true);
            setServerContextMenu(null);
          }}
          onToggleHideMuted={() => {
            setHideMutedChannels(!hideMutedChannels);
            setServerContextMenu(null);
          }}
        />
      )}

      {/* Inline Create Category */}
      {showCreateCategory && (
        <div className="modal-overlay" onClick={() => setShowCreateCategory(false)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{t("channelSidebar.createCategory.title")}</h3>
            <input
              type="text"
              className="modal-input"
              placeholder={t("channelSidebar.createCategory.placeholder")}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCategory();
                if (e.key === "Escape") setShowCreateCategory(false);
              }}
              autoFocus
            />
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateCategory(false)}>{t("channelSidebar.createCategory.cancel")}</button>
              <button className="btn-primary" onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>{t("channelSidebar.createCategory.create")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {createModal && (
        <CreateChannelModal
          serverId={serverId}
          categoryId={createModal.categoryId}
          categoryName={createModal.categoryName}
          onClose={() => setCreateModal(null)}
        />
      )}

      {/* Delete Channel Confirmation */}
      {confirmDeleteChannel && (
        <ConfirmDialog
          title={t("channelSidebar.confirm.deleteChannel.title")}
          message={t("channelSidebar.confirm.deleteChannel.message")}
          confirmLabel={t("channelSidebar.confirm.deleteChannel.label")}
          danger
          onConfirm={() => {
            handleDelete(confirmDeleteChannel);
            setConfirmDeleteChannel(null);
          }}
          onCancel={() => setConfirmDeleteChannel(null)}
        />
      )}

      {/* Delete Category Confirmation */}
      {confirmDeleteCategory && (
        <ConfirmDialog
          title={t("channelSidebar.confirm.deleteCategory.title")}
          message={t("channelSidebar.confirm.deleteCategory.message")}
          confirmLabel={t("channelSidebar.confirm.deleteCategory.label")}
          danger
          onConfirm={() => {
            handleDeleteCategory(confirmDeleteCategory);
            setConfirmDeleteCategory(null);
          }}
          onCancel={() => setConfirmDeleteCategory(null)}
        />
      )}

      {showSettings && server && (
        <Suspense fallback={null}>
          <ServerSettings
            serverId={serverId}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      )}

      {editingChannelId && (
        <ChannelSettings
          channelId={editingChannelId}
          serverId={serverId}
          onClose={() => setEditingChannelId(null)}
        />
      )}

      {showInviteModal && (
        <InviteToServerModal
          serverId={serverId}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {confirmLeaveServer && (
        <ConfirmDialog
          title={t("channelSidebar.confirm.leaveServer.title")}
          message={t("channelSidebar.confirm.leaveServer.message", { serverName })}
          confirmLabel={t("channelSidebar.confirm.leaveServer.label")}
          danger
          onConfirm={() => {
            handleLeaveServer();
            setConfirmLeaveServer(false);
          }}
          onCancel={() => setConfirmLeaveServer(false)}
        />
      )}
    </>
  );
}
