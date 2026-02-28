import { useState, useMemo, useEffect, useRef } from "react";
import { useSheetData } from "@/hooks/useSheetData";
import { MetricCards } from "@/components/MetricCards";
import { Filters, FilterValues, emptyFilters } from "@/components/Filters";
import { DataTable, CARTAS_COLUMNS, OBREIROS_COLUMNS } from "@/components/DataTable";
import { parseDate } from "@/lib/sheets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Bell, CheckCircle2, Download, FileText, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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
  const { cartas, obreiros, loading, connected, connect, disconnect, customSheetName, notifications, clearNotifications } = useSheetData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("cartas");
  const [cartasFilters, setCartasFilters] = useState<FilterValues>(emptyFilters);
  const [deletedDocIds, setDeletedDocIds] = useState<Set<string>>(new Set());
  const didAutoConnect = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const churchName = (localStorage.getItem("church_name") || "").trim();
  const pastorName = (localStorage.getItem("pastor_name") || "").trim();
  const googleSheetUrl = (localStorage.getItem("google_sheet_url") || "").trim();
  const googleFormUrl = (localStorage.getItem("google_form_url") || "").trim();
  const googleBlockFormUrl = (localStorage.getItem("google_block_form_url") || "").trim();
  const needsAdminSetup = localStorage.getItem("needs_admin_setup") === "true";

  const fazerCartaUrl = googleFormUrl || googleSheetUrl;
  const connectedHeader = Boolean(churchName && pastorName && googleBlockFormUrl && fazerCartaUrl);

  useEffect(() => {
    if (didAutoConnect.current) return;
    if (!googleSheetUrl || connected || loading) return;
    didAutoConnect.current = true;
    connect(googleSheetUrl, customSheetName || undefined);
  }, [googleSheetUrl, connected, loading, connect, customSheetName]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const filteredCartas = useMemo(() => {
    return cartas.filter((row) => {
      if (deletedDocIds.has((row.doc_id || "").trim())) return false;

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
  }, [cartas, cartasFilters, deletedDocIds]);

  const cartasLookup = useMemo(() => {
    const normalizeName = (value: string) =>
      (value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ");
    const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");

    const byName = new Map<string, Record<string, string>>();
    const byPhone = new Map<string, Record<string, string>>();

    cartas.forEach((row) => {
      const nameKey = normalizeName(row.nome);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);

      const phoneKey = normalizePhone(row.telefone);
      if (phoneKey && !byPhone.has(phoneKey)) byPhone.set(phoneKey, row);
    });

    return { byName, byPhone, normalizeName, normalizePhone };
  }, [cartas]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Painel de Gestão</h1>
              <p className="text-xs text-muted-foreground">Cartas e Obreiros</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <div className="flex items-center gap-2">
              <div className="rounded-md border px-2 py-1 text-xs text-muted-foreground" title={connectedHeader ? "Conectado" : "Configuração incompleta"}>
                <div>Igreja: {churchName || "—"}</div>
                <div>Pastor: {pastorName || "—"}</div>
              </div>
              <div className="flex h-full items-center" title={connectedHeader ? "Conectado" : "Configuração incompleta"}>
                {connectedHeader ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {installPrompt && (
                <Button type="button" variant="outline" onClick={handleInstall} className="gap-1">
                  <Download className="h-4 w-4" /> Instalar app
                </Button>
              )}
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="relative h-9 w-9 p-0">
                      <Bell className="h-4 w-4" />
                      {notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                          {notifications.length}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Notificacoes</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notifications.length === 0 ? (
                      <DropdownMenuItem className="text-muted-foreground">Sem notificacoes</DropdownMenuItem>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1">
                          <span className="text-xs font-semibold">{n.title}</span>
                          <span className="text-xs text-muted-foreground">{n.body}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearNotifications} className="text-xs text-rose-700">
                      Limpar notificacoes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    disconnect();
                    [
                      "session_key",
                      "clientId",
                      "church_name",
                      "pastor_name",
                      "google_sheet_url",
                      "google_form_url",
                      "google_block_form_url",
                      "needs_admin_setup",
                      "DELETE_API_URL",
                      "DELETE_API_KEY",
                      "sheets_dashboard_url",
                    ].forEach((k) => localStorage.removeItem(k));
                    navigate("/login", { replace: true });
                  }}
                  className="gap-1"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        {needsAdminSetup && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Aguardando configuração do administrador (links ainda não cadastrados).
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Carregando dados...</span>
          </div>
        )}

        {connected && !loading && (
          <>
            <MetricCards cartas={filteredCartas} obreiros={obreiros} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max w-full sm:w-auto">
                  <TabsTrigger value="cartas" className="gap-1.5">
                    <FileText className="h-4 w-4" /> Cartas ({filteredCartas.length})
                  </TabsTrigger>
                  <TabsTrigger value="obreiros" className="gap-1.5">
                    Obreiros ({obreiros.length})
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
                  enableDelete
                  onDeleteSuccess={(row) => {
                    setDeletedDocIds((prev) => {
                      const next = new Set(prev);
                      next.add((row.doc_id || "").trim());
                      return next;
                    });
                  }}
                />
              </TabsContent>

              <TabsContent value="obreiros" className="mt-4 space-y-4">
                <DataTable
                  data={obreiros}
                  columns={OBREIROS_COLUMNS}
                  hideEmptyColumns
                  showDetails
                  detailFields={CARTAS_DETAIL_FIELDS}
                  actionsVariant="detailsOnly"
                  highlightStatus={false}
                  detailRowResolver={(row) => {
                    const phoneKey = cartasLookup.normalizePhone(row.telefone);
                    if (phoneKey) {
                      const hit = cartasLookup.byPhone.get(phoneKey);
                      if (hit) return hit;
                    }
                    const nameKey = cartasLookup.normalizeName(row.nome);
                    return cartasLookup.byName.get(nameKey) ?? row;
                  }}
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
            <h2 className="mb-2 text-lg font-display font-semibold text-foreground">Conectando planilha...</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Se a conexão não abrir automaticamente, verifique o link da planilha cadastrado no login.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
