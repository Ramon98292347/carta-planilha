import { useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, EllipsisVertical, ExternalLink, Eye, Share2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate, parseDate } from "@/lib/sheets";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import { toast } from "sonner";

const PAGE_SIZE = 25;
const EMPTY = "\u2014";
const BLOCK_FORM_NAME_FIELD = "entry.1208647889";
const BLOCK_FORM_STATUS_FIELD = "entry.1791445451";
const LETTERS_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/cartas-novo";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type ClientLettersConfig = {
  gasDeleteUrl: string;
  googleSheetUrl: string;
  googleFormUrl: string;
  googleSheetId: string;
  googleFormId: string;
  driveSentFolderId: string;
};

const getStatusUsuario = (row: Record<string, string>) =>
  String(row.obreiro_auth_status || row["Status Usuario"] || row["\"Status Usuario\""] || row.statusUsuario || row.status_usuario || row.status || "")
    .trim()
    .toUpperCase();

const isBlockedRow = (row: Record<string, string>) => getStatusUsuario(row) === "BLOQUEADO";

const getDerivedStatusLabel = (row: Record<string, string>) => {
  const statusUsuario = getStatusUsuario(row);
  const statusCarta = String(row["Status Carta"] || row.statusCarta || row.status_carta || "").trim().toUpperCase();
  const envio = String(row["Envio"] || row.envio || "").trim().toUpperCase();
  const driveStatus = String(row["Drive Status"] || row.driveStatus || row.drive_status || "").trim().toUpperCase();
  const liberacaoAutomatica = String(
    row.liberacaoAutomatica || row.liberacao_automatica || row["LiberaÁ„o Autom·tica"] || row["Liberacao Automatica"] || "false"
  )
    .trim()
    .toLowerCase();
  const isAuto = ["1", "true", "sim", "automatico", "automatica", "on"].includes(liberacaoAutomatica);

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (driveStatus === "CARTA_ENVIADA") return "Carta enviada";
  if (envio === "ENVIADO") return "Carta enviada";
  if (statusCarta === "LIBERADA") return "Carta liberada";
  if (isAuto) return "Liberacao automatica";
  return "Aguardando liberacao";
};

const getDerivedStatusClass = (label: string) => {
  if (label === "Bloqueado") return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
  if (label === "Gerada") return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (label === "Aguardando liberacao") return "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50";
  if (label === "Liberacao automatica") return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
};

interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, string>) => React.ReactNode;
}

interface DetailField {
  key: string;
  label: string;
}

interface Props {
  data: Record<string, string>[];
  columns: Column[];
  showDetails?: boolean;
  hideEmptyColumns?: boolean;
  detailFields?: DetailField[];
  enableDelete?: boolean;
  onDeleteSuccess?: (row: Record<string, string>) => void;
  actionsVariant?: "full" | "detailsOnly";
  highlightStatus?: boolean;
  detailsSource?: "columns" | "all";
  detailRowResolver?: (row: Record<string, string>) => Record<string, string>;
  sendStatusById?: Record<string, string>;
  onRefetchCache?: () => Promise<void> | void;
}

