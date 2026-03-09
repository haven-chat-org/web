import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function AboutTab() {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "upToDate">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch { /* web fallback */ }

      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        const enabled = await isEnabled();
        if (!cancelled) {
          setAutostart(enabled);
          setAutostartLoading(false);
        }
      } catch {
        if (!cancelled) setAutostartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggleAutostart() {
    setAutostartLoading(true);
    try {
      if (autostart) {
        const { disable } = await import("@tauri-apps/plugin-autostart");
        await disable();
        setAutostart(false);
      } else {
        const { enable } = await import("@tauri-apps/plugin-autostart");
        await enable();
        setAutostart(true);
      }
    } catch { /* ignore */ }
    setAutostartLoading(false);
  }

  async function checkForUpdates() {
    setUpdateStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } else {
        setUpdateStatus("upToDate");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch {
      setUpdateStatus("idle");
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.about.title")}</div>
      {version && (
        <p className="settings-description">
          {t("userSettings.about.version", { version })}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={checkForUpdates} disabled={updateStatus === "checking"}>
          {updateStatus === "checking"
            ? t("userSettings.about.checking")
            : updateStatus === "upToDate"
              ? t("userSettings.about.upToDate")
              : t("userSettings.about.checkForUpdates")}
        </button>
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>
        {t("userSettings.about.launchAtStartup")}
      </div>
      <p className="settings-description">
        {t("userSettings.about.launchAtStartupDesc")}
      </p>
      <label className="settings-toggle-label">
        <input
          type="checkbox"
          checked={autostart}
          onChange={toggleAutostart}
          disabled={autostartLoading}
        />
        <span>{t("userSettings.about.launchAtStartup")}</span>
      </label>
    </div>
  );
}
