import type {
  HavenWs,
  ChannelResponse,
  CategoryResponse,
  RoleResponse,
  MessageResponse,
  ServerResponse,
  ReactionGroup,
  CustomEmojiResponse,
  ContentFilterResponse,
} from "@haven-chat-org/core";

// ─── Exported Interfaces (used by 30+ consumer files) ─────────

export interface AttachmentMeta {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  key: string;   // base64 — file encryption key
  nonce: string;  // base64 — file encryption nonce
  thumbnail?: string; // base64 data URL — small JPEG preview (images only)
  width?: number;     // original image width
  height?: number;    // original image height
  spoiler?: boolean;  // true if marked as spoiler (blur until clicked)
  file_hash?: string; // SHA-256 hash of plaintext file (for known-bad hash matching)
}

export interface PendingUpload {
  file: File;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  spoiler?: boolean;
  meta?: AttachmentMeta;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

export interface ForwardedContent {
  sender_name: string;
  text: string;
  timestamp: string;
  channel_name?: string;
  content_type?: string;
  formatting?: object;
}

export interface DecryptedMessage {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  attachments?: AttachmentMeta[];
  linkPreviews?: LinkPreview[];
  contentType?: string;
  formatting?: object;
  timestamp: string;
  edited?: boolean;
  replyToId?: string | null;
  messageType?: string; // "user" | "system"
  filterAction?: "hide" | "warn" | null;
  expiresAt?: string | null;
  forwarded?: ForwardedContent;
  raw: MessageResponse;
}

// ─── Slice Interfaces ─────────────────────────────────────────

export interface MessagingSlice {
  messages: Record<string, DecryptedMessage[]>;
  editingMessageId: string | null;
  replyingToId: string | null;
  forwardingMessage: DecryptedMessage | null;
  reactions: Record<string, Array<{ emoji: string; userIds: string[] }>>;
  pinnedMessageIds: Record<string, string[]>;

  sendMessage(text: string, attachments?: AttachmentMeta[], formatting?: { contentType: string; data: object }, expiresAt?: string): Promise<void>;
  startEditing(messageId: string): void;
  cancelEditing(): void;
  submitEdit(messageId: string, text: string, formatting?: { contentType: string; data: object }): Promise<void>;
  deleteMessage(messageId: string): void;
  startReply(messageId: string): void;
  cancelReply(): void;
  loadPins(channelId: string): Promise<void>;
  pinMessage(messageId: string): void;
  unpinMessage(messageId: string): void;
  addReaction(messageId: string, emoji: string): void;
  removeReaction(messageId: string, emoji: string): void;
  toggleReaction(messageId: string, emoji: string): void;
  startForward(messageId: string): void;
  cancelForward(): void;
  forwardMessage(targetChannelId: string): Promise<void>;
  sendMessageToChannel(channelId: string, text: string, formatting?: { contentType: string; data: object }): Promise<void>;
  removeExpiredMessage(channelId: string, messageId: string): void;
}

export interface WebSocketSlice {
  ws: HavenWs | null;
  wsState: "disconnected" | "connecting" | "connected";

  connect(): void;
  disconnect(): void;
}

export interface TypingSlice {
  typingUsers: Record<string, Array<{ userId: string; username: string; expiry: number }>>;

  sendTyping(): void;
}

export interface UploadsSlice {
  pendingUploads: PendingUpload[];

  addFiles(files: File[]): void;
  removePendingUpload(index: number): void;
  togglePendingUploadSpoiler(index: number): void;
  uploadPendingFiles(): Promise<AttachmentMeta[]>;
}

export interface StateSlice {
  servers: ServerResponse[];
  channels: ChannelResponse[];
  categories: Record<string, CategoryResponse[]>;
  roles: Record<string, RoleResponse[]>;
  currentChannelId: string | null;
  userNames: Record<string, string>;
  userAvatars: Record<string, string>;
  blockedUserIds: string[];
  unreadCounts: Record<string, number>;
  mentionCounts: Record<string, number>;
  myPermissions: Record<string, bigint>;
  myRoleIds: Record<string, string[]>;
  userRoleColors: Record<string, string>;
  customEmojis: Record<string, CustomEmojiResponse[]>;
  memberTimeouts: Record<string, string | null>;
  memberListVersion: number;
  newMessageDividers: Record<string, number>;
  dataLoaded: boolean;
  contentFilters: Record<string, ContentFilterResponse[]>;

  loadChannels(): Promise<void>;
  selectChannel(channelId: string): Promise<void>;
  startDm(targetUsername: string): Promise<ChannelResponse>;
  getOrCreateDmChannel(targetUsername: string): Promise<ChannelResponse>;
  loadBlockedUsers(): Promise<void>;
  refreshPermissions(serverId: string): Promise<void>;
  navigateUnread(direction: "up" | "down"): void;
  fetchContentFilters(serverId: string): Promise<void>;
  checkContentFilter(serverId: string, plaintext: string): { filtered: boolean; action: "hide" | "warn" } | null;
  setChannelTtl(channelId: string, messageTtl: number | null): Promise<void>;
}

// ─── Composed ChatState ───────────────────────────────────────

export type ChatState = MessagingSlice & WebSocketSlice & TypingSlice & UploadsSlice & StateSlice;
