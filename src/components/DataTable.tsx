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
  String(row.obreiro_auth_status || row["Status Usuario"] || row["\"Status Usuario\""] || row.statusUsuario || row.status_usuario || "")
    .trim()
    .toUpperCase();

const isBlockedRow = (row: Record<string, string>) => getStatusUsuario(row) === "BLOQUEADO";

const getStatusCartaOperacional = (row: Record<string, string>) => String(row.obreiro_auth_status_carta || "").trim().toUpperCase();

const getStatusCartaVisual = (row: Record<string, string>) =>
  String(row["Status Carta"] || row.statusCarta || row.status_carta || "").trim().toUpperCase();

const isAutoReleaseEnabled = (row: Record<string, string>) => getStatusCartaOperacional(row) === "LIBERADA";

const getDerivedStatusLabel = (row: Record<string, string>) => {
  const statusUsuario = getStatusUsuario(row);
  const statusCartaVisual = getStatusCartaVisual(row);
  const statusCartaOperacional = getStatusCartaOperacional(row);
  const envio = String(row["Envio"] || row.envio || "").trim().toUpperCase();
  const driveStatus = String(row["Drive Status"] || row.driveStatus || row.drive_status || "").trim().toUpperCase();

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (driveStatus === "CARTA_ENVIADA") return "Carta enviada";
  if (envio === "ENVIADO") return "Carta enviada";
  if (statusCartaOperacional === "LIBERADA") return "Liberacao automatica";
  if (statusCartaVisual === "LIBERADA") return "Carta liberada";
  return "Aguardando liberacao";
};

