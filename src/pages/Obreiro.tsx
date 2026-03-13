import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FileText, Loader2, LogOut, RefreshCw, Save, TrendingUp, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const LETTER_CREATE_WEBHOOK_URL = (
  import.meta.env.VITE_CARTAS_CREATE_WEBHOOK_URL || "https://n8n-n8n.ynlng8.easypanel.host/webhook/carta-pregacao"
).trim();
const CACHE_REFRESH_MS = 30000;

const ministerialOptions = ["Membro", "Cooperador", "Di\u00e1cono", "Presb\u00edtero", "Pastor"];

type ObreiroProfile = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  status: string;
  status_carta: string;
  data_nascimento: string;
  data_ordenacao: string;
  cargo_ministerial: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type CartaRow = Record<string, string>;

type LetterFormState = {
  ministerial: string;
  igreja_destino: string;
  dia_pregacao: string;
};

const emptyProfile: ObreiroProfile = {
  id: "",
  nome: "",
  telefone: "",
  email: "",
  status: "",
  status_carta: "",
  data_nascimento: "",
  data_ordenacao: "",
  cargo_ministerial: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

const emptyLetterForm: LetterFormState = {
  ministerial: "",
  igreja_destino: "",
  dia_pregacao: "",
};

const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");
const isBlockedStatusValue = (value: string) => String(value || "").trim().toUpperCase() === "BLOQUEADO";

const formatDisplayDate = (value: string) => {
  const raw = String(value || "").trim();
  return raw || "-";
};

const formatDateBr = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

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

export default function Obreiro() {
  const navigate = useNavigate();
  const clientId = (localStorage.getItem("clientId") || "").trim();
  const phone = normalizePhone(localStorage.getItem("obreiro_telefone") || "");
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const pastorName = (localStorage.getItem("pastor_name") || "").trim();

  const [profile, setProfile] = useState<ObreiroProfile>(() => ({
    ...emptyProfile,
    nome: (localStorage.getItem("obreiro_nome") || "").trim(),
    telefone: phone,
    email: (localStorage.getItem("obreiro_email") || "").trim(),
    status: (localStorage.getItem("obreiro_status") || "").trim(),
    data_nascimento: (localStorage.getItem("obreiro_data_nascimento") || "").trim(),
    data_ordenacao: (localStorage.getItem("obreiro_data_ordenacao") || "").trim(),
    cargo_ministerial: (localStorage.getItem("obreiro_cargo_ministerial") || "").trim(),
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
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingLetter, setCreatingLetter] = useState(false);
  const [letterForm, setLetterForm] = useState<LetterFormState>(emptyLetterForm);
  const [letterPayloadPreview, setLetterPayloadPreview] = useState<Record<string, string> | null>(null);

  const blocked = useMemo(() => isBlockedStatusValue(profile.status), [profile.status]);

  const loadProfile = async () => {
    if (!clientId || !phone || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({
      select: "id,nome,telefone,email,status,status_carta,data_nascimento,data_ordenacao,cargo_ministerial,cep,endereco,numero,complemento,bairro,cidade,uf",
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
      cargo_ministerial: String(row.cargo_ministerial || "").trim(),
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
    localStorage.setItem("obreiro_cargo_ministerial", nextProfile.cargo_ministerial || "");
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

      if (!response.ok) throw new Error("Nao foi possivel localizar o cadastro do obreiro.");

      const payload = (await response.json().catch(() => [])) as Array<{ id?: string }>;
      const id = String(payload?.[0]?.id || profile.id || "").trim();
      if (!id) throw new Error("Cadastro do obreiro nao encontrado.");

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
          cargo_ministerial: profile.cargo_ministerial.trim() || null,
          cep: profile.cep.trim() || null,
          endereco: profile.endereco.trim() || null,
          numero: profile.numero.trim() || null,
          complemento: profile.complemento.trim() || null,
          bairro: profile.bairro.trim() || null,
          cidade: profile.cidade.trim() || null,
          uf: profile.uf.trim() || null,
        }),
      });

      if (!updateRes.ok) throw new Error("Nao foi possivel atualizar o cadastro.");

      toast.success("Cadastro atualizado com sucesso.");
      await loadProfile();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel atualizar o cadastro.");
    } finally {
      setSaving(false);
    }
  };

  const openLetterDialog = () => {
    if (blocked) {
      toast.error("Seu acesso esta bloqueado. Procure o pastor.");
      return;
    }
    setLetterForm({ ...emptyLetterForm, ministerial: profile.cargo_ministerial || "" });
    setLetterPayloadPreview(null);
    setCreateOpen(true);
  };

  const buildLetterPayload = () => ({
    client_id: clientId,
    obreiro_id: profile.id,
    nome: profile.nome,
    telefone: profile.telefone,
    email: profile.email || "",
    ministerial: letterForm.ministerial || profile.cargo_ministerial,
    igreja_origem: churchName,
    igreja_destino: letterForm.igreja_destino,
    dia_pregacao: formatDateBr(letterForm.dia_pregacao),
    data_emissao: formatDateBr(new Date().toISOString().slice(0, 10)),
    data_da_separacao: formatDateBr(profile.data_ordenacao),
    status_usuario: profile.status || "AUTORIZADO",
    status_carta: profile.status_carta || "GERADA",
  });

  const handleCreateLetter = async () => {
    if (!(letterForm.ministerial || profile.cargo_ministerial) || !letterForm.igreja_destino.trim() || !letterForm.dia_pregacao) {
      toast.error("Preencha funcao ministerial, igreja destino e data da pregacao.");
      return;
    }

    const payload = buildLetterPayload();
    setLetterPayloadPreview(payload);

    if (!LETTER_CREATE_WEBHOOK_URL) {
      toast.success("Payload da carta montado com sucesso.");
      return;
    }

    setCreatingLetter(true);
    try {
      const response = await fetch(LETTER_CREATE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(String(result?.error || result?.message || "Nao foi possivel enviar a carta.").trim());
      }

      toast.success(String(result?.message || "Carta enviada para processamento.").trim());
      setCreateOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel enviar a carta.");
    } finally {
      setCreatingLetter(false);
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
      "obreiro_cargo_ministerial",
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
              <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={openLetterDialog} disabled={blocked}>
                Nova carta
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
                            <div className="text-muted-foreground">Data da pregacao: {formatDisplayDate(row.data_pregacao || row["Data da pregacao."] || "-")}</div>
                            <div className="text-muted-foreground">Emissao: {formatDisplayDate(row.data_emissao || row["Carimbo de data/hora"] || "-")}</div>
                          </div>
                          <div className="flex flex-col items-start gap-2 md:items-end">
                            <Badge variant="outline" className={getCartaStatusClass(statusLabel)}>
                              {statusLabel}
                            </Badge>
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
                  <Label htmlFor="cargo_ministerial">Cargo ministerial</Label>
                  <Select value={profile.cargo_ministerial} onValueChange={(value) => handleProfileChange("cargo_ministerial", value)}>
                    <SelectTrigger id="cargo_ministerial">
                      <SelectValue placeholder="Selecione o cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {ministerialOptions.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova carta</DialogTitle>
            <DialogDescription>Formulario customizado para montar o payload da carta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={profile.nome} disabled />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={profile.telefone} disabled />
            </div>
            <div className="space-y-2">
              <Label>Funcao ministerial</Label>
              <Select value={letterForm.ministerial || profile.cargo_ministerial} onValueChange={(value) => setLetterForm((prev) => ({ ...prev, ministerial: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ministerialOptions.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data da pregacao</Label>
              <Input type="date" value={letterForm.dia_pregacao} onChange={(e) => setLetterForm((prev) => ({ ...prev, dia_pregacao: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Igreja origem</Label>
              <Input value={churchName} disabled />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Igreja destino</Label>
              <Input value={letterForm.igreja_destino} onChange={(e) => setLetterForm((prev) => ({ ...prev, igreja_destino: e.target.value }))} placeholder="Digite a igreja destino" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Payload</Label>
              <Textarea value={letterPayloadPreview ? JSON.stringify(letterPayloadPreview, null, 2) : JSON.stringify(buildLetterPayload(), null, 2)} readOnly className="min-h-52 font-mono text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Fechar</Button>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void handleCreateLetter()} disabled={creatingLetter}>
              {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Montar payload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
