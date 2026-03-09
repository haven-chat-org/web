import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { setStoredServerUrl } from "../lib/serverUrl";

const DEFAULT_SERVER_URL = "https://app.haven-chat.org";

/**
 * Normalise raw input into a full URL with protocol.
 * Uses http:// for IP addresses/localhost, https:// for domain names.
 */
function normaliseServerUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    const hostPart = url.split("/")[0].split(":")[0];
    const isIp =
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostPart) || hostPart === "localhost";
    url = (isIp ? "http://" : "https://") + url;
  }
  return url.replace(/\/+$/, "");
}

/**
 * Probe the server's health endpoint to verify it's reachable.
 */
async function probeServer(serverUrl: string): Promise<void> {
  const resp = await fetch(`${serverUrl}/health`, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error("Server returned an error");
}

export default function ServerConnect() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"choose" | "custom">("choose");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function connect(serverUrl: string) {
    setError("");
    setLoading(true);
    try {
      await probeServer(serverUrl);
      setStoredServerUrl(serverUrl);
      window.location.href = "/login";
    } catch {
      setError(t("serverConnect.connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDefault() {
    await connect(DEFAULT_SERVER_URL);
  }

  async function handleCustomSubmit(e: FormEvent) {
    e.preventDefault();
    const input = url.trim();
    if (!input) {
      setError(t("serverConnect.emptyUrl"));
      return;
    }
    await connect(normaliseServerUrl(input));
  }

  if (mode === "custom") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>{t("serverConnect.appName")}</h1>
          <p className="auth-subtitle">{t("serverConnect.customSubtitle")}</p>

          <form onSubmit={handleCustomSubmit}>
            <div className="field">
              <label htmlFor="server-url">{t("serverConnect.urlLabel")}</label>
              <input
                id="server-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("serverConnect.urlPlaceholder")}
                required
                autoFocus
              />
            </div>

            {error && <div className="error">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t("serverConnect.submitLoading") : t("serverConnect.submit")}
            </button>
          </form>

          <button
            className="server-connect-back"
            onClick={() => { setMode("choose"); setError(""); }}
          >
            {t("serverConnect.back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t("serverConnect.appName")}</h1>
        <p className="auth-subtitle">{t("serverConnect.subtitle")}</p>

        {error && <div className="error">{error}</div>}

        <button
          className="btn-primary"
          onClick={handleDefault}
          disabled={loading}
        >
          {loading ? t("serverConnect.submitLoading") : t("serverConnect.connectDefault")}
        </button>

        <button
          className="server-connect-custom-link"
          onClick={() => { setMode("custom"); setError(""); }}
          disabled={loading}
        >
          {t("serverConnect.connectCustom")}
        </button>
      </div>
    </div>
  );
}