const getDerivedStatusClass = (label: string) => {
  if (label === "Bloqueado") return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
  if (label === "Gerada") return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (label === "Aguardando liberacao") return "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50";
  if (label === "Liberacao automatica") return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
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

interface RowActionItem {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
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
  rowActions?: (row: Record<string, string>) => RowActionItem[];
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
  rowActions,
}: Props) {
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<Record<string, string> | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [clientConfig, setClientConfig] = useState<ClientLettersConfig | null>(null);
  const [rowOverridesByDocId, setRowOverridesByDocId] = useState<Record<string, Record<string, string>>>({});
  const [rowOverridesByPhone, setRowOverridesByPhone] = useState<Record<string, Record<string, string>>>({});
  const autoSentDocIdsRef = useRef<Set<string>>(new Set());
  const seenDocIdsRef = useRef<Set<string>>(new Set());
  const autoSendTimersRef = useRef<Record<string, number>>({});
  const useLegacyLetterActions = actionsVariant === "full";

  const getAutoSentStorageKey = () => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    return clientId ? "cartas_auto_sent_doc_ids:" + clientId : "cartas_auto_sent_doc_ids";
  };

  const loadAutoSentDocIds = () => {
    try {
      const raw = localStorage.getItem(getAutoSentStorageKey()) || "[]";
      const parsed = JSON.parse(raw);
      autoSentDocIdsRef.current = new Set(
        Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : []
      );
    } catch {
      autoSentDocIdsRef.current = new Set();
    }
  };

  const persistAutoSentDocId = (docId: string) => {
    const cleanDocId = String(docId || "").trim();
    if (!cleanDocId) return;
    autoSentDocIdsRef.current.add(cleanDocId);
    localStorage.setItem(getAutoSentStorageKey(), JSON.stringify(Array.from(autoSentDocIdsRef.current)));
  };
  useEffect(() => {
    loadAutoSentDocIds();
  }, []);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isEmptyValue = (value?: string) => !value || value === "-" || value === EMPTY;

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
      toast.error("Link de carta nao configurado.");
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
      row["Merged Doc ID - carta de pregação"] ||
      row["Merged Doc ID - carta de pregacao"] ||
      row["Merged Doc ID - Cartas"] ||
      row["Merged Doc ID - cartas"] ||
      row["merged_doc_id_-_cartas"] ||
      row["Merged Doc ID - Carta de Pregacao"] ||
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

  const getRowActions = (row: Record<string, string>) => {
    const currentRow = resolveRow(row);
    return rowActions ? rowActions(currentRow) : [];
  };

  const getStatusCarta = (row: Record<string, string>) => getStatusCartaVisual(row);

  const getEnvioStatus = (row: Record<string, string>) =>
    String(row.envio || row["Envio"] || row.send_status || "").trim().toUpperCase();

  const getDocUrl = (row: Record<string, string>) =>
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

  const getPdfUrl = (row: Record<string, string>) =>
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
    minister_role: (row.funcao || row["Funcao Ministerial ?"] || row.cargo || row.minister_role || "-").trim() || "-",
    statusCarta: "LIBERADA",
    liberadoPor,
  });

  const isLiberacaoAutomatica = (row: Record<string, string>) => isAutoReleaseEnabled(row);

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
    if (!useLegacyLetterActions) return;
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
      const params = new URLSearchParams({ select: "telefone,status,status_carta", limit: "5000" });
      params.set("client_id", `eq.${clientId}`);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${params.toString()}`, { headers });
      if (!response.ok) return;

      const rows = (await response.json().catch(() => [])) as Array<{ telefone?: string; status?: string; status_carta?: string | null }>;
      if (!active || !Array.isArray(rows)) return;

      const statusByPhone = new Map<string, string>();
      const statusCartaByPhone = new Map<string, string>();
      rows.forEach((item) => {
        const phone = String(item?.telefone || "").replace(/\D/g, "").trim();
        if (!phone) return;
        statusByPhone.set(phone, String(item?.status || "").trim().toUpperCase());
        statusCartaByPhone.set(phone, String(item?.status_carta || "").trim().toUpperCase());
      });

      setRowOverridesByPhone((prev) => {
        const next = { ...prev };
        phones.forEach((phone) => {
          const dbStatus = statusByPhone.get(phone) || "";
          const dbStatusCarta = statusCartaByPhone.get(phone) || "GERADA";
          const statusUsuario = dbStatus === "BLOQUEADO" ? "BLOQUEADO" : "";
          next[phone] = {
            ...(next[phone] || {}),
            obreiro_auth_status: dbStatus,
            obreiro_auth_status_carta: dbStatusCarta,
            status: dbStatus || (next[phone]?.status || ""),
            "Status Usuario": statusUsuario,
            status_usuario: statusUsuario,
            statusUsuario: statusUsuario,
          };
        });
        return next;
      });
    };

    void syncBlockedFromObreirosAuth();

    return () => {
      active = false;
    };
  }, [data, useLegacyLetterActions]);
  useEffect(() => {
    if (!useLegacyLetterActions) return;
    let active = true;
    fetchClientConfig().then((cfg) => {
      if (active) setClientConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, [useLegacyLetterActions]);

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
      toast.error("Configuracao da API da igreja nao encontrada.");
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
      throw new Error("Resposta invalida do webhook");
    }
    if (!response.ok || !payload?.ok) {
      const message = (payload?.error || payload?.message || `Falha na API da igreja (${response.status})`).trim();
      throw new Error(message);
    }
    return payload;
  };

  const getObreiroAuthIdentity = (row: Record<string, string>) => {
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
    const email = String(row.email || row["Endere?o de e-mail"] || "").trim();

    return { clientId, telefone, nome, email };
  };

  const saveObreiroAuthRow = async (row: Record<string, string>, patch: Record<string, string | null>) => {
    const { clientId, telefone, nome, email } = getObreiroAuthIdentity(row);
    const headers = {
      ...getSupabaseHeaders(),
      Prefer: "return=representation",
    };

    const params = new URLSearchParams({
      select: "id,telefone,status,status_carta",
      limit: "1",
    });
    params.set("client_id", "eq." + clientId);
    params.set("telefone", "eq." + telefone);

    const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${params.toString()}`, {
      headers: getSupabaseHeaders({ json: false }),
    });

    if (!existingRes.ok) {
      const body = await existingRes.text().catch(() => "");
      throw new Error(body || "Falha ao consultar obreiro_auth.");
    }

    const existing = await existingRes.json().catch(() => []);
    const basePayload = {
      client_id: clientId,
      nome,
      telefone,
      email: email || null,
      ...patch,
    };

    if (Array.isArray(existing) && existing[0]?.id) {
      const updateParams = new URLSearchParams({ select: "id,telefone,status,status_carta" });
      updateParams.set("id", "eq." + existing[0].id);
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${updateParams.toString()}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch),
      });

      if (!updateRes.ok) {
        const body = await updateRes.text().catch(() => "");
        throw new Error(body || "Falha ao atualizar obreiro_auth.");
      }

      const updated = await updateRes.json().catch(() => []);
      return Array.isArray(updated) ? updated[0] || null : null;
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth`, {
      method: "POST",
      headers,
      body: JSON.stringify(basePayload),
    });

    if (!insertRes.ok) {
      const body = await insertRes.text().catch(() => "");
      throw new Error(body || "Falha ao criar obreiro_auth.");
    }

    const inserted = await insertRes.json().catch(() => []);
    return Array.isArray(inserted) ? inserted[0] || null : null;
  };

  const upsertObreiroAuthStatus = async (row: Record<string, string>, targetStatus: "BLOQUEADO" | "AUTORIZADO") => {
    const dbStatus = targetStatus === "BLOQUEADO" ? "BLOQUEADO" : "AUTORIZADO";
    return saveObreiroAuthRow(row, { status: dbStatus });
  };

  const upsertObreiroAutoRelease = async (row: Record<string, string>, enabled: boolean) => {
    return saveObreiroAuthRow(row, { status_carta: enabled ? "LIBERADA" : "GERADA" });
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
  const applyWebhookResultToRow = (row: Record<string, string>, result: Record<string, any> | null | undefined) => {
    if (!result) return;

    const currentRow = resolveRow(row);
    const docId = String(result.docId || getDocId(currentRow)).trim();
    const phone = getPhoneDigits(currentRow);
    const nowIso = new Date().toISOString();
    const partial: Record<string, string> = {};

    const action = String(result.action || "").trim();
    const statusCarta = String(result.statusCarta || "").trim();
    const envio = String(result.envio || "").trim();
    const driveStatus = String(result.driveStatus || "").trim();
    const liberadoPor = String(result.liberadoPor || "").trim();

    if (statusCarta) {
      partial.status_carta = statusCarta;
      partial["Status Carta"] = statusCarta;
      partial.status = statusCarta;
    }

    if (envio) {
      partial.envio = envio;
      partial["Envio"] = envio;
      if (envio === "ENVIADO") {
        partial.data_envio = nowIso;
        partial["Data Envio"] = nowIso;
      }
    }

    if (driveStatus) {
      partial.drive_status = driveStatus;
      partial["Drive Status"] = driveStatus;
    }

    if (liberadoPor) {
      partial.liberado_por = liberadoPor;
      partial["Liberado Por"] = liberadoPor;
    }

    if (action === "set_status_carta" || action === "send_letter") {
      partial.status_carta = partial.status_carta || "LIBERADA";
      partial["Status Carta"] = partial["Status Carta"] || "LIBERADA";
      partial.status = partial.status || "LIBERADA";
    }

    if (action === "set_envio") {
      partial.envio = partial.envio || "ENVIADO";
      partial["Envio"] = partial["Envio"] || "ENVIADO";
      partial.data_envio = partial.data_envio || nowIso;
      partial["Data Envio"] = partial["Data Envio"] || nowIso;
    }

    if (action === "move_sent") {
      partial.drive_status = partial.drive_status || "CARTA_ENVIADA";
      partial["Drive Status"] = partial["Drive Status"] || "CARTA_ENVIADA";
    }

    if (docId && Object.keys(partial).length > 0) {
      applyRowOverride(docId, partial);
    }

    if (phone && Object.keys(partial).length > 0) {
      applyPhoneOverride(phone, partial);
    }
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
      applyWebhookResultToRow(currentRow, {
        ...sendResult,
        action: sendResult?.action || "send_letter",
        statusCarta: sendResult?.statusCarta || "LIBERADA",
        liberadoPor: sendResult?.liberadoPor || pastorName,
      });
      toast.success((sendResult?.message || "Carta liberada com sucesso").trim());
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel liberar a carta.");
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
      applyWebhookResultToRow(currentRow, {
        ...result,
        action: result?.action || "set_envio",
        envio: result?.envio || "ENVIADO",
      });
      toast.success((result?.message || "Carta Enviada Com Sucesso").trim());
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel marcar envio.");
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
      applyWebhookResultToRow(currentRow, {
        ...result,
        action: result?.action || "move_sent",
        driveStatus: result?.driveStatus || "CARTA_ENVIADA",
      });
      await onRefetchCache?.();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel mover a carta.");
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

    const targetStatus = isBlocked(currentRow) ? "AUTORIZADO" : "BLOQUEADO";
    try {
      const saved = await upsertObreiroAuthStatus(currentRow, targetStatus as "BLOQUEADO" | "AUTORIZADO");

      const nextStatus = String(saved?.status || targetStatus).trim().toUpperCase() || targetStatus;

      if (docId) {
        applyRowOverride(docId, {
          obreiro_auth_status: nextStatus,
          "Status Usuario": nextStatus,
          statusUsuario: nextStatus,
          status_usuario: nextStatus,
          status: nextStatus,
          __force_blocked: targetStatus === "BLOQUEADO" ? "1" : "0",
        });
      }

      if (phone) {
        applyPhoneOverride(phone, {
          obreiro_auth_status: nextStatus,
          "Status Usuario": nextStatus,
          statusUsuario: nextStatus,
          status_usuario: nextStatus,
          status: nextStatus,
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
      const saved = await upsertObreiroAutoRelease(currentRow, next);

      const nextStatusCarta = String(saved?.status_carta || (next ? "LIBERADA" : "GERADA")).trim().toUpperCase() || (next ? "LIBERADA" : "GERADA");

      if (docId) {
        applyRowOverride(docId, {
          obreiro_auth_status_carta: nextStatusCarta,
        });
      }

      if (phone) {
        applyPhoneOverride(phone, {
          obreiro_auth_status_carta: nextStatusCarta,
        });
      }

      toast.success(next ? "Liberacao automatica ativada" : "Liberacao automatica desativada");
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar liberacao automatica.");
    }
  };

  useEffect(() => {
    if (!clientConfig) return;
    const rows = data.map((r) => resolveRow(r));

    rows.forEach((row) => {
      const docId = getDocId(row);
      if (!docId) return;

      if (getEnvioStatus(row) === "ENVIADO") {
        persistAutoSentDocId(docId);
      }

      const isNewRow = !seenDocIdsRef.current.has(docId);
      if (!isNewRow) return;

      seenDocIdsRef.current.add(docId);

      const blocked = isBlocked(row);
      const statusCartaOperacional = getStatusCartaOperacional(row);
      const envio = getEnvioStatus(row);

      if (blocked) return;
      if (!isAutoReleaseEnabled(row)) return;
      if (statusCartaOperacional !== "LIBERADA") return;
      if (envio === "ENVIADO") return;
      if (autoSentDocIdsRef.current.has(docId)) return;
      if (autoSendTimersRef.current[docId]) return;

      autoSendTimersRef.current[docId] = window.setTimeout(async () => {
        try {
          const result = await callLettersWebhook(buildSendLetterPayload(row, "automatico", "LIBERACAO_AUTOMATICA"));
          persistAutoSentDocId(docId);
          applyWebhookResultToRow(row, {
            ...result,
            action: result?.action || "send_letter",
            statusCarta: result?.statusCarta || "LIBERADA",
          });
          toast.success(String(result?.message || "Carta enviada automaticamente").trim());
          await onRefetchCache?.();
        } catch (err: any) {
          toast.error(err?.message || "Nao foi possivel enviar carta automaticamente.");
        } finally {
          delete autoSendTimersRef.current[docId];
        }
      }, 30000);
    });
  }, [data, rowOverridesByPhone, rowOverridesByDocId, clientConfig]);

  useEffect(() => {
    return () => {
      Object.values(autoSendTimersRef.current).forEach((id) => window.clearTimeout(id));
      autoSendTimersRef.current = {};
    };
  }, []);

  const deleteKey = (row: Record<string, string>) =>
    [row.doc_id, row.url_pdf, row.data_emissao, row.nome].map((v) => (v || "").trim()).join("|").toLowerCase();

  const deleteCarta = async (row: Record<string, string>) => {
    const docId = getDocId(resolveRow(row));

    if (!docId) {
      toast.error("Nao foi possivel excluir. Tente novamente.");
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
      toast.error(err?.message || "Nao foi possivel excluir. Tente novamente.");
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
                    {getRowActions(row).length === 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}
                        className="w-full text-xs border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full text-xs border-slate-700 bg-slate-700 text-white hover:bg-slate-800">
                            <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onSelect={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}>
                            <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {getRowActions(row).map((item) => (
                            <DropdownMenuItem
                              key={item.label}
                              onSelect={() => {
                                void item.onClick();
                              }}
                              disabled={item.disabled}
                              className={item.destructive ? "text-rose-700 focus:text-rose-800" : undefined}
                            >
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
                      const canLiberar = !blocked && statusCarta !== "LIBERADA";
                      const canCompartilhar = !blocked;
                      const deleting = deletingKey === deleteKey(row);

                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full text-xs">
                              <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
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
                                Liberacao automatica: {liberacaoAutomatica ? "ON" : "OFF"}
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
                {showDetails && <TableHead className="w-20 text-xs font-semibold">Acoes</TableHead>}
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
                          getRowActions(row).length === 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}
                              className="text-xs bg-sky-600 text-white hover:bg-sky-700"
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                            </Button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-xs bg-slate-700 text-white hover:bg-slate-800">
                                  <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onSelect={() => setDetailRow(detailRowResolver ? detailRowResolver(resolveRow(row)) : resolveRow(row))}>
                                  <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {getRowActions(row).map((item) => (
                                  <DropdownMenuItem
                                    key={item.label}
                                    onSelect={() => {
                                      void item.onClick();
                                    }}
                                    disabled={item.disabled}
                                    className={item.destructive ? "text-rose-700 focus:text-rose-800" : undefined}
                                  >
                                    {item.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )
                        ) : (
                          (() => {
                            const currentRow = resolveRow(row);
                            const blocked = isBlocked(currentRow);
                            const statusCarta = getStatusCarta(currentRow);
                            const liberacaoAutomatica = isLiberacaoAutomatica(currentRow);
                            const envioStatus = getEnvioStatus(currentRow);
                            const isEnviado = envioStatus === "ENVIADO";
                            const canLiberar = !blocked && statusCarta !== "LIBERADA";
                            const canCompartilhar = !blocked;
                            const deleting = deletingKey === deleteKey(row);

                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-xs bg-slate-700 text-white hover:bg-slate-800">
                                    <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
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
                                      Liberacao automatica: {liberacaoAutomatica ? "ON" : "OFF"}
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
              {data.length} registro{data.length !== 1 ? "s" : ""} · Pagina {page + 1} de {totalPages}
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
            <DialogDescription className="sr-only">Visualizacao detalhada dos campos do registro selecionado.</DialogDescription>
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
  { key: "data_pregacao", label: "Dia da pregacao", render: (r) => formatDate(parseDate(r.data_pregacao)) || EMPTY },
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
        r["Link to merged Doc - carta de pregação"] ||
        r["Link to merged Doc - carta de pregacao"] ||
        r["Merged Doc URL - carta de pregação"] ||
        r["Merged Doc URL - carta de pregacao"] ||
        r["Merged Doc URL - Cartas"] ||
        r["Merged Doc URL - cartas"] ||
        r["merged_doc_url_-_cartas"] ||
        r["Link to merged Doc - Cartas"] ||
        r["Link to merged Doc - cartas"] ||
        r["link_to_merged_doc_-_cartas"];
      if (!url || url === "-") return EMPTY;
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
  { key: "data_ordenacao", label: "Data Ordenacao", render: (r) => formatDate(parseDate(r.data_ordenacao)) },
  { key: "data_batismo", label: "Data Batismo", render: (r) => formatDate(parseDate(r.data_batismo)) },
];




