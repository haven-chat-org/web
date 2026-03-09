import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../../i18n/index.js";
import { useUiStore, type Theme } from "../../store/ui.js";

export default function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const themes: { value: Theme; key: string; colors: string[] }[] = [
    {
      value: "night",
      key: "nightMode",
      colors: ["#1e1f22", "#2b2d31", "#313338", "#5865f2", "#dbdee1"],
    },
    {
      value: "default",
      key: "default",
      colors: ["#E2D9CC", "#EAE3D7", "#F5F0E8", "#C2410C", "#3D3029"],
    },
    {
      value: "light",
      key: "lightMode",
      colors: ["#E3E5E8", "#F2F3F5", "#FFFFFF", "#4752C4", "#2E3338"],
    },
    {
      value: "sage",
      key: "sage",
      colors: ["#171717", "#212121", "#2D2D2D", "#10A37F", "#ECECEC"],
    },
    {
      value: "cosmos",
      key: "cosmos",
      colors: ["#131620", "#1B1F2E", "#232736", "#8B6CEF", "#E3E5EA"],
    },
    {
      value: "forest",
      key: "forest",
      colors: ["#1A2318", "#222E1F", "#2A3627", "#5FAD56", "#D4DDD2"],
    },
    {
      value: "bluebird",
      key: "bluebird",
      colors: ["#E8ECF0", "#F5F8FA", "#FFFFFF", "#0C7ABF", "#14171A"],
    },
  ];

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">{t("userSettings.appearance.language")}</div>
        <p className="settings-description">{t("userSettings.appearance.languageDesc")}</p>
        <select
          className="settings-select"
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName} ({lang.name})
            </option>
          ))}
        </select>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">{t("userSettings.appearance.theme")}</div>
        <p className="settings-description">{t("userSettings.appearance.themeDesc")}</p>
        <div className="theme-picker">
          {themes.map((thm) => (
            <button
              key={thm.value}
              className={`theme-card ${theme === thm.value ? "selected" : ""}`}
              onClick={() => setTheme(thm.value)}
              aria-pressed={theme === thm.value}
            >
              <div className="theme-preview">
                {thm.colors.map((c, i) => (
                  <div key={i} className="theme-swatch" style={{ background: c }} />
                ))}
              </div>
              <span className="theme-label">{t(`userSettings.appearance.${thm.key}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">{t("userSettings.appearance.onboardingSection")}</div>
        <p className="settings-description">{t("userSettings.appearance.onboardingDesc")}</p>
        <button
          className="btn-secondary"
          onClick={() => {
            useUiStore.getState().requestOnboarding();
            useUiStore.getState().setShowUserSettings(false);
          }}
        >
          {t("userSettings.appearance.restartTour")}
        </button>
      </div>
    </>
  );
}
