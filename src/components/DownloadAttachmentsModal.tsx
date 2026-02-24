import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { zipSync } from "fflate";
import { decryptFile, fromBase64 } from "@haven-chat-org/core";
import { useUiStore } from "../store/ui.js";
import { useAuthStore } from "../store/auth.js";
import { useChatStore } from "../store/chat.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { parseChannelName } from "../lib/channel-utils.js";
import {
  scanChannelAttachments,
  matchesFilter,
  formatFileSize,
  type AttachmentFilter,
  type ScanProgress,
  type ScannedAttachment,
} from "../lib/attachment-scanner.js";

interface DownloadProgress {
  loaded: number;
  total: number;
  error?: string;
}

const FILTER_OPTIONS: AttachmentFilter[] = ["all", "images", "videos", "audio", "files"];

export default function DownloadAttachmentsModal() {
  const { t } = useTranslation();
  const context = useUiStore((s) => s.attachmentsModalContext);
  const closeModal = useUiStore((s) => s.closeAttachmentsModal);
  const api = useAuthStore((s) => s.api);
  const channels = useChatStore((s) => s.channels);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const [filter, setFilter] = useState<AttachmentFilter>("all");
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [attachments, setAttachments] = useState<ScannedAttachment[] | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve channel name for title
  const channel = channels.find((c) => c.id === context?.id);
  const channelName = channel ? parseChannelName(channel.encrypted_meta) : "";

  // Escape to close (only when not downloading)
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !downloadProgress) closeModal();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeModal, downloadProgress]);

  // Start scan on mount
  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    abortRef.current = controller;

    scanChannelAttachments(context.id, setScanProgress, controller.signal)
      .then((results) => setAttachments(results))
      .catch((err) => {
        if (err.name !== "AbortError") {
          setScanProgress({ phase: "failed", messagesScanned: 0, attachmentsFound: 0, error: err.message });
        }
      });

    return () => controller.abort();
  }, [context]);

  const filtered = attachments?.filter((a) => matchesFilter(a.attachment.mime_type, filter)) ?? [];
  const totalSize = filtered.reduce((sum, a) => sum + a.attachment.size, 0);

  // Count per filter category
  const counts = {
    all: attachments?.length ?? 0,
    images: attachments?.filter((a) => matchesFilter(a.attachment.mime_type, "images")).length ?? 0,
    videos: attachments?.filter((a) => matchesFilter(a.attachment.mime_type, "videos")).length ?? 0,
    audio: attachments?.filter((a) => matchesFilter(a.attachment.mime_type, "audio")).length ?? 0,
    files: attachments?.filter((a) => matchesFilter(a.attachment.mime_type, "files")).length ?? 0,
  };

  const handleDownloadSingle = useCallback(async (item: ScannedAttachment) => {
    if (downloadingId) return;
    setDownloadingId(item.attachment.id);
    try {
      const encrypted = await api.downloadAttachment(item.attachment.id);
      const decrypted = decryptFile(
        new Uint8Array(encrypted),
        fromBase64(item.attachment.key),
        fromBase64(item.attachment.nonce),
      );
      const blob = new Blob([decrypted.slice().buffer], { type: item.attachment.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.attachment.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail for individual downloads
    } finally {
      setDownloadingId(null);
    }
  }, [api, downloadingId]);

  const handleDownloadAll = useCallback(async () => {
    if (filtered.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadProgress({ loaded: 0, total: filtered.length });

    try {
      const files: Record<string, Uint8Array> = {};
      const nameCounts: Record<string, number> = {};

      for (let i = 0; i < filtered.length; i++) {
        if (controller.signal.aborted) return;
        const item = filtered[i];

        const encrypted = await api.downloadAttachment(item.attachment.id);
        const decrypted = decryptFile(
          new Uint8Array(encrypted),
          fromBase64(item.attachment.key),
          fromBase64(item.attachment.nonce),
        );

        // Deduplicate filenames
        let name = item.attachment.filename;
        if (files[name]) {
          const dotIdx = name.lastIndexOf(".");
          const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
          const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
          nameCounts[item.attachment.filename] = (nameCounts[item.attachment.filename] ?? 1) + 1;
          name = `${base} (${nameCounts[item.attachment.filename]})${ext}`;
        }

        files[name] = decrypted;
        setDownloadProgress({ loaded: i + 1, total: filtered.length });
      }

      const zipped = zipSync(files);
      const blob = new Blob([zipped.slice().buffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `haven-attachments-${channelName || "channel"}-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadProgress(null);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setDownloadProgress((p) => p ? { ...p, error: err.message } : null);
      }
    }
  }, [filtered, api, channelName]);

  const handleCancel = () => {
    abortRef.current?.abort();
    if (downloadProgress) {
      setDownloadProgress(null);
    } else {
      closeModal();
    }
  };

  if (!context) return null;

  const title = context.type === "dm"
    ? t("attachments.modal.title.dm")
    : t("attachments.modal.title.channel", { name: channelName });

  return (
    <div className="modal-overlay" onClick={closeModal} role="presentation">
      <div
        className="modal-dialog attachments-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("attachments.modal.ariaLabel")}
      >
        <div className="modal-dialog-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close-btn" onClick={closeModal} aria-label={t("attachments.modal.close")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        <div className="attachments-modal-body">
          {/* Scanning phase */}
          {!attachments && scanProgress?.phase !== "failed" && (
            <div className="attachments-scan-phase">
              <p className="attachments-scan-title">{t("attachments.scan.title")}</p>
              <div className="attachments-progress-bar">
                <div className="attachments-progress-bar-inner" style={{ width: "100%" }} />
              </div>
              <p className="attachments-scan-status">
                {scanProgress
                  ? t("attachments.scan.progress", {
                      count: scanProgress.messagesScanned,
                      found: scanProgress.attachmentsFound,
                    })
                  : t("attachments.scan.title")}
              </p>
              <button className="btn-ghost" onClick={handleCancel}>{t("attachments.modal.cancel")}</button>
            </div>
          )}

          {/* Scan failed */}
          {scanProgress?.phase === "failed" && (
            <div className="attachments-scan-phase">
              <p className="modal-error">{scanProgress.error}</p>
              <button className="btn-ghost" onClick={closeModal}>{t("attachments.modal.close")}</button>
            </div>
          )}

          {/* Results phase */}
          {attachments && !downloadProgress && (
            <>
              {/* Filter tabs */}
              <div className="attachments-filter-tabs">
                {FILTER_OPTIONS.map((f) => (
                  <button
                    key={f}
                    className={`attachments-filter-tab ${filter === f ? "active" : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {t(`attachments.modal.filter.${f}`)}
                    <span className="attachments-filter-count">{counts[f]}</span>
                  </button>
                ))}
              </div>

              {/* Summary */}
              {filtered.length > 0 && (
                <p className="attachments-summary">
                  {t("attachments.modal.summary", {
                    count: filtered.length,
                    type: t(`attachments.modal.filter.${filter}`).toLowerCase(),
                    size: formatFileSize(totalSize),
                  })}
                </p>
              )}

              {/* Grid */}
              {filtered.length > 0 ? (
                <div className="attachments-grid">
                  {filtered.map((item, i) => (
                    <AttachmentGridItem
                      key={`${item.attachment.id}-${i}`}
                      item={item}
                      onDownload={handleDownloadSingle}
                      downloading={downloadingId === item.attachment.id}
                    />
                  ))}
                </div>
              ) : (
                <p className="attachments-empty">
                  {counts.all === 0
                    ? t("attachments.modal.noAttachments")
                    : t("attachments.modal.noMatchingAttachments", {
                        type: t(`attachments.modal.filter.${filter}`).toLowerCase(),
                      })}
                </p>
              )}
            </>
          )}

          {/* Download phase */}
          {downloadProgress && (
            <div className="attachments-scan-phase">
              <p className="attachments-scan-title">{t("attachments.download.title")}</p>
              <div className="attachments-progress-bar">
                <div
                  className="attachments-progress-bar-inner"
                  style={{ width: `${(downloadProgress.loaded / downloadProgress.total) * 100}%` }}
                />
              </div>
              <p className="attachments-scan-status">
                {downloadProgress.error
                  ? t("attachments.download.failed", { error: downloadProgress.error })
                  : t("attachments.download.progress", {
                      loaded: downloadProgress.loaded,
                      total: downloadProgress.total,
                    })}
              </p>
              <button className="btn-ghost" onClick={handleCancel}>{t("attachments.modal.cancel")}</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {attachments && !downloadProgress && filtered.length > 0 && (
          <div className="modal-footer">
            <button className="btn-ghost" onClick={closeModal}>{t("attachments.modal.cancel")}</button>
            <button className="btn-primary modal-submit" onClick={handleDownloadAll}>
              {t("attachments.modal.downloadAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentGridItem({
  item,
  onDownload,
  downloading,
}: {
  item: ScannedAttachment;
  onDownload: (item: ScannedAttachment) => void;
  downloading?: boolean;
}) {
  const mime = item.attachment.mime_type;
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");

  return (
    <div className="attachments-grid-item" title={item.attachment.filename}>
      <div className="attachments-grid-item-preview">
        {isImage && item.attachment.thumbnail ? (
          <img src={item.attachment.thumbnail} alt={item.attachment.filename} className="attachments-thumb" />
        ) : (
          <div className="attachments-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {isVideo ? (
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              ) : isAudio ? (
                <path d="M12 3v9.28a4.39 4.39 0 00-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z" />
              ) : (
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
              )}
            </svg>
          </div>
        )}
        <button
          className="attachments-item-download"
          onClick={() => onDownload(item)}
          disabled={downloading}
          aria-label={`Download ${item.attachment.filename}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        </button>
      </div>
      <span className="attachments-grid-item-name">{item.attachment.filename}</span>
      <span className="attachments-grid-item-size">{formatFileSize(item.attachment.size)}</span>
    </div>
  );
}
