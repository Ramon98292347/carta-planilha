import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FileText, Loader2, LogOut, RefreshCw, Save, TrendingUp, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const CACHE_REFRESH_MS = 30000;

type ObreiroProfile = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  status: string;
  status_carta: string;
  data_nascimento: string;
  data_ordenacao: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type CartaRow = Record<string, string>;

const emptyProfile: ObreiroProfile = {
  id: "",
  nome: "",
  telefone: "",
  email: "",
  status: "",
  status_carta: "",
  data_nascimento: "",
  data_ordenacao: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");

const isBlockedStatusValue = (value: string) => String(value || "").trim().toUpperCase() === "BLOQUEADO";

const getCartaStatus = (row: CartaRow, profile: ObreiroProfile) => {
  const statusUsuario = String(profile.status || row.status_usuario || row["Status Usuario"] || "").trim().toUpperCase();
  const statusCarta = String(row.status_carta || row.statusCarta || row["Status Carta"] || "").trim().toUpperCase();
  const envio = String(row.envio || row["Envio"] || "").trim().toUpperCase();
  const driveStatus = String(row.drive_status || row.driveStatus || row["Drive Status"] || "").trim().toUpperCase();
  const statusCartaOperacional = String(profile.status_carta || "").trim().toUpperCase();

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (driveStatus === "CARTA_ENVIADA") return "Carta enviada";
  if (envio === "ENVIADO") return "Carta enviada";
  if (statusCartaOperacional === "LIBERADA") return "Liberacao automatica";
  if (statusCarta === "LIBERADA") return "Carta liberada";
  return "Aguardando liberacao";
};

const getCartaStatusClass = (label: string) => {
  if (label === "Bloqueado") return "border-rose-200 bg-rose-50 text-rose-700";
  if (label === "Aguardando liberacao") return "border-orange-200 bg-orange-50 text-orange-700";
  if (label === "Liberacao automatica") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const formatDisplayDate = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return raw;
};

export default function Obreiro() {
  const navigate = useNavigate();
  const clientId = (localStorage.getItem("clientId") || "").trim();
  const phone = normalizePhone(localStorage.getItem("obreiro_telefone") || "");
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const pastorName = (localStorage.getItem("pastor_name") || "").trim();
  const googleFormUrl = (localStorage.getItem("google_form_url") || "").trim();

  const [profile, setProfile] = useState<ObreiroProfile>(() => ({
    ...emptyProfile,
    nome: (localStorage.getItem("obreiro_nome") || "").trim(),
    telefone: phone,
    email: (localStorage.getItem("obreiro_email") || "").trim(),
    status: (localStorage.getItem("obreiro_status") || "").trim(),
    data_nascimento: (localStorage.getItem("obreiro_data_nascimento") || "").trim(),
    data_ordenacao: (localStorage.getItem("obreiro_data_ordenacao") || "").trim(),
    cep: (localStorage.getItem("obreiro_cep") || "").trim(),
    endereco: (localStorage.getItem("obreiro_endereco") || "").trim(),
    numero: (localStorage.getItem("obreiro_numero") || "").trim(),
    complemento: (localStorage.getItem("obreiro_complemento") || "").trim(),
    bairro: (localStorage.getItem("obreiro_bairro") || "").trim(),
    cidade: (localStorage.getItem("obreiro_cidade") || "").trim(),
    uf: (localStorage.getItem("obreiro_uf") || "").trim(),
  }));
  const [cards, setCards] = useState<CartaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const blocked = useMemo(() => isBlockedStatusValue(profile.status), [profile.status]);

  const loadProfile = async () => {
    if (!clientId || !phone || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({
      select: "id,nome,telefone,email,status,status_carta,data_nascimento,data_ordenacao,cep,endereco,numero,complemento,bairro,cidade,uf",
      limit: "1",
    });
    params.set("client_id", `eq.${clientId}`);
    params.set("telefone", `eq.${phone}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${params.toString()}`, {
      headers: getSupabaseHeaders({ json: false }),
    });
    if (!response.ok) return;

    const payload = (await response.json().catch(() => [])) as Array<Record<string, string | null>>;
    const row = payload?.[0];
    if (!row) return;

    const nextProfile: ObreiroProfile = {
      id: String(row.id || "").trim(),
      nome: String(row.nome || "").trim(),
      telefone: normalizePhone(String(row.telefone || "")),
      email: String(row.email || "").trim(),
      status: String(row.status || "").trim(),
      status_carta: String(row.status_carta || "").trim(),
      data_nascimento: String(row.data_nascimento || "").trim(),
      data_ordenacao: String(row.data_ordenacao || "").trim(),
      cep: String(row.cep || "").trim(),
      endereco: String(row.endereco || "").trim(),
      numero: String(row.numero || "").trim(),
      complemento: String(row.complemento || "").trim(),
      bairro: String(row.bairro || "").trim(),
      cidade: String(row.cidade || "").trim(),
      uf: String(row.uf || "").trim(),
    };

    setProfile(nextProfile);
    localStorage.setItem("obreiro_nome", nextProfile.nome || "");
    localStorage.setItem("obreiro_telefone", nextProfile.telefone || "");
    localStorage.setItem("obreiro_status", nextProfile.status || "");
    localStorage.setItem("obreiro_email", nextProfile.email || "");
    localStorage.setItem("obreiro_data_nascimento", nextProfile.data_nascimento || "");
    localStorage.setItem("obreiro_data_ordenacao", nextProfile.data_ordenacao || "");
    localStorage.setItem("obreiro_cep", nextProfile.cep || "");
    localStorage.setItem("obreiro_endereco", nextProfile.endereco || "");
    localStorage.setItem("obreiro_numero", nextProfile.numero || "");
    localStorage.setItem("obreiro_complemento", nextProfile.complemento || "");
    localStorage.setItem("obreiro_bairro", nextProfile.bairro || "");
    localStorage.setItem("obreiro_cidade", nextProfile.cidade || "");
    localStorage.setItem("obreiro_uf", nextProfile.uf || "");
  };

  const loadCards = async () => {
    if (!clientId || !phone || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({ select: "last_15_cards", limit: "1" });
    params.set("client_id", `eq.${clientId}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/client_cache?${params.toString()}`, {
      headers: getSupabaseHeaders({ json: false }),
    });
    if (!response.ok) return;

    const payload = (await response.json().catch(() => [])) as Array<{ last_15_cards?: CartaRow[] }>;
    const rows = Array.isArray(payload?.[0]?.last_15_cards) ? payload[0].last_15_cards || [] : [];
    setCards(rows.filter((row) => normalizePhone(String(row.telefone || row.phone || "")) === phone));
  };

  const refreshPage = async () => {
    setLoading(true);
    try {
      await Promise.all([loadProfile(), loadCards()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshPage();
  }, [clientId, phone]);

  useEffect(() => {
    if (!clientId || !phone) return;
    const id = window.setInterval(() => {
      void Promise.all([loadProfile(), loadCards()]);
    }, CACHE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [clientId, phone, profile.status_carta]);

  const stats = useMemo(() => {
    const labels = cards.map((row) => getCartaStatus(row, profile));
    return {
      total: cards.length,
      enviadas: labels.filter((item) => item === "Carta enviada").length,
      liberadas: labels.filter((item) => item === "Carta liberada").length,
      automaticas: labels.filter((item) => item === "Liberacao automatica").length,
      aguardando: labels.filter((item) => item === "Aguardando liberacao").length,
    };
  }, [cards, profile]);

  const handleProfileChange = (field: keyof ObreiroProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    if (!clientId || !phone || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Sessao do obreiro nao encontrada.");
      return;
    }

    setSaving(true);
    try {
      const params = new URLSearchParams({ select: "id", limit: "1" });
      params.set("client_id", `eq.${clientId}`);
      params.set("telefone", `eq.${phone}`);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${params.toString()}`, {
        headers: getSupabaseHeaders({ json: false }),
      });

      if (!response.ok) {
        throw new Error("Nao foi possivel localizar o cadastro do obreiro.");
      }

      const payload = (await response.json().catch(() => [])) as Array<{ id?: string }>;
      const id = String(payload?.[0]?.id || profile.id || "").trim();
      if (!id) {
        throw new Error("Cadastro do obreiro nao encontrado.");
      }

      const updateParams = new URLSearchParams({ select: "id" });
      updateParams.set("id", `eq.${id}`);

      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/obreiros_auth?${updateParams.toString()}`, {
        method: "PATCH",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          nome: profile.nome.trim() || null,
          email: profile.email.trim() || null,
          data_nascimento: profile.data_nascimento.trim() || null,
          data_ordenacao: profile.data_ordenacao.trim() || null,
          cep: profile.cep.trim() || null,
          endereco: profile.endereco.trim() || null,
          numero: profile.numero.trim() || null,
          complemento: profile.complemento.trim() || null,
          bairro: profile.bairro.trim() || null,
          cidade: profile.cidade.trim() || null,
          uf: profile.uf.trim() || null,
        }),
      });

      if (!updateRes.ok) {
        throw new Error("Nao foi possivel atualizar o cadastro.");
      }

      toast.success("Cadastro atualizado com sucesso.");
      await loadProfile();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar o cadastro.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    [
      "session_key",
      "clientId",
      "church_name",
      "pastor_name",
      "google_sheet_url",
      "google_form_url",
      "google_block_form_url",
      "google_form_url_folder",
      "needs_admin_setup",
      "sheets_dashboard_url",
      "user_role",
      "obreiro_nome",
      "obreiro_telefone",
      "obreiro_status",
      "obreiro_email",
      "obreiro_data_nascimento",
      "obreiro_data_ordenacao",
      "obreiro_cep",
      "obreiro_endereco",
      "obreiro_numero",
      "obreiro_complemento",
      "obreiro_bairro",
      "obreiro_cidade",
      "obreiro_uf",
    ].forEach((k) => localStorage.removeItem(k));
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Area do Obreiro</h1>
              <p className="text-xs text-muted-foreground">Dashboard, cartas e cadastro</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshPage()} className="gap-1" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
            </Button>
            <Button type="button" variant="outline" onClick={handleLogout} className="gap-1">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        <Card className={blocked ? "border-rose-300 bg-rose-50 shadow-sm" : "border-emerald-300 bg-emerald-50 shadow-sm"}>
          <CardHeader>
            <CardTitle className="text-xl">{profile.nome || "Obreiro"}</CardTitle>
            <CardDescription>
              Igreja: {churchName || "-"} | Pastor: {pastorName || "-"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={blocked ? "border-rose-300 bg-rose-100 text-rose-700" : "border-emerald-300 bg-emerald-100 text-emerald-700"}>
                {profile.status || "AUTORIZADO"}
              </Badge>
              {String(profile.status_carta || "").trim().toUpperCase() === "LIBERADA" && (
                <Badge variant="outline" className="border-sky-300 bg-sky-100 text-sky-700">
                  Liberacao automatica
                </Badge>
              )}
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>Total de cartas: <strong>{stats.total}</strong></div>
              <div>Aguardando: <strong>{stats.aguardando}</strong></div>
              <div>Liberadas: <strong>{stats.liberadas + stats.automaticas}</strong></div>
              <div>Enviadas: <strong>{stats.enviadas}</strong></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => googleFormUrl && window.open(googleFormUrl, "_blank", "noopener,noreferrer")}
                disabled={!googleFormUrl || blocked}
              >
                Fazer carta
              </Button>
              {blocked && <span className="text-sm text-rose-700">Seu acesso esta bloqueado. Procure o pastor.</span>}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Cartas", value: stats.total, icon: FileText, cls: "metric-card-1" },
            { label: "Aguardando", value: stats.aguardando, icon: CalendarDays, cls: "metric-card-2" },
            { label: "Liberacao automatica", value: stats.automaticas, icon: TrendingUp, cls: "metric-card-3" },
            { label: "Cadastro", value: profile.nome ? 1 : 0, icon: UserCircle2, cls: "metric-card-4" },
          ].map((item) => (
            <div key={item.label} className={`${item.cls} rounded-lg p-4 shadow-sm`}>
              <div className="mb-1 flex items-center gap-2 opacity-90">
                <item.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{item.label}</span>
              </div>
              <p className="text-2xl font-display font-bold">{item.value}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="movimentos" className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max w-full sm:w-auto">
              <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
              <TabsTrigger value="cadastro">Meu cadastro</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="movimentos" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Minhas cartas</CardTitle>
                <CardDescription>As cartas sao filtradas pelo seu client_id e telefone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhuma carta encontrada para este obreiro.</div>
                ) : (
                  cards.map((row, index) => {
                    const statusLabel = getCartaStatus(row, profile);
                    const pdfUrl = String(row.url_pdf || row.pdfUrl || row.doc_url || "").trim();
                    return (
                      <div key={`${row.doc_id || row.nome || "carta"}-${index}`} className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1 text-sm">
                            <div className="font-medium text-foreground">{row.igreja_destino || row.ipda_destino || "Destino nao informado"}</div>
                            <div className="text-muted-foreground">Origem: {row.igreja_origem || "-"}</div>
                            <div className="text-muted-foreground">Data da pregacao: {formatDisplayDate(row.data_pregacao || row["Data da pregação."] || "-")}</div>
                            <div className="text-muted-foreground">Emissao: {formatDisplayDate(row.data_emissao || row["Carimbo de data/hora"] || "-")}</div>
                          </div>
                          <div className="flex flex-col items-start gap-2 md:items-end">
                            <Badge variant="outline" className={getCartaStatusClass(statusLabel)}>
                              {statusLabel}
                            </Badge>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => pdfUrl && window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                                disabled={!pdfUrl}
                              >
                                Abrir PDF
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cadastro">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Meu cadastro</CardTitle>
                <CardDescription>Atualize seus dados. O telefone continua sendo sua identificacao de acesso.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={profile.nome} onChange={(e) => handleProfileChange("nome", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" value={profile.telefone} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={profile.email} onChange={(e) => handleProfileChange("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_nascimento">Data de nascimento</Label>
                  <Input id="data_nascimento" type="date" value={profile.data_nascimento} onChange={(e) => handleProfileChange("data_nascimento", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_ordenacao">Data da ordenacao</Label>
                  <Input id="data_ordenacao" type="date" value={profile.data_ordenacao} onChange={(e) => handleProfileChange("data_ordenacao", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input id="cep" value={profile.cep} onChange={(e) => handleProfileChange("cep", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="endereco">Endereco</Label>
                  <Input id="endereco" value={profile.endereco} onChange={(e) => handleProfileChange("endereco", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Numero</Label>
                  <Input id="numero" value={profile.numero} onChange={(e) => handleProfileChange("numero", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input id="complemento" value={profile.complemento} onChange={(e) => handleProfileChange("complemento", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" value={profile.bairro} onChange={(e) => handleProfileChange("bairro", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input id="cidade" value={profile.cidade} onChange={(e) => handleProfileChange("cidade", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uf">UF</Label>
                  <Input id="uf" value={profile.uf} onChange={(e) => handleProfileChange("uf", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Button type="button" onClick={() => void handleSaveProfile()} disabled={saving} className="gap-1 bg-sky-600 text-white hover:bg-sky-700">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar cadastro
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
