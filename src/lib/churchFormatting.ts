export const normalizeSearch = (value: string) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const parseTotvsFromChurchText = (value: string) => {
  const match = String(value || "").trim().match(/^(\d{3,})\b/);
  return match ? match[1] : "";
};

export const normalizeManualChurchDestination = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{1,10})\s*[-)\s]?\s*(.+)$/);
  if (!match) return raw.toUpperCase();

  const totvsId = match[1].trim();
  const churchName = match[2].trim().replace(/\s+/g, " ").toUpperCase();
  return churchName ? `${totvsId} - ${churchName}` : totvsId;
};
