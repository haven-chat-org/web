import type { StateCreator } from "zustand";
import {
  encryptFile,
  hashFile,
  toBase64,
} from "@haven-chat-org/core";
import { getServerUrl } from "../../lib/serverUrl.js";
import { useAuthStore } from "../auth.js";
import type { ChatState, UploadsSlice, AttachmentMeta, PendingUpload } from "./types.js";
import { generateThumbnail, isMediaFile } from "./helpers.js";

export const createUploadsSlice: StateCreator<ChatState, [], [], UploadsSlice> = (set, get) => ({
  pendingUploads: [],

  addFiles(files: File[]) {
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    const rejected = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(", ");
      alert(`File(s) too large (max 500MB): ${names}`);
    }
    const accepted = files.filter((f) => f.size <= MAX_FILE_SIZE);
    if (accepted.length === 0) return;

    const newUploads: PendingUpload[] = accepted.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    set((state) => ({ pendingUploads: [...state.pendingUploads, ...newUploads] }));
  },

  removePendingUpload(index: number) {
    set((state) => ({
      pendingUploads: state.pendingUploads.filter((_, i) => i !== index),
    }));
  },

  togglePendingUploadSpoiler(index: number) {
    set((state) => ({
      pendingUploads: state.pendingUploads.map((u, i) =>
        i === index ? { ...u, spoiler: !u.spoiler } : u
      ),
    }));
  },

  async uploadPendingFiles() {
    const { pendingUploads } = get();
    if (pendingUploads.length === 0) return [];

    const { api } = useAuthStore.getState();
    const results: AttachmentMeta[] = [];

    for (let i = 0; i < pendingUploads.length; i++) {
      const upload = pendingUploads[i];

      // Mark uploading
      set((state) => ({
        pendingUploads: state.pendingUploads.map((u, idx) =>
          idx === i ? { ...u, status: "uploading" as const, progress: 0 } : u
        ),
      }));

      try {
        // 1. Encrypt the file client-side
        const fileBytes = new Uint8Array(await upload.file.arrayBuffer());
        const fileHash = await hashFile(fileBytes);
        const { encrypted, key, nonce } = encryptFile(fileBytes);

        // 2. Upload encrypted blob with progress tracking via XHR
        const encryptedBuf = (encrypted.buffer as ArrayBuffer).slice(
          encrypted.byteOffset,
          encrypted.byteOffset + encrypted.byteLength,
        );
        const { attachment_id } = await new Promise<{ attachment_id: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const token = api.currentAccessToken;
          xhr.open("POST", `${getServerUrl()}/api/v1/attachments/upload`);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.setRequestHeader("X-File-Hash", fileHash);
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              set((state) => ({
                pendingUploads: state.pendingUploads.map((u, idx) =>
                  idx === i ? { ...u, progress: pct } : u
                ),
              }));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText)); }
              catch { reject(new Error("Invalid upload response")); }
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.send(encryptedBuf);
        });

        const meta: AttachmentMeta = {
          id: attachment_id,
          filename: upload.file.name,
          mime_type: upload.file.type || "application/octet-stream",
          size: upload.file.size,
          key: toBase64(key),
          nonce: toBase64(nonce),
          file_hash: fileHash,
        };

        // Generate thumbnail for images
        if (upload.file.type.startsWith("image/")) {
          const thumb = await generateThumbnail(upload.file);
          if (thumb) {
            meta.thumbnail = thumb.dataUrl;
            meta.width = thumb.width;
            meta.height = thumb.height;
          }
        }

        // Pass through spoiler flag
        if (upload.spoiler) {
          meta.spoiler = true;
        }

        // Pre-cache the original file as a blob URL so the rendered message
        // shows the full-quality image immediately (avoids re-downloading the
        // same file we just uploaded and showing a pixelated thumbnail instead).
        if (isMediaFile(upload.file.type)) {
          const { preCacheBlobUrl } = await import("../../components/MessageAttachments.js");
          preCacheBlobUrl(attachment_id, URL.createObjectURL(upload.file));
        }

        results.push(meta);

        // Mark done
        set((state) => ({
          pendingUploads: state.pendingUploads.map((u, idx) =>
            idx === i ? { ...u, status: "done" as const, progress: 100, meta } : u
          ),
        }));
      } catch {
        set((state) => ({
          pendingUploads: state.pendingUploads.map((u, idx) =>
            idx === i ? { ...u, status: "error" as const } : u
          ),
        }));
      }
    }

    // Clear only successful uploads; keep failed ones visible so the user sees the error
    const failedUploads = get().pendingUploads.filter((u) => u.status === "error");
    set({ pendingUploads: failedUploads });
    return results;
  },
});
