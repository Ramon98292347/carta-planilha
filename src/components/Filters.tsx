import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Filter, Search, Sparkles, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface FilterValues {
  dateStart: Date | undefined;
  dateEnd: Date | undefined;
  igreja: string;
  campo: string;
  cargo: string;
  status: string;
  search: string;
}

export const emptyFilters: FilterValues = {
  dateStart: undefined,
  dateEnd: undefined,
  igreja: "",
  campo: "",
  cargo: "",
  status: "",
  search: "",
};

interface Props {
  filters: FilterValues;
  onChange: (f: FilterValues) => void;
  data: Record<string, string>[];
  igrejaKey: string;
  campoKey?: string;
  cargoKey: string;
  statusKey: string;
}

export function Filters({ filters, onChange, data, igrejaKey, campoKey, cargoKey, statusKey }: Props) {
  const uniqueValues = useMemo(() => {
    const igrejas = new Set<string>();
    const campos = new Set<string>();
    const cargos = new Set<string>();
    const statuses = new Set<string>();

    data.forEach((row) => {
      const i = row[igrejaKey];
      if (campoKey) {
        const c = row[campoKey];
        if (c && c !== "—") campos.add(c);
      }
      const cr = row[cargoKey];
      const s = row[statusKey];
      if (i && i !== "—") igrejas.add(i);
      if (cr && cr !== "—") cargos.add(cr);
      if (s && s !== "—") statuses.add(s);
    });

    return {
      igrejas: Array.from(igrejas).sort(),
      campos: Array.from(campos).sort(),
      cargos: Array.from(cargos).sort(),
      statuses: Array.from(statuses).sort(),
    };
  }, [data, igrejaKey, campoKey, cargoKey, statusKey]);

  const set = (key: keyof FilterValues, value: any) => onChange({ ...filters, [key]: value });

  const hasFilters = Boolean(
    filters.dateStart ||
      filters.dateEnd ||
      filters.igreja ||
      filters.campo ||
      filters.cargo ||
      filters.status ||
      filters.search
  );

  const activeCount = [
    filters.dateStart,
    filters.dateEnd,
    filters.igreja,
    filters.campo,
    filters.cargo,
    filters.status,
    filters.search,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 rounded-2xl border border-border/90 bg-gradient-to-br from-card via-card to-muted/30 p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-background/80">
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-card-foreground">Filtros</h3>
            {activeCount > 0 && (
              <Badge variant="secondary" className="rounded-full px-2.5">
                {activeCount} ativo{activeCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden rounded-full text-xs sm:inline-flex">
            <Sparkles className="mr-1 h-3 w-3" />
            Busca rápida
          </Badge>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)} className="rounded-full text-xs text-muted-foreground">
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-10 justify-start rounded-xl border-border/90 bg-background text-left text-sm font-normal",
                !filters.dateStart && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              {filters.dateStart ? format(filters.dateStart, "dd/MM/yyyy") : "Data início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filters.dateStart} onSelect={(d) => set("dateStart", d)} locale={ptBR} className="pointer-events-auto p-3" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-10 justify-start rounded-xl border-border/90 bg-background text-left text-sm font-normal",
                !filters.dateEnd && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              {filters.dateEnd ? format(filters.dateEnd, "dd/MM/yyyy") : "Data fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filters.dateEnd} onSelect={(d) => set("dateEnd", d)} locale={ptBR} className="pointer-events-auto p-3" />
          </PopoverContent>
        </Popover>

        {uniqueValues.igrejas.length > 0 && (
          <Select value={filters.igreja} onValueChange={(v) => set("igreja", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-10 rounded-xl border-border/90 bg-background text-sm"><SelectValue placeholder="Igreja" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {uniqueValues.igrejas.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {uniqueValues.campos.length > 0 && (
          <Select value={filters.campo} onValueChange={(v) => set("campo", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-10 rounded-xl border-border/90 bg-background text-sm"><SelectValue placeholder="Campo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {uniqueValues.campos.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {uniqueValues.cargos.length > 0 && (
          <Select value={filters.cargo} onValueChange={(v) => set("cargo", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-10 rounded-xl border-border/90 bg-background text-sm"><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {uniqueValues.cargos.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {uniqueValues.statuses.length > 0 && (
          <Select value={filters.status} onValueChange={(v) => set("status", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-10 rounded-xl border-border/90 bg-background text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {uniqueValues.statuses.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className="h-10 rounded-xl border-border/90 bg-background pl-9 text-sm"
        />
      </div>
    </div>
  );
}

