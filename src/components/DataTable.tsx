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
}

export function DataTable({
  data,
  columns,
  showDetails,
  hideEmptyColumns = true,
  detailFields,
  enableDelete = false,
  onDeleteSuccess,
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

  const openBlockForm = (row: Record<string, string>) => {
    const preacherName = (row.preacher_name || row.nome || "").trim();
    const url = preacherName
      ? `${BLOCK_FORM_BASE_URL}?usp=pp_url&${BLOCK_FORM_NAME_FIELD}=${encodeURIComponent(preacherName)}`
      : BLOCK_FORM_BASE_URL;
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
              <div key={i} className="rounded-md border bg-background p-3">
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
                {showDetails && (
                  <div className={`mt-3 grid gap-2 ${enableDelete ? "grid-cols-4" : "grid-cols-3"}`}>
                    <Button variant="outline" size="sm" onClick={() => setDetailRow(row)} className="w-full text-xs">
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openBlockForm(row)} className="w-full text-xs">
                      Bloquear
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => shareOnWhatsApp(row)} className="w-full text-xs">
                      <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
                    </Button>
                    {enableDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteCarta(row)}
                        disabled={deletingKey === deleteKey(row)}
                        className="w-full text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
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
                  <TableRow key={i}>
                    {visibleColumns.map((c) => (
                      <TableCell key={c.key} className="text-sm">
                        {c.render ? c.render(row) : (isEmptyValue(row[c.key]) ? EMPTY : row[c.key])}
                      </TableCell>
                    ))}
                    {showDetails && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailRow(row)} className="text-xs">
                            <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openBlockForm(row)} className="text-xs">
                            Bloquear
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => shareOnWhatsApp(row)} className="text-xs">
                            <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
                          </Button>
                          {enableDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCarta(row)}
                              disabled={deletingKey === deleteKey(row)}
                              className="text-xs text-rose-700 hover:text-rose-800"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> {deletingKey === deleteKey(row) ? "Excluindo..." : "Excluir"}
                            </Button>
                          )}
                        </div>
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
                : columns
                    .map((c) => ({ key: c.key, label: c.label }))
                    .filter(({ key }) => !isEmptyValue(detailRow[key]))
              ).map(({ key, label }) => {
                const value = detailRow[key];
                return (
                  <div key={key + label} className="flex gap-2 border-b pb-2 text-sm">
                    <span className="min-w-[140px] font-medium text-muted-foreground">{label}</span>
                    <span className="break-all text-foreground">
                      {value && (value.startsWith("http://") || value.startsWith("https://")) ? (
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
      const authorized = normalized === "sim";
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
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button
            variant="outline"
            size="sm"
            className="border-sky-200 bg-sky-50 text-xs text-sky-700 hover:bg-sky-100 hover:text-sky-800"
          >
            <ExternalLink className="mr-1 h-3 w-3" /> Abrir PDF
          </Button>
        </a>
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
