import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ServerFolder } from "./helpers.js";

interface SortableFolderIconProps {
  id: string;
  folderId: string;
  folder: ServerFolder;
  isExpanded: boolean;
  hasActive: boolean;
  folderUnread: number;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export default function SortableFolderIcon({
  id,
  folderId,
  folder,
  isExpanded,
  hasActive,
  folderUnread,
  onToggle,
  onContextMenu,
  children,
}: SortableFolderIconProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `folder-drop-${folderId}` });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

  const folderButton = (
    <button
      className={`server-folder-icon ${hasActive ? "active" : ""}`}
      style={{ borderColor: folder.color }}
      onClick={onToggle}
      title={folder.name}
      aria-label={`${folder.name} folder${isExpanded ? " (expanded)" : ""}`}
      aria-expanded={isExpanded}
      data-roving-item
      {...listeners}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={folder.color} aria-hidden="true">
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>
      {folderUnread > 0 && <span className="server-unread-dot" />}
    </button>
  );

  return (
    <div
      ref={(el) => { setSortableRef(el); setDropRef(el); }}
      style={style}
      className={`server-folder-wrapper ${isOver ? "folder-drop-hover" : ""}`}
      onContextMenu={onContextMenu}
      {...attributes}
    >
      {isExpanded ? (
        <div className="server-folder-expanded" style={{ "--folder-bg": `${folder.color}18` } as React.CSSProperties}>
          {folderButton}
          {children}
          <div className="server-folder-end-line" style={{ borderColor: folder.color }} />
        </div>
      ) : (
        folderButton
      )}
    </div>
  );
}
