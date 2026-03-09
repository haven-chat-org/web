import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChannelResponse } from "@haven-chat-org/core";
import ChannelItemContent from "./ChannelItemContent.js";

export default function SortableChannelItem({
  ch,
  disabled,
  onContextMenu,
}: {
  ch: ChannelResponse;
  disabled?: boolean;
  onContextMenu?: (e: React.MouseEvent, chId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ch.id,
    disabled: disabled,
    data: { type: "channel", categoryId: ch.category_id ?? "uncategorized" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ChannelItemContent ch={ch} onContextMenu={onContextMenu} />
    </li>
  );
}
