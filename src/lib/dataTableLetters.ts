import { getDocId } from "@/lib/dataTableHelpers";

export type ClientLettersConfig = {
  gasDeleteUrl: string;
  googleSheetUrl: string;
  googleFormUrl: string;
  googleSheetId: string;
  googleFormId: string;
  driveSentFolderId: string;
};

export const getEnvioStatus = (row: Record<string, string>) =>
  String(row.envio || row["Envio"] || row.send_status || "").trim().toUpperCase();

export const getDocUrl = (row: Record<string, string>) =>
  (
    row.doc_url ||
    row.docUrl ||
    row["Doc URL"] ||
    row["doc_url"] ||
    row["Merged Doc URL - carta de pregação"] ||
    row["Merged Doc URL - carta de pregacao"] ||
    row["Merged Doc URL - Carta de Pregacao"] ||
    row["Merged Doc URL - Cartas"] ||
    row["Merged Doc URL - cartas"] ||
    ""
  ).trim();

export const getPdfUrl = (row: Record<string, string>) =>
  (
    row.pdf_url ||
    row.pdfUrl ||
    row.url_pdf ||
    row["PDF URL"] ||
    row["Link to merged Doc - carta de pregação"] ||
    row["Link to merged Doc - carta de pregacao"] ||
    row["Merged Doc URL - Carta de Pregacao"] ||
    row["Merged Doc URL - Cartas"] ||
    row["Merged Doc URL - cartas"] ||
    row["Link to merged Doc - Carta de Pregacao"] ||
    row["Link to merged Doc - Cartas"] ||
    row["Link to merged Doc - cartas"] ||
    ""
  ).trim();

export const buildSendLetterPayload = (
  row: Record<string, string>,
  tipoFluxo: "manual" | "automatico",
  liberadoPor: string,
) => ({
  tipo_fluxo: tipoFluxo,
  action: "send_letter",
  docId: getDocId(row),
  docUrl: getDocUrl(row),
  pdfUrl: getPdfUrl(row),
  full_name: (row.nome || row.full_name || "-").trim() || "-",
  phone: (row.telefone || row.phone || "-").trim() || "-",
  email: (row.email || "-").trim() || "-",
  church_name: (row.igreja_origem || row.church_name || "-").trim() || "-",
  church_destination: (row.igreja_destino || row.church_destination || "-").trim() || "-",
  preach_date: (row.data_pregacao || row.preach_date || "-").trim() || "-",
  minister_role: (row.funcao || row["Funcao Ministerial ?"] || row.cargo || row.minister_role || "-").trim() || "-",
  statusCarta: "LIBERADA",
  liberadoPor,
});

export const parseClientConfig = (payload: Record<string, any> | null | undefined): ClientLettersConfig | null => {
  if (!payload) return null;
  const gasDeleteUrl = (payload.gas_delete_url || "").trim();
  const googleSheetUrl = (payload.google_sheet_url || "").trim();
  const googleFormUrl = (payload.google_form_url || "").trim();
  const googleSheetId = (payload.google_sheet_id || "").trim();
  const googleFormId = (payload.google_form_id || "").trim();
  const driveSentFolderId = (payload.drive_sent_folder_id || "").trim();
  if (!gasDeleteUrl) return null;
  return { gasDeleteUrl, googleSheetUrl, googleFormUrl, googleSheetId, googleFormId, driveSentFolderId };
};

export const withTechnicalContext = (cfg: ClientLettersConfig, body: Record<string, string>) => ({
  gas_delete_url: cfg.gasDeleteUrl,
  ...body,
  ...(cfg.googleSheetId ? { googleSheetId: cfg.googleSheetId } : {}),
  ...(cfg.googleFormId ? { googleFormId: cfg.googleFormId } : {}),
  ...(cfg.driveSentFolderId ? { driveSentFolderId: cfg.driveSentFolderId } : {}),
});

export const getObreiroAuthIdentity = (
  row: Record<string, string>,
  clientId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
) => {
  if (!clientId || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Cliente nao autenticado para atualizar obreiro.");
  }

  const rawPhone = String(row.telefone || row.phone || row["Telefone"] || "");
  const telefone = rawPhone.replace(/\D/g, "").trim();
  if (!telefone) {
    throw new Error("Telefone do obreiro nao informado.");
  }

  const nome = String(row.nome || row.full_name || row["Nome completo"] || "-").trim() || "-";
  const email = String(row.email || row["Endere?o de e-mail"] || "").trim();

  return { clientId, telefone, nome, email };
};
