const MINISTERIAL_ROLE_LABELS = {
  membro: "Membro",
  cooperador: "Cooperador",
  diacono: "Diácono",
  presbitero: "Presbítero",
  pastor: "Pastor",
} as const;

const normalizeRoleKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "");

export const normalizeMinisterialRoleLabel = (value: unknown, fallback = "") => {
  const key = normalizeRoleKey(String(value || ""));
  if (key in MINISTERIAL_ROLE_LABELS) {
    return MINISTERIAL_ROLE_LABELS[key as keyof typeof MINISTERIAL_ROLE_LABELS];
  }

  return String(value || fallback || "").trim();
};
