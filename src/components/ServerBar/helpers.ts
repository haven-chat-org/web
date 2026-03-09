const SERVER_ORDER_KEY = "haven:server-order";
const SERVER_FOLDERS_KEY = "haven:server-folders";

export interface ServerFolder {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
}

export function loadServerOrder(): string[] {
  try {
    const raw = localStorage.getItem(SERVER_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveServerOrder(order: string[]) {
  localStorage.setItem(SERVER_ORDER_KEY, JSON.stringify(order));
}

export function loadFolders(): ServerFolder[] {
  try {
    const raw = localStorage.getItem(SERVER_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveFolders(folders: ServerFolder[]) {
  localStorage.setItem(SERVER_FOLDERS_KEY, JSON.stringify(folders));
}

export const FOLDER_COLORS = [
  "#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245",
  "#FF8C00", "#9B59B6", "#1ABC9C", "#E91E63", "#607D8B",
];

export const COLOR_NAMES: Record<string, string> = {
  "#5865F2": "Blurple", "#57F287": "Green", "#FEE75C": "Yellow",
  "#EB459E": "Pink", "#ED4245": "Red", "#FF8C00": "Orange",
  "#9B59B6": "Purple", "#1ABC9C": "Teal", "#E91E63": "Rose",
  "#607D8B": "Grey",
};