export function DataTable({
  data,
  columns,
  showDetails,
  hideEmptyColumns = true,
  detailFields,
  enableDelete = false,
  onDeleteSuccess,
  actionsVariant = "full",
  highlightStatus = true,
  detailsSource = "columns",
  detailRowResolver,
  sendStatusById = {},
  onRefetchCache,
}: Props) {
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<Record<string, string> | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [clientConfig, setClientConfig] = useState<ClientLettersConfig | null>(null);
  const [rowOverridesByDocId, setRowOverridesByDocId] = useState<Record<string, Record<string, string>>>({});
  const [rowOverridesByPhone, setRowOverridesByPhone] = useState<Record<string, Record<string, string>>>({});
  const autoSentDocIdsRef = useRef<Set<string>>(new Set());

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isEmptyValue = (value?: string) => !value || value === "-" || value === "√¢‚Ç¨‚Äù" || value === EMPTY;

  const visibleColumns = hideEmptyColumns
    ? columns.filter((c) => data.some((row) => !isEmptyValue(row[c.key])))
    : columns;

  const shareOnWhatsApp = (row: Record<string, string>) => {
    const nome = row.nome && !isEmptyValue(row.nome) ? row.nome : "registro";
    const normalizeUrl = (value?: string) => {
      if (!value || isEmptyValue(value)) return "";
      const trimmed = value.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
      if (trimmed.startsWith("www.")) return `https://${trimmed}`;
      return `https://${trimmed}`;
    };

    const pdf = normalizeUrl(row.url_pdf);
    const message = pdf ? `Confira esta carta de ${nome}: ${pdf}` : `Confira este registro de ${nome}.`;
    const rawPhone = row.telefone ?? row.phone ?? "";
    let digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openCartaForm = (row: Record<string, string>) => {
    const googleFormUrl =
      (clientConfig?.googleFormUrl || "").trim() ||
      (clientConfig?.googleFormId?.trim() ? `https://docs.google.com/forms/d/${clientConfig.googleFormId.trim()}/viewform` : "") ||
      (localStorage.getItem("google_form_url") || "").trim();
    const googleSheetUrl =
      (clientConfig?.googleSheetUrl || "").trim() ||
      (clientConfig?.googleSheetId?.trim() ? `https://docs.google.com/spreadsheets/d/${clientConfig.googleSheetId.trim()}/edit` : "") ||
      (localStorage.getItem("google_sheet_url") || "").trim();
    const target = googleFormUrl || googleSheetUrl;
    if (!target) {
      toast.error("Link de carta n√£o configurado.");
      return;
    }
    const docId = (row.doc_id || "").trim();
    if (googleFormUrl && docId) {
      const rawNome = (row.nome || "").trim();
      const rawTelefone = (row.telefone || row.phone || "").trim();
      const rawIgrejaOrigem = (row.igreja_origem || row.igreja || "").trim();
      const rawDataOrdenacao = (row.data_ordenacao || "").trim();
      const rawIgrejaDestino = (row.igreja_destino || "").trim();
      const rawDataPregacao = (row.data_pregacao || "").trim();
      const rawCargo = (row.cargo || "").trim();
      const dataOrdenacao = rawDataOrdenacao ? formatDate(parseDate(rawDataOrdenacao)) || rawDataOrdenacao : "";
      const dataPregacao = rawDataPregacao ? formatDate(parseDate(rawDataPregacao)) || rawDataPregacao : "";

      const url = buildFormUrl(googleFormUrl, {
        [BLOCK_FORM_NAME_FIELD]: docId,
        [BLOCK_FORM_STATUS_FIELD]: "FINAL",
        "entry.421370551": rawNome,
        "entry.1173234939": rawTelefone,
        "entry.2131544287": rawIgrejaOrigem,
        "entry.2054956436": dataOrdenacao,
        "entry.1451322127": rawIgrejaDestino,
        "entry.539500659": dataPregacao,
        "entry.455088591": rawCargo,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const isBlocked = (row: Record<string, string>) => isBlockedRow(row);

  const shouldHighlightBlocked = (row: Record<string, string>) => highlightStatus && isBlocked(row);

  const isImageUrl = (value: string, key?: string) => {
    const v = (value || "").trim();
    if (!v || !/^https?:\/\//i.test(v)) return false;
    if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(v)) return true;
    if (key && /(foto|imagem|image|photo)/i.test(key)) return true;
    return false;
  };

  const buildFormUrl = (baseUrl: string, params: Record<string, string>) => {
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

  const getDocId = (row: Record<string, string>) =>
    (
      row.doc_id ||
      row["Merged Doc ID - carta de pregaÁ„o"] ||
      row["Merged Doc ID - carta de pregacao"] ||
      row["Merged Doc ID - Cartas"] ||
      row["Merged Doc ID - cartas"] ||
      row["merged_doc_id_-_cartas"] ||
      row["Merged Doc ID - Carta de Prega√ß√£o"] ||
      row["merged_doc_id_-_carta_de_pregacao"] ||
      ""
    ).trim();

  const getPhoneDigits = (row: Record<string, string>) =>
    String(row.telefone || row.phone || row["Telefone"] || "").replace(/\D/g, "").trim();

  const resolveRow = (row: Record<string, string>) => {
    const docId = getDocId(row);
    const phone = getPhoneDigits(row);
    const byDoc = docId ? rowOverridesByDocId[docId] : undefined;
    const byPhone = phone ? rowOverridesByPhone[phone] : undefined;
    if (!byDoc && !byPhone) return row;
    return { ...row, ...(byPhone || {}), ...(byDoc || {}) };
  };

  const getStatusCarta = (row: Record<string, string>) =>
    String(row.status_carta || row.statusCarta || row["Status Carta"] || row.status || "").trim().toUpperCase();

  const getEnvioStatus = (row: Record<string, string>) =>
    String(row.envio || row["Envio"] || row.send_status || "").trim().toUpperCase();

  const getDocUrl = (row: Record<string, string>) =>
    (
      row.doc_url ||
      row.docUrl ||
      row["Doc URL"] ||
      row["doc_url"] ||
      row["Merged Doc URL - carta de pregaÁ„o"] ||
      row["Merged Doc URL - carta de pregacao"] ||
      row["Merged Doc URL - Carta de Prega√ß√£o"] ||
      row["Merged Doc URL - Cartas"] ||
      row["Merged Doc URL - cartas"] ||
      ""
    ).trim();

  const getPdfUrl = (row: Record<string, string>) =>
    (
      row.pdf_url ||
      row.pdfUrl ||
      row.url_pdf ||
      row["PDF URL"] ||
      row["Link to merged Doc - carta de pregaÁ„o"] ||
      row["Link to merged Doc - carta de pregacao"] ||
      row["Merged Doc URL - Carta de Prega√ß√£o"] ||
      row["Merged Doc URL - Cartas"] ||
      row["Merged Doc URL - cartas"] ||
      row["Link to merged Doc - Carta de Prega√ß√£o"] ||
      row["Link to merged Doc - Cartas"] ||
      row["Link to merged Doc - cartas"] ||
      ""
    ).trim();

  const buildSendLetterPayload = (
    row: Record<string, string>,
    tipoFluxo: "manual" | "automatico",
    liberadoPor: string
  ) => ({
    tipo_fluxo: tipoFluxo,
    action: "send_letter",
    docId: getDocId(row),
    docUrl: (getDocUrl(row) || "").trim(),
    pdfUrl: (getPdfUrl(row) || "").trim(),
    full_name: (row.nome || row.full_name || "-").trim() || "-",
    phone: (row.telefone || row.phone || "-").trim() || "-",
    email: (row.email || "-").trim() || "-",
    church_name: (row.igreja_origem || row.church_name || "-").trim() || "-",
    church_destination: (row.igreja_destino || row.church_destination || "-").trim() || "-",
    preach_date: (row.data_pregacao || row.preach_date || "-").trim() || "-",
    minister_role: (row.funcao || row["Fun√ß√£o Ministerial ?"] || row.cargo || row.minister_role || "-").trim() || "-",
    statusCarta: "LIBERADA",
    liberadoPor,
  });

  const isLiberacaoAutomatica = (row: Record<string, string>) => {
    const raw = String(row.liberacaoAutomatica || row.liberacao_automatica || row["LiberaÁ„o Autom·tica"] || row["Liberacao Automatica"] || "false")
      .trim()
      .toLowerCase();
    return ["1", "true", "sim", "automatico", "automatica", "on"].includes(raw);
  };

  const parseClientConfig = (payload: Record<string, any> | null | undefined): ClientLettersConfig | null => {
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

  const fetchClientConfig = async (): Promise<ClientLettersConfig | null> => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

    const headers = getSupabaseHeaders({ json: false });

    try {
      const cacheParams = new URLSearchParams({ select: "*", limit: "1" });
      cacheParams.set("client_id", `eq.${clientId}`);
      const cacheRes = await fetch(`${SUPABASE_URL}/rest/v1/client_cache?${cacheParams.toString()}`, { headers });
      const cachePayload = (await cacheRes.json().catch(() => [])) as Record<string, any>[];
      const fromCache = parseClientConfig(cachePayload?.[0]);
      if (fromCache) return fromCache;
    } catch {
      // fallback below
    }

    try {
      const params = new URLSearchParams({
        select: "gas_delete_url,google_sheet_url,google_form_url,google_sheet_id,google_form_id,drive_sent_folder_id",
        limit: "1",
      });
      params.set("id", `eq.${clientId}`);
      const response = await fetch(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`, { headers });
      const payload = (await response.json().catch(() => [])) as Record<string, any>[];
      const fromClient = parseClientConfig(payload?.[0]);
      if (fromClient) return fromClient;
    } catch {
      // ignore
    }

    return null;
  };

  useEffect(() => {
    let active = true;

    const syncBlockedFromObreirosAuth = async () => {
      const clientId = (localStorage.getItem("clientId") || "").trim();
      if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

      const phones = Array.from(
        new Set(
          data
            .map((row) => String(row.telefone || row.phone || row["Telefone"] || "").replace(/\D/g, "").trim())
            .filter((v) => !!v)
        )
      );

      if (phones.length === 0) return;

      const headers = getSupabaseHeaders({ json: false });
      const params = new URLSearchParams({ select: "telefone,status,liberacao_automatica", limit: "5000" });
      params.set("client_id", `eq.${clientId}`);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${params.toString()}`, { headers });
      if (!response.ok) return;

      const rows = (await response.json().catch(() => [])) as Array<{ telefone?: string; status?: string; liberacao_automatica?: boolean | string | null }>;
      if (!active || !Array.isArray(rows)) return;

      const statusByPhone = new Map<string, string>();
      const autoByPhone = new Map<string, boolean>();
      rows.forEach((item) => {
        const phone = String(item?.telefone || "").replace(/\D/g, "").trim();
        if (!phone) return;
        statusByPhone.set(phone, String(item?.status || "").trim().toUpperCase());
        const rawAuto = String(item?.liberacao_automatica ?? "").trim().toLowerCase();
        autoByPhone.set(phone, rawAuto === "true" || rawAuto === "1");
      });

      setRowOverridesByPhone((prev) => {
        const next = { ...prev };
        phones.forEach((phone) => {
          const dbStatus = statusByPhone.get(phone) || "";
          const statusUsuario = dbStatus === "BLOQUEADO" ? "BLOQUEADO" : "";
          const autoEnabled = autoByPhone.get(phone) === true;
          next[phone] = {
            ...(next[phone] || {}),
            obreiro_auth_status: dbStatus,
            status: dbStatus || (next[phone]?.status || ""),
            "Status Usuario": statusUsuario,
            status_usuario: statusUsuario,
            statusUsuario: statusUsuario,
            liberacao_automatica: autoEnabled ? "true" : "false",
            liberacaoAutomatica: autoEnabled ? "true" : "false",
            "Liberacao Automatica": autoEnabled ? "true" : "false",
          };
        });
        return next;
      });
    };

    void syncBlockedFromObreirosAuth();

    return () => {
      active = false;
    };
  }, [data]);
  useEffect(() => {
    let active = true;
    fetchClientConfig().then((cfg) => {
      if (active) setClientConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, []);

  const withTechnicalContext = (cfg: ClientLettersConfig, body: Record<string, string>) => ({
    gas_delete_url: cfg.gasDeleteUrl,
    ...body,
    ...(cfg.googleSheetId ? { googleSheetId: cfg.googleSheetId } : {}),
    ...(cfg.googleFormId ? { googleFormId: cfg.googleFormId } : {}),
    ...(cfg.driveSentFolderId ? { driveSentFolderId: cfg.driveSentFolderId } : {}),
  });

  const callLettersWebhook = async (body: Record<string, string>) => {
    const cfg = clientConfig || (await fetchClientConfig());
    if (!cfg) {
      toast.error("Configura√ß√£o da API da igreja n√£o encontrada.");
      return null;
    }
    if (!clientConfig) setClientConfig(cfg);

    const response = await fetch(LETTERS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withTechnicalContext(cfg, body)),
    });
    let payload: Record<string, any> | null = null;
    try {
      payload = (await response.json()) as Record<string, any>;
    } catch {
      throw new Error("Resposta inv√°lida do webhook");
    }
    if (!response.ok || !payload?.ok) {
      const message = (payload?.error || payload?.message || `Falha na API da igreja (${response.status})`).trim();
      throw new Error(message);
    }
    return payload;
  };

  const upsertObreiroAuthStatus = async (row: Record<string, string>, targetStatus: "BLOQUEADO" | "LIBERADO") => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Cliente nao autenticado para atualizar obreiro.");
    }

    const rawPhone = String(row.telefone || row.phone || row["Telefone"] || "");
    const telefone = rawPhone.replace(/\D/g, "").trim();
    if (!telefone) {
      throw new Error("Telefone do obreiro nao informado.");
    }

    const nome = String(row.nome || row.full_name || row["Nome completo"] || "-").trim() || "-";
    const email = String(row.email || row["EndereÁo de e-mail"] || "").trim();
    const dbStatus = targetStatus === "BLOQUEADO" ? "BLOQUEADO" : "AUTORIZADO";

    const headers = {
      ...getSupabaseHeaders(),
      Prefer: "resolution=merge-duplicates",
    };

    const payload = {
      client_id: clientId,
      nome,
      telefone,
      email: email || null,
      status: dbStatus,
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?on_conflict=client_id,telefone`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "Falha ao atualizar obreiro_auth.");
    }
  };

  const upsertObreiroAutoRelease = async (row: Record<string, string>, enabled: boolean) => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Cliente nao autenticado para atualizar liberacao automatica.");
    }

    const rawPhone = String(row.telefone || row.phone || row["Telefone"] || "");
    const telefone = rawPhone.replace(/\D/g, "").trim();
    if (!telefone) {
      throw new Error("Telefone do obreiro nao informado.");
    }

    const nome = String(row.nome || row.full_name || row["Nome completo"] || "-").trim() || "-";
    const email = String(row.email || row["EndereÁo de e-mail"] || "").trim();

    const headers = {
      ...getSupabaseHeaders(),
      Prefer: "resolution=merge-duplicates",
    };

    const payload = {
      client_id: clientId,
      nome,
      telefone,
      email: email || null,
      liberacao_automatica: enabled,
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?on_conflict=client_id,telefone`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "Falha ao atualizar liberacao automatica no obreiro_auth.");
    }
  };

  const applyRowOverride = (docId: string, partial: Record<string, string>) => {
    setRowOverridesByDocId((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        ...partial,
      },
    }));
  };

  const applyPhoneOverride = (phone: string, partial: Record<string, string>) => {
    setRowOverridesByPhone((prev) => ({
      ...prev,
      [phone]: {
        ...(prev[phone] || {}),
        ...partial,
      },
    }));
  };

  const liberarCarta = async (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    const docId = getDocId(currentRow);
    if (isBlocked(currentRow)) {
      toast.error("Este membro esta bloqueado.");
      return;
    }
    if (isLiberacaoAutomatica(currentRow)) {
      toast.error("Liberacao automatica ativa para esta carta.");
      return;
    }
    if (getStatusCarta(currentRow) === "LIBERADA") {
      toast.error("Carta ja liberada.");
      return;
    }
    if (!docId) {
      toast.error("Documento sem ID.");
      return;
    }
    try {
      const pastorName = (localStorage.getItem("pastor_name") || "Pastor").trim() || "Pastor";
      const sendResult = await callLettersWebhook(buildSendLetterPayload(currentRow, "manual", pastorName));
      const nextStatus = (sendResult?.statusCarta || "LIBERADA").trim();
      applyRowOverride(docId, {
        status_carta: nextStatus,
        status: nextStatus,
        liberado_por: pastorName,
      });
      toast.success((sendResult?.message || "Carta liberada com sucesso").trim());
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "N?o foi poss?vel liberar a carta.");
    }
  };

  const marcarEnvio = async (row: Record<string, string>, options?: { skipLiberacaoCheck?: boolean }) => {
    const currentRow = resolveRow(row);
    const docId = getDocId(currentRow);
    if (isBlocked(currentRow)) {
      toast.error("Este membro esta bloqueado.");
      return;
    }
    if (!options?.skipLiberacaoCheck && !isLiberacaoAutomatica(currentRow) && getStatusCarta(currentRow) !== "LIBERADA") {
      toast.error("Libere a carta antes de compartilhar.");
      return;
    }
    if (!docId) {
      toast.error("Documento sem ID.");
      return;
    }
    try {
      const result = await callLettersWebhook({
        action: "set_envio",
        docId,
        envio: "ENVIADO",
      });
      const now = new Date();
      const nextEnvio = (result?.envio || "ENVIADO").trim();
      applyRowOverride(docId, {
        envio: nextEnvio,
        data_envio: now.toISOString(),
        envio_data: now.toISOString(),
      });
      toast.success((result?.message || "Carta Enviada Com Sucesso").trim());
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "N?o foi poss?vel marcar envio.");
    }
  };

  const moverCartaEnviada = async (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    const docId = getDocId(currentRow);
    if (isBlocked(currentRow)) {
      toast.error("Este membro esta bloqueado.");
      return;
    }
    if (!isLiberacaoAutomatica(currentRow) && getStatusCarta(currentRow) !== "LIBERADA") {
      toast.error("Libere a carta antes de mover.");
      return;
    }
    if (!docId) {
      toast.error("Documento sem ID.");
      return;
    }
    try {
      const result = await callLettersWebhook({
        action: "move_sent",
        docId,
      });
      const nextDrive = (result?.driveStatus || "CARTA_ENVIADA").trim();
      applyRowOverride(docId, { drive_status: nextDrive });
      toast.success((result?.message || "Carta movida para enviada com sucesso").trim());
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "N?o foi poss?vel mover a carta.");
    }
  };

  const compartilharCarta = async (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    if (isBlocked(currentRow)) {
      toast.error("Este membro esta bloqueado.");
      return;
    }
    shareOnWhatsApp(currentRow);
    await marcarEnvio(currentRow, { skipLiberacaoCheck: true });
  };

  const toggleBloqueioUsuario = async (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    const docId = getDocId(currentRow);
    const phone = getPhoneDigits(currentRow);

    const targetStatus = isBlocked(currentRow) ? "LIBERADO" : "BLOQUEADO";
    try {
      await upsertObreiroAuthStatus(currentRow, targetStatus as "BLOQUEADO" | "LIBERADO");

      const nextStatus = targetStatus === "BLOQUEADO" ? "BLOQUEADO" : "";

      if (docId) {
        applyRowOverride(docId, {
          "Status Usuario": nextStatus,
          statusUsuario: nextStatus,
          status_usuario: nextStatus,
          status: targetStatus === "BLOQUEADO" ? "BLOQUEADO" : "AUTORIZADO",
          __force_blocked: targetStatus === "BLOQUEADO" ? "1" : "0",
        });
      }

      if (phone) {
        applyPhoneOverride(phone, {
          "Status Usuario": nextStatus,
          statusUsuario: nextStatus,
          status_usuario: nextStatus,
          status: targetStatus === "BLOQUEADO" ? "BLOQUEADO" : "AUTORIZADO",
          __force_blocked: targetStatus === "BLOQUEADO" ? "1" : "0",
        });
      }

      toast.success(targetStatus === "BLOQUEADO" ? "Usuario bloqueado com sucesso" : "Usuario desbloqueado com sucesso");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar status do usuario.");
    }
  };

  const toggleLiberacaoAutomatica = async (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    const docId = getDocId(currentRow);
    const phone = getPhoneDigits(currentRow);

    if (!docId && !phone) {
      toast.error("Registro sem identificador para atualizar liberacao automatica.");
      return;
    }

    const next = !isLiberacaoAutomatica(currentRow);
    try {
      await upsertObreiroAutoRelease(currentRow, next);

      const nextStatusCarta = next ? "LIBERADA" : "GERADA";

      if (docId) {
        applyRowOverride(docId, {
          liberacao_automatica: next ? "true" : "false",
          liberacaoAutomatica: next ? "true" : "false",
          "Liberacao Automatica": next ? "true" : "false",
          status_carta: nextStatusCarta,
          "Status Carta": nextStatusCarta,
        });
      }

      if (phone) {
        applyPhoneOverride(phone, {
          liberacao_automatica: next ? "true" : "false",
          liberacaoAutomatica: next ? "true" : "false",
          "Liberacao Automatica": next ? "true" : "false",
          status_carta: nextStatusCarta,
          "Status Carta": nextStatusCarta,
        });
      }

      toast.success(next ? "Liberacao automatica ativada" : "Liberacao automatica desativada");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar liberacao automatica.");
    }
  };

  useEffect(() => {
    // Fluxo automatico por webhook desativado: liberacao automatica agora atualiza apenas banco/front.
  }, [data, clientConfig]);

  const deleteKey = (row: Record<string, string>) =>
    [row.doc_id, row.url_pdf, row.data_emissao, row.nome].map((v) => (v || "").trim()).join("|").toLowerCase();

  const deleteCarta = async (row: Record<string, string>) => {
    const docId = getDocId(resolveRow(row));

    if (!docId) {
      toast.error("N?o foi poss?vel excluir. Tente novamente.");
      return;
    }

    const confirmDelete = window.confirm("Tem certeza que deseja excluir esta carta?");
    if (!confirmDelete) return;

    const rowKey = deleteKey(row);
    setDeletingKey(rowKey);

    try {
      const result = await callLettersWebhook({
        action: "delete",
        docId,
      });

      toast.success((result?.message || "Carta exclu?da com sucesso").trim());
      onDeleteSuccess?.(row);
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "N?o foi poss?vel excluir. Tente novamente.");
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="space-y-3 p-3 md:hidden">
          {pageData.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado</div>
          ) : (
            pageData.map((row, i) => (
              <div
                key={i}
                className={`rounded-md border p-3 ${
                  highlightStatus
                    ? shouldHighlightBlocked(resolveRow(row))
                      ? "border-rose-300 bg-rose-50"
                      : "border-border bg-background"
                    : "border-border bg-background"
                }`}
              >
                <div className="space-y-2">
                  {visibleColumns.map((c, colIdx) => (
                    <div key={c.key} className="grid grid-cols-[110px_1fr] gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">{c.label}</span>
                      <span className="break-words text-foreground">
                        {c.render ? c.render(resolveRow(row)) : (isEmptyValue(resolveRow(row)[c.key]) ? EMPTY : resolveRow(row)[c.key])}
                      </span>
                    </div>
                  ))}
                </div>
                {isBlocked(resolveRow(row)) && (
                  <div className="mt-2 space-y-1">
                    <Badge className="border-rose-300 bg-rose-100 text-rose-700 hover:bg-rose-100" variant="outline">
                      Usuario bloqueado
                    </Badge>
                    <p className="text-xs text-rose-700">Este membro esta bloqueado.</p>
                  </div>
                )}
                {showDetails && actionsVariant === "detailsOnly" && (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}
                      className="w-full text-xs border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                    </Button>
                  </div>
                )}
                {showDetails && actionsVariant === "full" && (
                  <div className="mt-3">
                    {(() => {
                      const currentRow = resolveRow(row);
                      const blocked = isBlocked(currentRow);
                      const statusCarta = getStatusCarta(currentRow);
                      const liberacaoAutomatica = isLiberacaoAutomatica(currentRow);
                      const envioStatus = getEnvioStatus(currentRow);
                      const isEnviado = envioStatus === "ENVIADO";
                      const canLiberar = !blocked && !liberacaoAutomatica && statusCarta !== "LIBERADA";
                      const canCompartilhar = !blocked;
                      const deleting = deletingKey === deleteKey(row);

                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full text-xs">
                              <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> A√ß√µes
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onSelect={() => setDetailRow(detailRowResolver ? detailRowResolver(currentRow) : currentRow)}
                            >
                              <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleBloqueioUsuario(currentRow)}>{blocked ? "Desbloquear usuario" : "Bloquear usuario"}</DropdownMenuItem>
                            {!blocked && (
                              <DropdownMenuItem onSelect={() => toggleLiberacaoAutomatica(currentRow)}>
                                Liberacao automatica: {isLiberacaoAutomatica(currentRow) ? "ON" : "OFF"}
                              </DropdownMenuItem>
                            )}
                            {canLiberar && (
                              <DropdownMenuItem disabled={isEnviado} onSelect={() => liberarCarta(currentRow)}>
                                Liberar carta
                              </DropdownMenuItem>
                            )}
                            {!blocked && <DropdownMenuItem onSelect={() => openCartaForm(currentRow)}>Carta</DropdownMenuItem>}
                            {canCompartilhar && (
                              <DropdownMenuItem disabled={isEnviado} onSelect={() => compartilharCarta(currentRow)}>
                                <Share2 className="mr-2 h-3.5 w-3.5" /> Compartilhar
                              </DropdownMenuItem>
                            )}
                            {!blocked && liberacaoAutomatica && <DropdownMenuItem disabled>Liberacao automatica</DropdownMenuItem>}
                            {blocked && <DropdownMenuItem disabled>Este membro esta bloqueado</DropdownMenuItem>}
                            {enableDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => deleteCarta(currentRow)}
                                  disabled={deleting}
                                  className="text-rose-700 focus:text-rose-800"
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> {deleting ? "Excluindo..." : "Excluir"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((c, colIdx) => (
                  <TableHead key={c.key} className="whitespace-nowrap text-xs font-semibold">
                    {c.label}
                  </TableHead>
                ))}
                {showDetails && <TableHead className="w-20 text-xs font-semibold">A√ß√µes</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + (showDetails ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((row, i) => (
                  <TableRow
                    key={i}
                    className={
                      highlightStatus
                        ? shouldHighlightBlocked(resolveRow(row))
                          ? "bg-rose-50"
                          : ""
                        : ""
                    }
                  >
                    {visibleColumns.map((c, colIdx) => (
                      <TableCell key={c.key} className="text-sm">
                        {actionsVariant === "full" && colIdx === 0 && isBlocked(resolveRow(row)) && (
                          <div className="mb-2">
                            <Badge className="border-rose-300 bg-rose-100 text-rose-700 hover:bg-rose-100" variant="outline">
                              Usuario bloqueado
                            </Badge>
                            <div className="text-xs text-rose-700">Este membro esta bloqueado.</div>
                          </div>
                        )}
                        {c.render ? c.render(resolveRow(row)) : (isEmptyValue(resolveRow(row)[c.key]) ? EMPTY : resolveRow(row)[c.key])}
                      </TableCell>
                    ))}
                    {showDetails && (
                      <TableCell>

                        {actionsVariant === "detailsOnly" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}
                            className="text-xs bg-sky-600 text-white hover:bg-sky-700"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                          </Button>
                        ) : (
                          (() => {
                            const currentRow = resolveRow(row);
                            const blocked = isBlocked(currentRow);
                            const statusCarta = getStatusCarta(currentRow);
                            const liberacaoAutomatica = isLiberacaoAutomatica(currentRow);
                            const envioStatus = getEnvioStatus(currentRow);
                            const isEnviado = envioStatus === "ENVIADO";
                            const canLiberar = !blocked && !liberacaoAutomatica && statusCarta !== "LIBERADA";
                            const canCompartilhar = !blocked;
                            const deleting = deletingKey === deleteKey(row);

                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-xs bg-slate-700 text-white hover:bg-slate-800">
                                    <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> A√ß√µes
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuItem
                                    onSelect={() => setDetailRow(detailRowResolver ? detailRowResolver(currentRow) : currentRow)}
                                  >
                                    <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => toggleBloqueioUsuario(currentRow)}>{blocked ? "Desbloquear usuario" : "Bloquear usuario"}</DropdownMenuItem>
                                  {!blocked && (
                                    <DropdownMenuItem onSelect={() => toggleLiberacaoAutomatica(currentRow)}>
                                      Liberacao automatica: {isLiberacaoAutomatica(currentRow) ? "ON" : "OFF"}
                                    </DropdownMenuItem>
                                  )}
                                  {canLiberar && <DropdownMenuItem disabled={isEnviado} onSelect={() => liberarCarta(currentRow)}>Liberar carta</DropdownMenuItem>}
                                  {!blocked && <DropdownMenuItem onSelect={() => openCartaForm(currentRow)}>Carta</DropdownMenuItem>}
                                  {canCompartilhar && (
                                    <DropdownMenuItem disabled={isEnviado} onSelect={() => compartilharCarta(currentRow)}>
                                      <Share2 className="mr-2 h-3.5 w-3.5" /> Compartilhar
                                    </DropdownMenuItem>
                                  )}
                                  {!blocked && liberacaoAutomatica && <DropdownMenuItem disabled>Liberacao automatica</DropdownMenuItem>}
                                  {blocked && <DropdownMenuItem disabled>Este membro esta bloqueado</DropdownMenuItem>}
                                  {enableDelete && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onSelect={() => deleteCarta(currentRow)}
                                        disabled={deleting}
                                        className="text-rose-700 focus:text-rose-800"
                                      >
                                        <Trash2 className="mr-2 h-3.5 w-3.5" /> {deleting ? "Excluindo..." : "Excluir"}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })()
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {data.length} registro{data.length !== 1 ? "s" : ""} ¬∑ P√°gina {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!detailRow} onOpenChange={() => setDetailRow(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes do Registro</DialogTitle>
            <DialogDescription className="sr-only">Visualiza√ß√£o detalhada dos campos do registro selecionado.</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-2">
              {(detailFields
                ? detailFields
                : detailsSource === "all"
                  ? (() => {
                      const items: DetailField[] = [];
                      const used = new Set<string>();
                      columns.forEach((c) => {
                        if (!isEmptyValue(detailRow[c.key])) {
                          items.push({ key: c.key, label: c.label });
                          used.add(c.key);
                        }
                      });
                      Object.keys(detailRow).forEach((key) => {
                        if (used.has(key)) return;
                        if (key.startsWith("__col_")) return;
                        if (isEmptyValue(detailRow[key])) return;
                        items.push({ key, label: key });
                      });
                      return items;
                    })()
                  : columns
                      .map((c) => ({ key: c.key, label: c.label }))
                      .filter(({ key }) => !isEmptyValue(detailRow[key]))
              ).map(({ key, label }) => {
                const value = detailRow[key];
                return (
                  <div key={key + label} className="flex gap-2 border-b pb-2 text-sm">
                    <span className="min-w-[140px] font-medium text-muted-foreground">{label}</span>
                    <span className="break-all text-foreground">
                      {value && isImageUrl(value, key) ? (
                        <div className="flex w-full flex-col gap-2">
                          <img
                            src={value}
                            alt={label}
                            className="max-h-48 w-full rounded-md border object-cover"
                            loading="lazy"
                          />
                          <a href={value} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">
                            Abrir imagem <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : value && (value.startsWith("http://") || value.startsWith("https://")) ? (
                        <a href={value} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">
                          Abrir link <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        isEmptyValue(value) ? EMPTY : value
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export const CARTAS_COLUMNS: Column[] = [
  { key: "data_emissao", label: "Data", render: (r) => formatDate(parseDate(r.data_emissao)) || EMPTY },
  { key: "nome", label: "Nome" },
  { key: "data_pregacao", label: "Dia da prega√ß√£o", render: (r) => formatDate(parseDate(r.data_pregacao)) || EMPTY },
  { key: "igreja_origem", label: "Igreja origem" },
  { key: "igreja_destino", label: "Igreja destino" },
  {
    key: "status",
    label: "Status",
    render: (r) => {
      const label = getDerivedStatusLabel(r as Record<string, string>);
      const reason = r.motivo_bloqueio && r.motivo_bloqueio !== "-" && r.motivo_bloqueio !== "????????" ? r.motivo_bloqueio : "";

      return (
        <div className="space-y-1">
          <Badge className={getDerivedStatusClass(label)} variant="outline">
            {label}
          </Badge>
          {label === "Bloqueado" && reason && (
            <div className="max-w-[280px] whitespace-normal text-xs text-rose-700">
              Motivo: {reason}
            </div>
          )}
        </div>
      );
    },
  },
  {
    key: "url_pdf",
    label: "PDF",
    render: (r) => {
      const url =
        r.url_pdf ||
        r["Link to merged Doc - carta de pregaÁ„o"] ||
        r["Link to merged Doc - carta de pregacao"] ||
        r["Merged Doc URL - carta de pregaÁ„o"] ||
        r["Merged Doc URL - carta de pregacao"] ||
        r["Merged Doc URL - Cartas"] ||
        r["Merged Doc URL - cartas"] ||
        r["merged_doc_url_-_cartas"] ||
        r["Link to merged Doc - Cartas"] ||
        r["Link to merged Doc - cartas"] ||
        r["link_to_merged_doc_-_cartas"];
      if (!url || url === "-" || url === "√¢‚Ç¨‚Äù") return EMPTY;
      const blocked = isBlockedRow(r as Record<string, string>);
      return blocked ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          className="border-green-600 bg-green-600 text-xs text-white hover:bg-green-700 whitespace-nowrap"
        >
          <ExternalLink className="h-3 w-3" /> Abrir PDF
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="border-green-600 bg-green-600 text-xs text-white hover:bg-green-700 whitespace-nowrap"
        >
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="h-3 w-3" /> Abrir PDF
          </a>
        </Button>
      );
    },
  },
];

export const OBREIROS_COLUMNS: Column[] = [
  { key: "nome", label: "Nome" },
  { key: "cargo", label: "Cargo" },
  { key: "igreja", label: "Igreja" },
  { key: "campo", label: "Campo" },
  { key: "status", label: "Status" },
  { key: "data_ordenacao", label: "Data Ordena√ß√£o", render: (r) => formatDate(parseDate(r.data_ordenacao)) },
  { key: "data_batismo", label: "Data Batismo", render: (r) => formatDate(parseDate(r.data_batismo)) },
];



