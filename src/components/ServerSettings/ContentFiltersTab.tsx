import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { useChatStore } from "../../store/chat.js";
import { type ContentFilterResponse } from "@haven-chat-org/core";

interface ContentFiltersTabProps {
  serverId: string;
  setError: (msg: string) => void;
}

export default function ContentFiltersTab({
  serverId,
  setError,
}: ContentFiltersTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);

  const [contentFilters, setContentFilters] = useState<ContentFilterResponse[]>([]);
  const [newFilterPattern, setNewFilterPattern] = useState("");
  const [newFilterType, setNewFilterType] = useState<"keyword" | "regex">("keyword");
  const [newFilterAction, setNewFilterAction] = useState<"hide" | "warn">("hide");

  useEffect(() => {
    api.listContentFilters(serverId).then(setContentFilters).catch(() => {});
  }, [serverId]);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.filters.title")}</div>
      <p className="settings-description">{t("serverSettings.filters.description")}</p>

      {/* Add filter form */}
      <div className="filter-form">
        <input
          className="settings-input"
          type="text"
          placeholder={t("serverSettings.filters.patternPlaceholder")}
          value={newFilterPattern}
          onChange={(e) => setNewFilterPattern(e.target.value)}
          maxLength={200}
        />
        <div className="filter-form-options">
          <label className="filter-radio">
            <input type="radio" name="filterType" checked={newFilterType === "keyword"} onChange={() => setNewFilterType("keyword")} />
            {t("serverSettings.filters.keyword")}
          </label>
          <label className="filter-radio">
            <input type="radio" name="filterType" checked={newFilterType === "regex"} onChange={() => setNewFilterType("regex")} />
            {t("serverSettings.filters.regex")}
          </label>
          <span className="filter-separator">|</span>
          <label className="filter-radio">
            <input type="radio" name="filterAction" checked={newFilterAction === "hide"} onChange={() => setNewFilterAction("hide")} />
            {t("serverSettings.filters.actionHide")}
          </label>
          <label className="filter-radio">
            <input type="radio" name="filterAction" checked={newFilterAction === "warn"} onChange={() => setNewFilterAction("warn")} />
            {t("serverSettings.filters.actionWarn")}
          </label>
        </div>
        <button
          className="btn-primary"
          disabled={!newFilterPattern.trim() || contentFilters.length >= 50}
          onClick={async () => {
            try {
              if (newFilterType === "regex") {
                try { new RegExp(newFilterPattern); } catch {
                  setError(t("serverSettings.filters.invalidRegex"));
                  return;
                }
              }
              const filter = await api.createContentFilter(serverId, {
                pattern: newFilterPattern.trim(),
                filter_type: newFilterType,
                action: newFilterAction,
              });
              setContentFilters((prev) => [...prev, filter]);
              setNewFilterPattern("");
              // Refresh the chat store's cached filters
              useChatStore.getState().fetchContentFilters(serverId);
            } catch {
              setError(t("serverSettings.filters.failedCreate"));
            }
          }}
        >
          {t("serverSettings.filters.add")}
        </button>
        <span className="filter-count">{contentFilters.length}/50</span>
      </div>

      {/* Filter list */}
      <div className="filter-list">
        {contentFilters.map((f) => (
          <div key={f.id} className="filter-list-item">
            <code className="filter-pattern">{f.pattern}</code>
            <span className={`filter-type-badge ${f.filter_type}`}>{f.filter_type}</span>
            <span className={`filter-action-badge ${f.action}`}>{f.action}</span>
            <button
              className="btn-small btn-danger-outline"
              onClick={async () => {
                try {
                  await api.deleteContentFilter(serverId, f.id);
                  setContentFilters((prev) => prev.filter((x) => x.id !== f.id));
                  useChatStore.getState().fetchContentFilters(serverId);
                } catch {
                  setError(t("serverSettings.filters.failedDelete"));
                }
              }}
            >
              {t("serverSettings.filters.delete")}
            </button>
          </div>
        ))}
        {contentFilters.length === 0 && (
          <div className="admin-empty">{t("serverSettings.filters.noFilters")}</div>
        )}
      </div>
    </div>
  );
}
