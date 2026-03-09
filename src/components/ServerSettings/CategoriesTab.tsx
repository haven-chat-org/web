import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.js";
import { useChatStore } from "../../store/chat.js";
import { type CategoryResponse } from "@haven-chat-org/core";

interface CategoriesTabProps {
  serverId: string;
  categories: CategoryResponse[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryResponse[]>>;
  setError: (msg: string) => void;
  setDeleteCatTarget: (target: { id: string; name: string } | null) => void;
}

export default function CategoriesTab({
  serverId,
  categories,
  setCategories,
  setError,
  setDeleteCatTarget,
}: CategoriesTabProps) {
  const { t } = useTranslation();
  const api = useAuthStore((s) => s.api);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setError("");
    try {
      const cat = await api.createCategory(serverId, {
        name: newCategoryName.trim(),
        position: categories.length,
      });
      setCategories((prev) => [...prev, cat]);
      setNewCategoryName("");
      useChatStore.getState().loadChannels();
    } catch (err: any) {
      setError(err.message || t("serverSettings.categories.failedCreate"));
    }
  }

  async function handleRenameCategory(catId: string) {
    if (!editingCatName.trim()) return;
    setError("");
    try {
      const updated = await api.updateCategory(serverId, catId, { name: editingCatName.trim() });
      setCategories((prev) => prev.map((c) => (c.id === catId ? updated : c)));
      setEditingCatId(null);
      useChatStore.getState().loadChannels();
    } catch (err: any) {
      setError(err.message || t("serverSettings.categories.failedRename"));
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("serverSettings.categories.title")}</div>
      <div className="dm-input-row" style={{ marginBottom: 16 }}>
        <input
          className="settings-input"
          type="text"
          placeholder={t("serverSettings.categories.placeholder")}
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
        />
        <button className="btn-primary" onClick={handleCreateCategory}>{t("serverSettings.categories.create")}</button>
      </div>

      {categories.map((cat) => (
        <div key={cat.id} className="server-member-row">
          {editingCatId === cat.id ? (
            <div className="dm-input-row" style={{ flex: 1 }}>
              <input
                className="settings-input"
                type="text"
                value={editingCatName}
                onChange={(e) => setEditingCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameCategory(cat.id);
                  if (e.key === "Escape") setEditingCatId(null);
                }}
                autoFocus
              />
              <button className="btn-primary" onClick={() => handleRenameCategory(cat.id)}>{t("serverSettings.categories.save")}</button>
            </div>
          ) : (
            <>
              <div className="server-member-info" style={{ flex: 1 }}>
                <span className="server-member-name">{cat.name}</span>
              </div>
              <button
                className="btn-ghost"
                onClick={() => {
                  setEditingCatId(cat.id);
                  setEditingCatName(cat.name);
                }}
              >
                {t("serverSettings.categories.rename")}
              </button>
              <button
                className="btn-ghost server-kick-btn"
                onClick={() => setDeleteCatTarget({ id: cat.id, name: cat.name })}
              >
                {t("serverSettings.categories.delete")}
              </button>
            </>
          )}
        </div>
      ))}
      {categories.length === 0 && (
        <p className="settings-description">
          {t("serverSettings.categories.emptyMessage")}
        </p>
      )}
    </div>
  );
}
