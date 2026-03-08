import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth.js";
import { useUiStore } from "../store/ui.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import AccountTab from "./UserSettings/AccountTab.js";
import ProfileTab from "./UserSettings/ProfileTab.js";
import PrivacyTab from "./UserSettings/PrivacyTab.js";
import VoiceTab from "./UserSettings/VoiceTab.js";
import SecurityTab from "./UserSettings/SecurityTab.js";
import AppearanceTab from "./UserSettings/AppearanceTab.js";
import AccessibilityTab from "./UserSettings/AccessibilityTab.js";

type Tab = "account" | "profile" | "privacy" | "voice" | "appearance" | "accessibility" | "security";

export default function UserSettings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const api = useAuthStore((s) => s.api);
  const setShowUserSettings = useUiStore((s) => s.setShowUserSettings);
  const initialTab = useUiStore((s) => s.userSettingsTab) as Tab | null;
  const [tab, setTab] = useState<Tab>(initialTab ?? "account");

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setShowUserSettings(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [setShowUserSettings]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  if (!user) return null;

  return (
    <div className="user-settings-overlay" role="presentation">
      <div className="user-settings-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("userSettings.ariaLabel")}>
        <nav className="user-settings-sidebar">
          <div className="user-settings-sidebar-header">{t("userSettings.sidebarHeader")}</div>
          <button
            className={`user-settings-nav-item ${tab === "account" ? "active" : ""}`}
            onClick={() => setTab("account")}
          >
            {t("userSettings.tab.myAccount")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "profile" ? "active" : ""}`}
            onClick={() => setTab("profile")}
          >
            {t("userSettings.tab.profile")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "privacy" ? "active" : ""}`}
            onClick={() => setTab("privacy")}
          >
            {t("userSettings.tab.privacy")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "voice" ? "active" : ""}`}
            onClick={() => setTab("voice")}
          >
            {t("userSettings.tab.voiceAudio")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "appearance" ? "active" : ""}`}
            onClick={() => setTab("appearance")}
          >
            {t("userSettings.tab.appearance")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "security" ? "active" : ""}`}
            onClick={() => setTab("security")}
          >
            {t("userSettings.tab.securityBackup")}
          </button>
          <button
            className={`user-settings-nav-item ${tab === "accessibility" ? "active" : ""}`}
            onClick={() => setTab("accessibility")}
          >
            {t("userSettings.tab.accessibility")}
          </button>
          <div className="user-settings-sidebar-divider" />
          <button
            className="user-settings-nav-item danger"
            onClick={() => {
              useAuthStore.getState().logout();
              setShowUserSettings(false);
            }}
          >
            {t("userSettings.logOut")}
          </button>
        </nav>
        <div className="user-settings-content">
          <div className="user-settings-content-header">
            <h2>{tab === "account" ? t("userSettings.tab.myAccount") : tab === "profile" ? t("userSettings.tab.profile") : tab === "privacy" ? t("userSettings.tab.privacy") : tab === "voice" ? t("userSettings.tab.voiceAudio") : tab === "appearance" ? t("userSettings.tab.appearance") : tab === "security" ? t("userSettings.tab.securityBackup") : t("userSettings.tab.accessibility")}</h2>
            <button className="settings-esc-close" onClick={() => setShowUserSettings(false)} aria-label={t("userSettings.closeAriaLabel")}>
              <div className="settings-esc-circle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </div>
              <span className="settings-esc-label">{t("userSettings.escLabel")}</span>
            </button>
          </div>
          <div className="user-settings-content-body">
            {tab === "account" && <AccountTab />}
            {tab === "profile" && <ProfileTab />}
            {tab === "privacy" && <PrivacyTab />}
            {tab === "voice" && <VoiceTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "security" && <SecurityTab />}
            {tab === "accessibility" && <AccessibilityTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
