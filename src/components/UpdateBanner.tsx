import { useTranslation } from "react-i18next";
import { useUiStore } from "../store/ui.js";
import { startUpdateDownload, restartForUpdate } from "../hooks/useUpdateChecker.js";

/**
 * Discord-style non-blocking update notification banner.
 * Renders below the titlebar when a new version is available.
 * Only shown inside Tauri builds (the parent gates with isTauri()).
 */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const updateStatus = useUiStore((s) => s.updateStatus);
  const updateVersion = useUiStore((s) => s.updateVersion);
  const updateDismissed = useUiStore((s) => s.updateDismissed);
  const dismissUpdate = useUiStore((s) => s.dismissUpdate);

  if (updateDismissed || updateStatus === "idle") return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-text">
        {updateStatus === "available" &&
          t("update.available", { version: updateVersion })}
        {updateStatus === "downloading" && t("update.downloading")}
        {updateStatus === "ready" && t("update.restartReady")}
      </span>

      {updateStatus === "available" && (
        <button
          className="update-banner-action"
          onClick={() => startUpdateDownload()}
        >
          {t("update.updateNow")}
        </button>
      )}

      {updateStatus === "ready" && (
        <button
          className="update-banner-action"
          onClick={() => restartForUpdate()}
        >
          {t("update.restart")}
        </button>
      )}

      {updateStatus === "available" && (
        <button
          className="update-banner-dismiss"
          onClick={dismissUpdate}
          aria-label={t("update.dismiss")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      )}
    </div>
  );
}
