import { parseDate } from "@/lib/sheets";
import { FileText, Users, CalendarDays, TrendingUp } from "lucide-react";

interface Props {
  cartas: Record<string, string>[];
  obreiros: Record<string, string>[];
}

export function MetricCards({ cartas, obreiros }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let cartasHoje = 0;
  let cartas7d = 0;

  cartas.forEach((row) => {
    const d = parseDate(row.data_emissao);
    if (!d) return;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) cartasHoje++;
    if (d >= sevenDaysAgo) cartas7d++;
  });

  // Count by cargo
  const cargoCounts: Record<string, number> = {};
  const cargoSource = obreiros.length > 0 ? obreiros : cartas;
  cargoSource.forEach((row) => {
    const cargo = row.cargo;
    if (cargo && cargo !== "â€”" && cargo !== "-" && cargo !== "—") {
      cargoCounts[cargo] = (cargoCounts[cargo] || 0) + 1;
    }
  });

  const metrics = [
    { label: "Total de Cartas", value: cartas.length, icon: FileText, cls: "metric-card-1" },
    { label: "Cartas Hoje", value: cartasHoje, icon: CalendarDays, cls: "metric-card-2" },
    { label: "Últimos 7 dias", value: cartas7d, icon: TrendingUp, cls: "metric-card-3" },
    { label: "Total de Obreiros", value: obreiros.length, icon: Users, cls: "metric-card-4" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className={`${m.cls} rounded-lg p-4 shadow-sm`}>
            <div className="mb-1 flex items-center gap-2 opacity-90">
              <m.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{m.label}</span>
            </div>
            <p className="text-2xl font-display font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {Object.keys(cargoCounts).length > 0 && (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-card-foreground">Por Cargo/Função</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(cargoCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([cargo, count]) => (
                <span
                  key={cargo}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {cargo}: <strong>{count}</strong>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
