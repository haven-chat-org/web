import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import it from "./locales/it.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";
import hi from "./locales/hi.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
] as const;

const supportedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);

function getInitialLanguage(): string {
  const stored = localStorage.getItem("haven-language");
  if (stored && supportedCodes.includes(stored as (typeof supportedCodes)[number])) {
    return stored;
  }
  const browserLang = navigator.language?.split("-")[0];
  if (browserLang && supportedCodes.includes(browserLang as (typeof supportedCodes)[number])) {
    return browserLang;
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      ru: { translation: ru },
      it: { translation: it },
      de: { translation: de },
      ja: { translation: ja },
      zh: { translation: zh },
      hi: { translation: hi },
    },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("haven-language", lng);
});

export default i18n;
