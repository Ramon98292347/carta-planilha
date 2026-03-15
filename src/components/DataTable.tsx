import { useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { formatDate, parseDate } from "@/lib/sheets";
import { EMPTY, buildFormUrl, getDerivedStatusClass, getDerivedStatusLabel, getDocId, getPhoneDigits, getStatusCartaOperacional, getStatusCartaVisual, getStatusUsuario, isAutoReleaseEnabled, isBlockedRow } from "@/lib/dataTableHelpers";
import { buildSendLetterPayload, getEnvioStatus, getObreiroAuthIdentity as resolveObreiroAuthIdentity, type ClientLettersConfig } from "@/lib/dataTableLetters";
import { DataTableActionMenu } from "@/components/DataTableActionMenu";
import { DataTableDetailDialog } from "@/components/DataTableDetailDialog";
import type { Column, DetailField, RowActionItem } from "@/lib/dataTableTypes";
import { callLettersWebhookApi, fetchClientLettersConfig, fetchObreirosAuthRows, saveObreiroAuthRowApi } from "@/lib/dataTableApi";
import {
  deleteCartaAction,
  compartilharCartaAction,
  liberarCartaAction,
  marcarEnvioAction,
  moverCartaEnviadaAction,
  scheduleAutoSendForRows,
  toggleBloqueioUsuarioAction,
  toggleLiberacaoAutomaticaAction,
} from "@/lib/dataTableActions";
import { toast } from "sonner";

const PAGE_SIZE = 25;
const BLOCK_FORM_NAME_FIELD = "entry.1208647889";
const BLOCK_FORM_STATUS_FIELD = "entry.1791445451";
const LETTERS_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/cartas-novo";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

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

  const isLiberacaoAutomatica = (row: Record<string, string>) => isAutoReleaseEnabled(row);

  const openDetailForRow = (row: Record<string, string>) => {
    setDetailRow(detailRowResolver ? detailRowResolver(row) : row);
  };

  const canLiberarCarta = (row: Record<string, string>) => !isBlocked(row) && getStatusCarta(row) !== "LIBERADA";

  const fetchClientConfig = async (): Promise<ClientLettersConfig | null> => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    return fetchClientLettersConfig(clientId, SUPABASE_URL, SUPABASE_ANON_KEY);
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

      const rows = await fetchObreirosAuthRows(clientId, SUPABASE_URL, SUPABASE_ANON_KEY);
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

  const callLettersWebhook = async (body: Record<string, string>) => {
    const cfg = clientConfig || (await fetchClientConfig());
    if (!cfg) {
      toast.error("Configuracao da API da igreja nao encontrada.");
      return null;
    }
    if (!clientConfig) setClientConfig(cfg);
    return callLettersWebhookApi(LETTERS_WEBHOOK_URL, cfg, body);
  };

  const getObreiroAuthIdentity = (row: Record<string, string>) => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    return resolveObreiroAuthIdentity(row, clientId, SUPABASE_URL, SUPABASE_ANON_KEY);
  };

  const saveObreiroAuthRow = async (row: Record<string, string>, patch: Record<string, string | null>) => {
    const identity = getObreiroAuthIdentity(row);
    return saveObreiroAuthRowApi(SUPABASE_URL, identity, patch);
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

  const deleteKey = (row: Record<string, string>) =>
    [row.doc_id, row.url_pdf, row.data_emissao, row.nome].map((v) => (v || "").trim()).join("|").toLowerCase();

  const actionContext = {
    resolveRow,
    callLettersWebhook,
    applyWebhookResultToRow,
    upsertObreiroAuthStatus,
    upsertObreiroAutoRelease,
    applyRowOverride,
    applyPhoneOverride,
    persistAutoSentDocId,
    onRefetchCache,
    onDeleteSuccess,
    setDeletingKey,
    deleteKey,
    shareOnWhatsApp,
    toast,
  };


  const liberarCarta = async (row: Record<string, string>) => {
    return liberarCartaAction(row, actionContext);
  };

  const marcarEnvio = async (row: Record<string, string>, options?: { skipLiberacaoCheck?: boolean }) => {
    return marcarEnvioAction(row, actionContext, options);
  };

  const moverCartaEnviada = async (row: Record<string, string>) => {
    return moverCartaEnviadaAction(row, actionContext);
  };

  const compartilharCarta = async (row: Record<string, string>) => {
    return compartilharCartaAction(row, actionContext);
  };

  const toggleBloqueioUsuario = async (row: Record<string, string>) => {
    return toggleBloqueioUsuarioAction(row, actionContext);
  };

  const toggleLiberacaoAutomatica = async (row: Record<string, string>) => {
    return toggleLiberacaoAutomaticaAction(row, actionContext);
  };

  useEffect(() => {
    if (!clientConfig) return;
    const rows = data.map((r) => resolveRow(r));
    scheduleAutoSendForRows(rows, {
      callLettersWebhook,
      applyWebhookResultToRow,
      persistAutoSentDocId,
      onRefetchCache,
      toast,
      autoSentDocIds: autoSentDocIdsRef.current,
      seenDocIds: seenDocIdsRef.current,
      autoSendTimers: autoSendTimersRef.current,
    });
  }, [data, rowOverridesByPhone, rowOverridesByDocId, clientConfig]);

  useEffect(() => {
    return () => {
      Object.values(autoSendTimersRef.current).forEach((id) => window.clearTimeout(id));
      autoSendTimersRef.current = {};
    };
  }, []);

  const deleteCarta = async (row: Record<string, string>) => {
    return deleteCartaAction(row, actionContext);
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
                    <div key={c.key} className="grid grid-cols-[96px_1fr] gap-2 text-sm sm:grid-cols-[110px_1fr]">
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
                    <DataTableActionMenu
                      row={resolveRow(row)}
                      variant="detailsOnly"
                      buttonVariant="outline"
                      buttonClassName={getRowActions(row).length === 0 ? "text-xs border-sky-600 bg-sky-600 text-white hover:bg-sky-700" : "text-xs border-slate-700 bg-slate-700 text-white hover:bg-slate-800"}
                      fullWidth
                      rowActions={getRowActions(row)}
                      enableDelete={enableDelete}
                      deleting={deletingKey === deleteKey(row)}
                      onOpenDetails={() => openDetailForRow(resolveRow(row))}
                      onToggleBloqueioUsuario={toggleBloqueioUsuario}
                      onToggleLiberacaoAutomatica={toggleLiberacaoAutomatica}
                      onLiberarCarta={liberarCarta}
                      onOpenCartaForm={openCartaForm}
                      onCompartilharCarta={compartilharCarta}
                      onDeleteCarta={deleteCarta}
                    />
                  </div>
                )}
                {showDetails && actionsVariant === "full" && (
                  <div className="mt-3">
                    <DataTableActionMenu
                      row={resolveRow(row)}
                      variant="full"
                      buttonVariant="outline"
                      buttonClassName="text-xs"
                      fullWidth
                      rowActions={[]}
                      enableDelete={enableDelete}
                      deleting={deletingKey === deleteKey(row)}
                      canLiberarCarta={canLiberarCarta}
                      onOpenDetails={() => openDetailForRow(resolveRow(row))}
                      onToggleBloqueioUsuario={toggleBloqueioUsuario}
                      onToggleLiberacaoAutomatica={toggleLiberacaoAutomatica}
                      onLiberarCarta={liberarCarta}
                      onOpenCartaForm={openCartaForm}
                      onCompartilharCarta={compartilharCarta}
                      onDeleteCarta={deleteCarta}
                    />
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
                          <DataTableActionMenu
                            row={resolveRow(row)}
                            variant="detailsOnly"
                            buttonVariant="ghost"
                            buttonClassName={getRowActions(row).length === 0 ? "text-xs bg-sky-600 text-white hover:bg-sky-700" : "text-xs bg-slate-700 text-white hover:bg-slate-800"}
                            rowActions={getRowActions(row)}
                            enableDelete={enableDelete}
                            deleting={deletingKey === deleteKey(row)}
                            onOpenDetails={() => openDetailForRow(resolveRow(row))}
                            onToggleBloqueioUsuario={toggleBloqueioUsuario}
                            onToggleLiberacaoAutomatica={toggleLiberacaoAutomatica}
                            onLiberarCarta={liberarCarta}
                            onOpenCartaForm={openCartaForm}
                            onCompartilharCarta={compartilharCarta}
                            onDeleteCarta={deleteCarta}
                          />
                        ) : (
                          <DataTableActionMenu
                            row={resolveRow(row)}
                            variant="full"
                            buttonVariant="ghost"
                            buttonClassName="text-xs bg-slate-700 text-white hover:bg-slate-800"
                            rowActions={[]}
                            enableDelete={enableDelete}
                            deleting={deletingKey === deleteKey(row)}
                            canLiberarCarta={canLiberarCarta}
                            onOpenDetails={() => openDetailForRow(resolveRow(row))}
                            onToggleBloqueioUsuario={toggleBloqueioUsuario}
                            onToggleLiberacaoAutomatica={toggleLiberacaoAutomatica}
                            onLiberarCarta={liberarCarta}
                            onOpenCartaForm={openCartaForm}
                            onCompartilharCarta={compartilharCarta}
                            onDeleteCarta={deleteCarta}
                          />
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

      <DataTableDetailDialog
        detailRow={detailRow}
        onOpenChange={() => setDetailRow(null)}
        columns={columns}
        detailFields={detailFields}
        detailsSource={detailsSource}
        isEmptyValue={isEmptyValue}
      />
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




