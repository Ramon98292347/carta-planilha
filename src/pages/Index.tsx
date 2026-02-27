import { useState, useMemo } from "react";
import { useSheetData } from "@/hooks/useSheetData";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { MetricCards } from "@/components/MetricCards";
import { Filters, FilterValues, emptyFilters } from "@/components/Filters";
import { DataTable, CARTAS_COLUMNS, OBREIROS_COLUMNS } from "@/components/DataTable";
import { parseDate } from "@/lib/sheets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CARTAS_DETAIL_FIELDS = [
  { key: "regiao", label: "Qual região Pertence" },
  { key: "igreja_origem", label: "Qual Igreja Você Pertence?" },
  { key: "nome", label: "Nome completo" },
  { key: "telefone", label: "Telefone" },
  { key: "data_pregacao", label: "Data da pregação" },
  { key: "data_ordenacao", label: "Data da Ordenação" },
  { key: "funcao", label: "Função Ministerial ?" },
  { key: "ipda_destino", label: "Igreja Destino" },
  { key: "igreja_destino", label: "Qual Igreja você está indo pregar?" },
];

const Index = () => {
  const { url, cartas, obreiros, loading, error, connected, connect, disconnect, hasObreiros, cartasSheetUsed, customSheetName, setCustomSheetName } = useSheetData();
  const [activeTab, setActiveTab] = useState("cartas");
  const [cartasFilters, setCartasFilters] = useState<FilterValues>(emptyFilters);
  const [formUrl, setFormUrl] = useState(() => localStorage.getItem("bloqueio_form_url") || "");
  const [formInput, setFormInput] = useState(() => localStorage.getItem("bloqueio_form_url") || "");
  const [showFormConfig, setShowFormConfig] = useState(false);

  const filteredCartas = useMemo(() => {
    return cartas.filter((row) => {
      const f = cartasFilters;
      if (f.search && !row.nome.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.igreja && row.igreja_origem !== f.igreja) return false;
      if (f.cargo && row.cargo !== f.cargo) return false;
      if (f.status && row.status !== f.status) return false;
      if (f.dateStart || f.dateEnd) {
        const d = parseDate(row.data_emissao);
        if (!d) return false;
        if (f.dateStart && d < f.dateStart) return false;
        if (f.dateEnd) {
          const end = new Date(f.dateEnd);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }
      return true;
    });
  }, [cartas, cartasFilters]);

  const filteredObreiros = obreiros;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Painel de Gestão</h1>
            <p className="text-xs text-muted-foreground">Cartas e Obreiros</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        <ConnectionPanel
          url={url}
          connected={connected}
          loading={loading}
          error={error}
          cartasSheetUsed={cartasSheetUsed}
          customSheetName={customSheetName}
          onCustomSheetNameChange={setCustomSheetName}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Carregando dados...</span>
          </div>
        )}

        {connected && !loading && (
          <>
            <MetricCards cartas={filteredCartas} obreiros={filteredObreiros} />

            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Formulário de Bloqueio</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure a URL do formulário de bloqueio. Quando conectado, o botão abre o formulário.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={
                      formUrl
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : ""
                    }
                    onClick={() => {
                      if (formUrl) {
                        window.open(formUrl, "_blank", "noopener,noreferrer");
                        return;
                      }
                      setShowFormConfig((v) => !v);
                    }}
                  >
                    <Link2 className="mr-1 h-4 w-4" />
                    {formUrl ? "Logado no formulário" : "Configurar formulário"}
                  </Button>
                  {formUrl && (
                    <Button type="button" variant="ghost" onClick={() => setShowFormConfig((v) => !v)}>
                      Editar URL
                    </Button>
                  )}
                </div>
              </div>

              {showFormConfig && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={formInput}
                    onChange={(e) => setFormInput(e.target.value)}
                    placeholder="Cole a URL do formulário de bloqueio..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    disabled={!formInput.trim()}
                    onClick={() => {
                      const next = formInput.trim();
                      setFormUrl(next);
                      localStorage.setItem("bloqueio_form_url", next);
                      setShowFormConfig(false);
                    }}
                  >
                    Salvar
                  </Button>
                </div>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max w-full sm:w-auto">
                <TabsTrigger value="cartas" className="gap-1.5">
                  <FileText className="h-4 w-4" /> Cartas ({filteredCartas.length})
                </TabsTrigger>
              </TabsList>
              </div>

              <TabsContent value="cartas" className="mt-4 space-y-4">
                <Filters
                  filters={cartasFilters}
                  onChange={setCartasFilters}
                  data={cartas}
                  igrejaKey="igreja_origem"
                  cargoKey="cargo"
                  statusKey="status"
                />
                <DataTable
                  data={filteredCartas}
                  columns={CARTAS_COLUMNS}
                  hideEmptyColumns={false}
                  showDetails
                  detailFields={CARTAS_DETAIL_FIELDS}
                />
              </TabsContent>

            </Tabs>
          </>
        )}

        {!connected && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-lg font-display font-semibold text-foreground">Conecte sua planilha</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Cole a URL de uma planilha Google Sheets publicada acima para visualizar os dados de cartas e obreiros.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
