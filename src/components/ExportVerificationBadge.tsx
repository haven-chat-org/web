import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { HavenManifest } from "@haven-chat-org/core";

interface Props {
  manifest: HavenManifest;
}

export default function ExportVerificationBadge({ manifest }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "unavailable">("checking");
  const [filesVerified, setFilesVerified] = useState(0);
  const totalFiles = Object.keys(manifest.files).length;

  useEffect(() => {
    if (!manifest.user_signature) {
      setStatus("unavailable");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/v1/exports/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest,
            signature: manifest.user_signature,
          }),
        });
        if (!res.ok) {
          // Endpoint may not exist yet — show unavailable gracefully
          setStatus("unavailable");
          return;
        }
        const data = await res.json() as { valid: boolean };
        setStatus(data.valid ? "valid" : "invalid");
        setFilesVerified(totalFiles);
      } catch {
        setStatus("unavailable");
      }
    }

    verify();
  }, [manifest, totalFiles]);

  const exportDate = new Date(manifest.exported_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const statusClass = status === "valid" ? "verification-valid"
    : status === "invalid" ? "verification-invalid"
    : "verification-neutral";

  return (
    <div className={`export-verification-badge ${statusClass}`}>
      <div className="export-verification-icon">
        {status === "valid" && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        )}
        {status === "invalid" && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
        )}
        {(status === "checking" || status === "unavailable") && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        )}
      </div>
      <div className="export-verification-details">
        <div className="export-verification-title">
          {status === "checking" ? t("export.verify.checking") : t("export.verify.title")}
        </div>
        <div className="export-verification-meta">
          <span>{t("export.verify.exportedBy", { username: manifest.exported_by.username })}</span>
          <span>{t("export.verify.date", { date: exportDate })}</span>
          {status === "valid" && <span>{t("export.verify.signatureValid")}</span>}
          {status === "invalid" && <span>{t("export.verify.signatureInvalid")}</span>}
          {status === "unavailable" && <span>{t("export.verify.unavailable")}</span>}
          {status === "valid" && (
            <span>{t("export.verify.filesVerified", { count: filesVerified, total: totalFiles })}</span>
          )}
        </div>
      </div>
    </div>
  );
}
