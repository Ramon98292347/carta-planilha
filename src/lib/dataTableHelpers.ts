const EMPTY = "\u2014";

export const getStatusUsuario = (row: Record<string, string>) =>
  String(row.obreiro_auth_status || row["Status Usuario"] || row["\"Status Usuario\""] || row.statusUsuario || row.status_usuario || "")
    .trim()
    .toUpperCase();

export const isBlockedRow = (row: Record<string, string>) => getStatusUsuario(row) === "BLOQUEADO";

export const getStatusCartaOperacional = (row: Record<string, string>) => String(row.obreiro_auth_status_carta || "").trim().toUpperCase();

export const getStatusCartaVisual = (row: Record<string, string>) =>
  String(row["Status Carta"] || row.statusCarta || row.status_carta || "").trim().toUpperCase();

export const isAutoReleaseEnabled = (row: Record<string, string>) => getStatusCartaOperacional(row) === "LIBERADA";

export const getDerivedStatusLabel = (row: Record<string, string>) => {
  const statusUsuario = getStatusUsuario(row);
  const statusCartaVisual = getStatusCartaVisual(row);
  const statusCartaOperacional = getStatusCartaOperacional(row);
  const envio = String(row["Envio"] || row.envio || "").trim().toUpperCase();
  const driveStatus = String(row["Drive Status"] || row.driveStatus || row.drive_status || "").trim().toUpperCase();

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (driveStatus === "CARTA_ENVIADA") return "Carta enviada";
  if (envio === "ENVIADO") return "Carta enviada";
  if (statusCartaOperacional === "LIBERADA") return "Liberado automatico";
  if (statusCartaVisual === "LIBERADA") return "Carta liberada";
  return "Aguardando liberacao";
};

export const getDerivedStatusClass = (label: string) => {
  if (label === "Bloqueado") return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
  if (label === "Gerada") return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (label === "Aguardando liberacao") return "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50";
  if (label === "Liberado automatico") return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
};

export const isImageUrl = (value: string, key?: string) => {
  const v = (value || "").trim();
  if (!v || !/^https?:\/\//i.test(v)) return false;
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(v)) return true;
  if (key && /(foto|imagem|image|photo)/i.test(key)) return true;
  return false;
};

export const buildFormUrl = (baseUrl: string, params: Record<string, string>) => {
  const trimmed = (baseUrl || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.set(k, v ?? "");
    });
    return url.toString();
  } catch {
    const qs = new URLSearchParams(params).toString();
    if (!qs) return trimmed;
    return trimmed.includes("?") ? `${trimmed}&${qs}` : `${trimmed}?${qs}`;
  }
};

export const getDocId = (row: Record<string, string>) =>
  (
    row.doc_id ||
    row["Merged Doc ID - carta de pregação"] ||
    row["Merged Doc ID - carta de pregacao"] ||
    row["Merged Doc ID - Cartas"] ||
    row["Merged Doc ID - cartas"] ||
    row["merged_doc_id_-_cartas"] ||
    row["Merged Doc ID - Carta de Pregacao"] ||
    row["merged_doc_id_-_carta_de_pregacao"] ||
    ""
  ).trim();

export const getPhoneDigits = (row: Record<string, string>) =>
  String(row.telefone || row.phone || row["Telefone"] || "").replace(/\D/g, "").trim();

export { EMPTY };
