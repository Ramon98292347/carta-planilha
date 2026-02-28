import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Share2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, parseDate } from "@/lib/sheets";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 25;
const EMPTY = "\u2014";
const BLOCK_FORM_BASE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfVxO25I8fXlTHyGy5QHPgAB2aA-1vwRy2jnXfCrH3pj14h-g/viewform";
const BLOCK_FORM_NAME_FIELD = "entry.1208647889";
const BLOCK_FORM_STATUS_FIELD = "entry.1791445451";

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
}: Props) {
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<Record<string, string> | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isEmptyValue = (value?: string) => !value || value === "-" || value === "â€”" || value === EMPTY;

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

  const openCartaForm = () => {
    const googleFormUrl = (localStorage.getItem("google_form_url") || "").trim();
    const googleSheetUrl = (localStorage.getItem("google_sheet_url") || "").trim();
    const target = googleFormUrl || googleSheetUrl;
    if (!target) {
      toast.error("Link de carta não configurado.");
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const isBlocked = (row: Record<string, string>) => {
    const value = (row.status ?? row["__col_Z"] ?? row.Z ?? "").trim().toLowerCase();
    if (!value) return false;
    if (["sim", "autorizado"].includes(value)) return false;
    if (["nao", "não", "bloqueado"].includes(value)) return true;
    return value !== "sim";
  };

  const shouldHighlightBlocked = (row: Record<string, string>) => highlightStatus && isBlocked(row);

  const isImageUrl = (value: string, key?: string) => {
    const v = (value || "").trim();
    if (!v || !/^https?:\/\//i.test(v)) return false;
    if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(v)) return true;
    if (key && /(foto|imagem|image|photo)/i.test(key)) return true;
    return false;
  };

  const openBlockForm = (row: Record<string, string>) => {
    const preacherName = (row.preacher_name || row.nome || "").trim();
    const statusValue = isBlocked(row) ? "AUTORIZADO" : "BLOQUEADO";
    const params = new URLSearchParams();
    params.set("usp", "pp_url");
    if (preacherName) params.set(BLOCK_FORM_NAME_FIELD, preacherName);
    params.set(BLOCK_FORM_STATUS_FIELD, statusValue);
    const url = `${BLOCK_FORM_BASE_URL}?${params.toString()}`;
    window.open(url, "_blank");
  };

  const deleteKey = (row: Record<string, string>) =>
    [row.doc_id, row.url_pdf, row.data_emissao, row.nome].map((v) => (v || "").trim()).join("|").toLowerCase();

  const deleteCarta = async (row: Record<string, string>) => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    const docId = (row.doc_id || "").trim();
    const docUrl = (row.doc_url || row.url_pdf || "").trim();
    const pdfUrl = (row.pdf_url || row.url_pdf || "").trim();

    if (!clientId || !docId) {
      toast.error("Não foi possível excluir. Tente novamente.");
      return;
    }

    const confirmDelete = window.confirm("Tem certeza que deseja excluir esta carta?");
    if (!confirmDelete) return;

    const rowKey = deleteKey(row);
    setDeletingKey(rowKey);

    try {
      const { data, error } = await supabase.functions.invoke("delete-carta", {
        body: { clientId, docId, docUrl, pdfUrl },
      });

      if (error || !data || (data as any).ok !== true) {
        toast.error("Não foi possível excluir. Tente novamente.");
        return;
      }

      toast.success("Carta excluída com sucesso.");
      onDeleteSuccess?.(row);
    } catch {
      toast.error("Não foi possível excluir. Tente novamente.");
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
                    ? shouldHighlightBlocked(row)
                      ? "border-rose-800 bg-rose-300/70 animate-pulse"
                      : "border-emerald-400 bg-emerald-50"
                    : "border-border bg-background"
                }`}
              >
                <div className="space-y-2">
                  {visibleColumns.map((c) => (
                    <div key={c.key} className="grid grid-cols-[110px_1fr] gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">{c.label}</span>
                      <span className="break-words text-foreground">
                        {c.render ? c.render(row) : (isEmptyValue(row[c.key]) ? EMPTY : row[c.key])}
                      </span>
                    </div>
                  ))}
                </div>
                {showDetails && actionsVariant === "detailsOnly" && (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(row) : row)}
                      disabled={shouldHighlightBlocked(row)}
                      className="w-full text-xs border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                    </Button>
                  </div>
                )}
                {showDetails && actionsVariant === "full" && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(row) : row)}
                      disabled={shouldHighlightBlocked(row)}
                      className="w-full text-xs"
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBlockForm(row)}
                      className={`w-full text-xs ${
                        isBlocked(row)
                          ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
                      }`}
                    >
                      {isBlocked(row) ? "Autorizar" : "Bloquear"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCartaForm()}
                      disabled={shouldHighlightBlocked(row)}
                      className="w-full text-xs border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Carta
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareOnWhatsApp(row)}
                      disabled={shouldHighlightBlocked(row)}
                      className="w-full text-xs border-orange-600 bg-orange-600 text-white hover:bg-orange-700"
                    >
                      <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = row.url_pdf;
                        if (!url || isEmptyValue(url)) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                      disabled={shouldHighlightBlocked(row) || !row.url_pdf || isEmptyValue(row.url_pdf)}
                      className="w-full text-xs border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> PDF
                    </Button>
                    {enableDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteCarta(row)}
                        disabled={deletingKey === deleteKey(row)}
                        className="w-full text-xs border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> {deletingKey === deleteKey(row) ? "Excluindo..." : "Excluir"}
                      </Button>
                    )}
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
                {visibleColumns.map((c) => (
                  <TableHead key={c.key} className="whitespace-nowrap text-xs font-semibold">
                    {c.label}
                  </TableHead>
                ))}
                {showDetails && <TableHead className="w-20 text-xs font-semibold">Ações</TableHead>}
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
                        ? shouldHighlightBlocked(row)
                          ? "bg-rose-300/60 animate-pulse"
                          : "bg-emerald-50/60"
                        : ""
                    }
                  >
                    {visibleColumns.map((c) => (
                      <TableCell key={c.key} className="text-sm">
                        {c.render ? c.render(row) : (isEmptyValue(row[c.key]) ? EMPTY : row[c.key])}
                      </TableCell>
                    ))}
                    {showDetails && (
                      <TableCell>
                        {actionsVariant === "detailsOnly" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(row) : row)}
                            className="text-xs bg-sky-600 text-white hover:bg-sky-700"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailRow(detailRowResolver ? detailRowResolver(row) : row)}
                              disabled={shouldHighlightBlocked(row)}
                              className="text-xs bg-sky-600 text-white hover:bg-sky-700"
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openBlockForm(row)}
                              className={`text-xs ${isBlocked(row) ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-rose-600 text-white hover:bg-rose-700"}`}
                            >
                              {isBlocked(row) ? "Autorizar" : "Bloquear"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => shareOnWhatsApp(row)}
                              disabled={shouldHighlightBlocked(row)}
                              className="text-xs bg-orange-600 text-white hover:bg-orange-700"
                            >
                              <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCartaForm()}
                              disabled={shouldHighlightBlocked(row)}
                              className="text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                              Carta
                            </Button>
                            {enableDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteCarta(row)}
                                disabled={deletingKey === deleteKey(row)}
                                className="text-xs bg-rose-600 text-white hover:bg-rose-700"
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> {deletingKey === deleteKey(row) ? "Excluindo..." : "Excluir"}
                              </Button>
                            )}
                          </div>
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
              {data.length} registro{data.length !== 1 ? "s" : ""} · Página {page + 1} de {totalPages}
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
  { key: "data_pregacao", label: "Dia da pregação", render: (r) => formatDate(parseDate(r.data_pregacao)) || EMPTY },
  { key: "igreja_origem", label: "Igreja origem" },
  { key: "igreja_destino", label: "Igreja destino" },
  {
    key: "status",
    label: "Status",
    render: (r) => {
      const value = r.status ?? r["__col_Z"] ?? r.Z ?? "-";
      if (!value || value === "-" || value === "â€”") return EMPTY;

      const normalized = value.trim().toLowerCase();
      const authorized = ["sim", "autorizado"].includes(normalized);
      const reason = r.motivo_bloqueio && r.motivo_bloqueio !== "-" && r.motivo_bloqueio !== "â€”" ? r.motivo_bloqueio : "";

      return (
        <div className="space-y-1">
          <Badge
            className={
              authorized
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50"
            }
            variant="outline"
          >
            {authorized ? "Autorizado" : "Bloqueado"}
          </Badge>
          {!authorized && reason && (
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
      const url = r.url_pdf;
      if (!url || url === "-" || url === "â€”") return EMPTY;
      const statusValue = (r.status ?? r["__col_Z"] ?? r.Z ?? "").trim().toLowerCase();
      const blocked = !!statusValue && statusValue !== "sim";
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={blocked}
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          className="border-emerald-600 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
        >
          <ExternalLink className="mr-1 h-3 w-3" /> Abrir PDF
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
  { key: "data_ordenacao", label: "Data Ordenação", render: (r) => formatDate(parseDate(r.data_ordenacao)) },
  { key: "data_batismo", label: "Data Batismo", render: (r) => formatDate(parseDate(r.data_batismo)) },
];
