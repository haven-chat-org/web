import { useTranslation } from "react-i18next";
import { useUiStore } from "../../store/ui.js";

export default function AccessibilityTab() {
  const { t } = useTranslation();
  const reducedMotion = useUiStore((s) => s.a11yReducedMotion);
  const font = useUiStore((s) => s.a11yFont);
  const highContrast = useUiStore((s) => s.a11yHighContrast);
  const alwaysShowTimestamps = useUiStore((s) => s.a11yAlwaysShowTimestamps);
  const setReducedMotion = useUiStore((s) => s.setA11yReducedMotion);
  const setFont = useUiStore((s) => s.setA11yFont);
  const setHighContrast = useUiStore((s) => s.setA11yHighContrast);
  const setAlwaysShowTimestamps = useUiStore((s) => s.setA11yAlwaysShowTimestamps);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.accessibility.motion")}</div>
      <p className="settings-description">
        {t("userSettings.accessibility.motionDesc")}
      </p>
      <label className="settings-toggle-label">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => setReducedMotion(e.target.checked)}
        />
        <span>{t("userSettings.accessibility.reduceMotion")}</span>
      </label>
      <p className="settings-hint">
        {t("userSettings.accessibility.reduceMotionHint")}
      </p>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.accessibility.font")}</div>
      <p className="settings-description">
        {t("userSettings.accessibility.fontDesc")}
      </p>
      <div className="settings-select-group">
        {([
          { value: "default", label: t("userSettings.accessibility.fontDefault") },
          { value: "opendyslexic", label: t("userSettings.accessibility.fontOpenDyslexic") },
          { value: "atkinson", label: t("userSettings.accessibility.fontAtkinson") },
        ] as const).map((opt) => (
          <label key={opt.value} className="settings-radio-label">
            <input
              type="radio"
              name="a11y_font"
              value={opt.value}
              checked={font === opt.value}
              onChange={() => setFont(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.accessibility.contrast")}</div>
      <p className="settings-description">
        {t("userSettings.accessibility.contrastDesc")}
      </p>
      <label className="settings-toggle-label">
        <input
          type="checkbox"
          checked={highContrast}
          onChange={(e) => setHighContrast(e.target.checked)}
        />
        <span>{t("userSettings.accessibility.highContrastMode")}</span>
      </label>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.accessibility.chatDisplay")}</div>
      <p className="settings-description">
        {t("userSettings.accessibility.chatDisplayDesc")}
      </p>
      <label className="settings-toggle-label">
        <input
          type="checkbox"
          checked={alwaysShowTimestamps}
          onChange={(e) => setAlwaysShowTimestamps(e.target.checked)}
        />
        <span>{t("userSettings.accessibility.alwaysShowTimestamps")}</span>
      </label>
      <p className="settings-hint">
        {t("userSettings.accessibility.alwaysShowTimestampsHint")}
      </p>
    </div>
  );
}
