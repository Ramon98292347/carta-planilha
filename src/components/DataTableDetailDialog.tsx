import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
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

  return (
    <Dialog open={!!detailRow} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-display">Detalhes do Registro</DialogTitle>
          <DialogDescription className="sr-only">Visualizacao detalhada dos campos do registro selecionado.</DialogDescription>
        </DialogHeader>
        {detailRow && (
          <div className="space-y-2">
            {resolvedFields.map(({ key, label }) => {
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
