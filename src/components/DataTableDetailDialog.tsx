import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Mail, MapPin, Phone, ShieldCheck, UserCircle2 } from "lucide-react";
import { EMPTY, isImageUrl } from "@/lib/dataTableHelpers";
import type { Column, DetailField } from "@/lib/dataTableTypes";

interface Props {
  detailRow: Record<string, string> | null;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  detailFields?: DetailField[];
  detailsSource?: "columns" | "all";
  isEmptyValue: (value?: string) => boolean;
}

export function DataTableDetailDialog({
  detailRow,
  onOpenChange,
  columns,
  detailFields,
  detailsSource = "columns",
  isEmptyValue,
}: Props) {
  const personName = detailRow ? String(detailRow.nome || detailRow.full_name || detailRow.name || "").trim() : "";
  const personPhone = detailRow ? String(detailRow.telefone || detailRow.phone || "").trim() : "";
  const personRole = detailRow ? String(detailRow.cargo || detailRow.minister_role || detailRow.role || "").trim() : "";
  const personEmail = detailRow ? String(detailRow.email || "").trim() : "";
  const personChurch = detailRow ? String(detailRow.igreja || detailRow.igreja_origem || detailRow.church_name || "").trim() : "";
  const personStatus = detailRow ? String(detailRow.status || detailRow.status_usuario || "").trim() : "";
  const hasPersonSummary = !!(personName || personPhone || personRole || personEmail || personChurch || personStatus);

  const resolvedFields = detailRow
    ? detailFields
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
        : columns.map((c) => ({ key: c.key, label: c.label })).filter(({ key }) => !isEmptyValue(detailRow[key]))
    : [];

  const hiddenSummaryKeys = new Set(["nome", "full_name", "name", "telefone", "phone", "cargo", "minister_role", "role", "email", "igreja", "igreja_origem", "church_name", "status", "status_usuario"]);
  const detailFieldsWithoutSummary = (
    hasPersonSummary ? resolvedFields.filter(({ key }) => !hiddenSummaryKeys.has(key)) : resolvedFields
  ).filter(({ key }) => {
    const value = detailRow?.[key];
    return !isEmptyValue(value);
  });

  return (
    <Dialog open={!!detailRow} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-display">Detalhes do Registro</DialogTitle>
          <DialogDescription className="sr-only">Visualizacao detalhada dos campos do registro selecionado.</DialogDescription>
        </DialogHeader>
        {detailRow && (
          <div className="space-y-4">
            {hasPersonSummary && (
              <div className="rounded-xl border bg-slate-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserCircle2 className="h-8 w-8" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{personName || "Obreiro"}</div>
                      {personRole ? <div className="text-sm text-muted-foreground">{personRole}</div> : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {personPhone ? (
                        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{personPhone}</span>
                        </div>
                      ) : null}
                      {personEmail ? (
                        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{personEmail}</span>
                        </div>
                      ) : null}
                      {personChurch ? (
                        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm sm:col-span-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{personChurch}</span>
                        </div>
                      ) : null}
                      {personStatus ? (
                        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm sm:col-span-2">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{personStatus}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {detailFieldsWithoutSummary.map(({ key, label }) => {
              const value = detailRow[key];
              return (
                <div key={key + label} className="flex gap-2 border-b pb-2 text-sm">
                  <span className="min-w-[140px] font-medium text-muted-foreground">{label}</span>
                  <span className="break-all text-foreground">
                    {value && isImageUrl(value, key) ? (
                      <div className="flex w-full flex-col gap-2">
                        <img src={value} alt={label} className="max-h-48 w-full rounded-md border object-cover" loading="lazy" />
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
  );
}
