import { useState, useMemo } from "react";
import { useSheetData } from "@/hooks/useSheetData";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { MetricCards } from "@/components/MetricCards";
import { Filters, FilterValues, emptyFilters } from "@/components/Filters";
import { DataTable, CARTAS_COLUMNS, OBREIROS_COLUMNS } from "@/components/DataTable";
import { parseDate } from "@/lib/sheets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Users, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Index = () => {
  const { url, cartas, obreiros, loading, error, connected, connect, disconnect, hasObreiros, cartasSheetUsed, customSheetName, setCustomSheetName } = useSheetData();
  const [activeTab, setActiveTab] = useState("cartas");
  const [cartasFilters, setCartasFilters] = useState<FilterValues>(emptyFilters);
  const [obreirosFilters, setObreirosFilters] = useState<FilterValues>(emptyFilters);
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

  const filteredObreiros = useMemo(() => {
    return obreiros.filter((row) => {
      const f = obreirosFilters;
      if (f.search && !row.nome.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.igreja && row.igreja !== f.igreja) return false;
      if (f.campo && row.campo !== f.campo) return false;
      if (f.cargo && row.cargo !== f.cargo) return false;
      if (f.status && row.status !== f.status) return false;
      return true;
    });
  }, [obreiros, obreirosFilters]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Painel de Gestão</h1>
            <p className="text-xs text-muted-foreground">Cartas e Obreiros</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
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
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="cartas" className="gap-1.5">
                  <FileText className="h-4 w-4" /> Cartas ({filteredCartas.length})
                </TabsTrigger>
                {hasObreiros && (
                  <TabsTrigger value="obreiros" className="gap-1.5">
                    <Users className="h-4 w-4" /> Obreiros ({filteredObreiros.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="cartas" className="space-y-4 mt-4">
                <Filters
                  filters={cartasFilters}
                  onChange={setCartasFilters}
                  data={cartas}
                  igrejaKey="igreja_origem"
                  cargoKey="cargo"
                  statusKey="status"
                />
                <DataTable data={filteredCartas} columns={CARTAS_COLUMNS} hideEmptyColumns={false} />
              </TabsContent>

              {hasObreiros && (
                <TabsContent value="obreiros" className="space-y-4 mt-4">
                  <Filters
                    filters={obreirosFilters}
                    onChange={setObreirosFilters}
                    data={obreiros}
                    igrejaKey="igreja"
                    campoKey="campo"
                    cargoKey="cargo"
                    statusKey="status"
                  />
                  <DataTable data={filteredObreiros} columns={OBREIROS_COLUMNS} showDetails />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}

        {!connected && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-2">
              Conecte sua planilha
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Cole a URL de uma planilha Google Sheets publicada acima para visualizar os dados de cartas e obreiros.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
