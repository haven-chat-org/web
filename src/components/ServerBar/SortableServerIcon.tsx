import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableServerIconProps {
  id: string;
  name: string;
  iconUrl?: string | null;
  isActive: boolean;
  unread: number;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  innerRef: (el: HTMLDivElement | null) => void;
}

export default function SortableServerIcon({
  id,
  name,
  iconUrl,
  isActive,
  unread,
  onSelect,
  onContextMenu,
  innerRef,
}: SortableServerIconProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

  return (
    <div
      ref={(el) => { setNodeRef(el); innerRef(el); }}
      style={style}
      className={`server-icon-wrapper ${isActive ? "active" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="server-pill" />
      <button
        className={`server-icon ${isActive ? "active" : ""}`}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        title={name}
        aria-label={name}
        data-roving-item
        tabIndex={isActive ? 0 : -1}
      >
        {iconUrl ? (
          <img src={iconUrl} alt={name} className="server-icon-img" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
        {unread > 0 && <span className="server-unread-badge">{unread}</span>}
      </button>
    </div>
  );
}
