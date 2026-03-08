import { create } from "zustand";
import type { ChatState } from "./types.js";
import { createMessagingSlice } from "./messaging-slice.js";
import { createWebSocketSlice } from "./websocket-slice.js";
import { createTypingSlice } from "./typing-slice.js";
import { createUploadsSlice } from "./uploads-slice.js";
import { createStateSlice } from "./state-slice.js";
import { useAuthStore } from "../auth.js";

export const useChatStore = create<ChatState>((...a) => ({
  ...createMessagingSlice(...a),
  ...createWebSocketSlice(...a),
  ...createTypingSlice(...a),
  ...createUploadsSlice(...a),
  ...createStateSlice(...a),
}));

// ─── Auto-disconnect on logout ──────────────────────
// When user logs out (user becomes null), immediately disconnect the WS
// so the server can broadcast an offline presence update.
useAuthStore.subscribe((state) => {
  if (!state.user) {
    useChatStore.getState().disconnect();
  }
});
