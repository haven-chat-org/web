import type { StateCreator } from "zustand";
import type { ChatState, TypingSlice } from "./types.js";
import { TYPING_THROTTLE_MS } from "./helpers.js";

let lastTypingSent = 0;

export const createTypingSlice: StateCreator<ChatState, [], [], TypingSlice> = (_set, get) => ({
  typingUsers: {},

  sendTyping() {
    const now = Date.now();
    if (now - lastTypingSent < TYPING_THROTTLE_MS) return;
    const { ws, currentChannelId } = get();
    if (!ws || !currentChannelId) return;
    lastTypingSent = now;
    try { ws.typing(currentChannelId); } catch { /* not connected */ }
  },
});
