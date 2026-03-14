import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CalendarDays, FileText, Loader2, LogOut, Phone, RefreshCw, Save, Search, TrendingUp, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type DestinationOption = {
  totvs_church_id: string;
  church_name: string;
};

type ClientConfig = {
  church_name: string;
  pastor_name: string;
  pastor_phone: string;
  assinatura_url: string;
  carimbo_igreja_url: string;
  carimbo_pastor_url: string;
};

type LetterFormState = {
  ministerial: string;
  igreja_destino: string;
  igreja_destino_manual: string;
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

const emptyClientConfig: ClientConfig = {
  church_name: "",
  pastor_name: "",
  pastor_phone: "",
  assinatura_url: "",
  carimbo_igreja_url: "",
  carimbo_pastor_url: "",
};

const emptyLetterForm: LetterFormState = {
  ministerial: "",
  igreja_destino: "",
  igreja_destino_manual: "",
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
  const originTotvs = (localStorage.getItem("totvs_church_id") || "").trim();

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
  const [destinationOptions, setDestinationOptions] = useState<DestinationOption[]>([]);
  const [clientConfig, setClientConfig] = useState<ClientConfig>(() => ({
    ...emptyClientConfig,
    church_name: churchName,
    pastor_name: pastorName,
    pastor_phone: (localStorage.getItem("pastor_phone") || "").trim(),
    assinatura_url: (localStorage.getItem("assinatura_url") || "").trim(),
    carimbo_igreja_url: (localStorage.getItem("carimbo_igreja_url") || "").trim(),
    carimbo_pastor_url: (localStorage.getItem("carimbo_pastor_url") || "").trim(),
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingLetter, setCreatingLetter] = useState(false);
  const [letterForm, setLetterForm] = useState<LetterFormState>(emptyLetterForm);

  const blocked = useMemo(() => isBlockedStatusValue(profile.status), [profile.status]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxPregacaoIso = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return limit.toISOString().slice(0, 10);
  }, []);

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

  const loadClientConfig = async () => {
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({
      select: "church_name,pastor_name,pastor_phone,assinatura_url,carimbo_igreja_url,carimbo_pastor_url",
      limit: "1",
    });
    params.set("id", `eq.${clientId}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`, {
      headers: getSupabaseHeaders({ json: false }),
    });
    if (!response.ok) return;

    const payload = (await response.json().catch(() => [])) as Array<Record<string, string | null>>;
    const row = payload?.[0];
    if (!row) return;

    const nextConfig: ClientConfig = {
      church_name: String(row.church_name || churchName || "").trim(),
      pastor_name: String(row.pastor_name || pastorName || "").trim(),
      pastor_phone: String(row.pastor_phone || "").trim(),
      assinatura_url: String(row.assinatura_url || "").trim(),
      carimbo_igreja_url: String(row.carimbo_igreja_url || "").trim(),
      carimbo_pastor_url: String(row.carimbo_pastor_url || "").trim(),
    };

    setClientConfig(nextConfig);
    localStorage.setItem("church_name", nextConfig.church_name || "");
    localStorage.setItem("pastor_name", nextConfig.pastor_name || "");
    localStorage.setItem("pastor_phone", nextConfig.pastor_phone || "");
    localStorage.setItem("assinatura_url", nextConfig.assinatura_url || "");
    localStorage.setItem("carimbo_igreja_url", nextConfig.carimbo_igreja_url || "");
    localStorage.setItem("carimbo_pastor_url", nextConfig.carimbo_pastor_url || "");
  };

  const loadDestinationOptions = async () => {
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({
      select: "totvs_church_id,church_name,parent_totvs_church_id,is_active",
      limit: "500",
    });
    params.set("client_id", `eq.${clientId}`);
    params.set("is_active", "eq.true");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/client_churches?${params.toString()}`, {
      headers: getSupabaseHeaders({ json: false }),
    });
    if (!response.ok) return;

    const payload = (await response.json().catch(() => [])) as Array<{
      totvs_church_id?: string | null;
      church_name?: string | null;
      parent_totvs_church_id?: string | null;
      is_active?: boolean | null;
    }>;

    const options = payload
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        totvs_church_id: String(row.totvs_church_id || "").trim(),
        church_name: String(row.church_name || "").trim(),
      }))
      .filter((row) => row.totvs_church_id && row.church_name && row.church_name !== (clientConfig.church_name || churchName))
      .sort((a, b) => a.church_name.localeCompare(b.church_name, "pt-BR"));

    const uniqueOptions = Array.from(new Map(options.map((item) => [item.totvs_church_id, item])).values());
    setDestinationOptions(uniqueOptions);
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
      await Promise.all([loadProfile(), loadClientConfig(), loadDestinationOptions(), loadCards()]);
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
      void Promise.all([loadProfile(), loadClientConfig(), loadDestinationOptions(), loadCards()]);
    }, CACHE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [clientId, phone, profile.status_carta]);

  const selectedDestination = useMemo(() => destinationOptions.find((item) => item.church_name === letterForm.igreja_destino) || null, [destinationOptions, letterForm.igreja_destino]);

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
    if (!profile.cargo_ministerial.trim()) {
      toast.error("Preencha o cargo ministerial no seu cadastro antes de gerar a carta.");
      return;
    }
    setLetterForm({ ...emptyLetterForm, ministerial: profile.cargo_ministerial || "" });
    setCreateOpen(true);
  };

  const buildLetterPayload = () => ({
    client_id: clientId,
    obreiro_id: profile.id,
    nome: profile.nome,
    telefone: profile.telefone,
    igreja_origem: clientConfig.church_name || churchName,
    origem: clientConfig.church_name || churchName,
    igreja_destino: (letterForm.igreja_destino || letterForm.igreja_destino_manual).trim(),
    destino: (letterForm.igreja_destino || letterForm.igreja_destino_manual).trim(),
    dia_pregacao: formatDateBr(letterForm.dia_pregacao),
    data_emissao: formatDateBr(new Date().toISOString().slice(0, 10)),
    origem_totvs: originTotvs || null,
    destino_totvs: selectedDestination?.totvs_church_id || null,
    origem_nome: clientConfig.church_name || churchName || null,
    destino_nome: selectedDestination?.church_name || (letterForm.igreja_destino_manual.trim() || null),
    email: profile.email || "",
    email_pregador: profile.email || null,
    ministerial: letterForm.ministerial || profile.cargo_ministerial,
    data_separacao: formatDateBr(profile.data_ordenacao) || null,
    data_da_separacao: formatDateBr(profile.data_ordenacao),
    pastor_responsavel: clientConfig.pastor_name || pastorName || null,
    telefone_pastor: clientConfig.pastor_phone || null,
    assinatura_url: clientConfig.assinatura_url || null,
    carimbo_igreja_url: clientConfig.carimbo_igreja_url || null,
    carimbo_pastor_url: clientConfig.carimbo_pastor_url || null,
    status_usuario: profile.status || "AUTORIZADO",
    status_carta: profile.status_carta || "GERADA",
  });

  const createLetterRecord = async (payload: ReturnType<typeof buildLetterPayload>) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/client_letters`, {
      method: "POST",
      headers: {
        ...getSupabaseHeaders(),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        client_id: payload.client_id,
        obreiro_id: payload.obreiro_id || null,
        nome: payload.nome,
        telefone: payload.telefone,
        email: payload.email || null,
        email_pregador: payload.email_pregador || null,
        ministerial: payload.ministerial || null,
        igreja_origem: payload.igreja_origem || null,
        origem: payload.origem || null,
        origem_totvs: payload.origem_totvs || null,
        origem_nome: payload.origem_nome || null,
        igreja_destino: payload.igreja_destino || null,
        destino: payload.destino || null,
        destino_totvs: payload.destino_totvs || null,
        destino_nome: payload.destino_nome || null,
        dia_pregacao: payload.dia_pregacao || null,
        data_emissao: payload.data_emissao || null,
        data_separacao: payload.data_separacao || null,
        data_da_separacao: payload.data_da_separacao || null,
        pastor_responsavel: payload.pastor_responsavel || null,
        telefone_pastor: payload.telefone_pastor || null,
        assinatura_url: payload.assinatura_url || null,
        carimbo_igreja_url: payload.carimbo_igreja_url || null,
        carimbo_pastor_url: payload.carimbo_pastor_url || null,
        status_usuario: payload.status_usuario || "AUTORIZADO",
        status_carta: payload.status_carta || "GERADA",
        tipo_fluxo: String(profile.status_carta || "").trim().toUpperCase() === "LIBERADA" ? "automatico" : "manual",
        webhook_action: "carta-pregacao",
        raw_payload: payload,
      }),
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel salvar a carta no banco.");
    }

    const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
    return String(rows?.[0]?.id || "").trim() || null;
  };

  const updateLetterRecord = async (letterId: string, data: Record<string, unknown>) => {
    if (!letterId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const params = new URLSearchParams({ select: "id" });
    params.set("id", `eq.${letterId}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/client_letters?${params.toString()}`, {
      method: "PATCH",
      headers: {
        ...getSupabaseHeaders(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel atualizar a carta no banco.");
    }
  };

  const handleCreateLetter = async () => {
    const igrejaDestinoFinal = (letterForm.igreja_destino || letterForm.igreja_destino_manual).trim();
    if (!(letterForm.ministerial || profile.cargo_ministerial) || !igrejaDestinoFinal || !letterForm.dia_pregacao) {
      toast.error("Preencha funcao ministerial, igreja destino e data da pregacao.");
      return;
    }
    if (letterForm.dia_pregacao < todayIso || letterForm.dia_pregacao > maxPregacaoIso) {
      toast.error("A data da pregacao deve ficar entre hoje e os proximos 30 dias.");
      return;
    }

    const payload = buildLetterPayload();

    if (!LETTER_CREATE_WEBHOOK_URL) {
      toast.success("Payload da carta montado com sucesso.");
      return;
    }

    setCreatingLetter(true);
    try {
      const letterId = await createLetterRecord(payload);

      const response = await fetch(LETTER_CREATE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(String(result?.error || result?.message || "Nao foi possivel enviar a carta.").trim());
      }

      if (letterId) {
        await updateLetterRecord(letterId, {
          doc_id: String(result?.docId || result?.doc_id || "").trim() || null,
          doc_url: String(result?.docUrl || result?.doc_url || "").trim() || null,
          pdf_url: String(result?.pdfUrl || result?.pdf_url || "").trim() || null,
        });
      }

      toast.success(String(result?.message || "Carta enviada para processamento.").trim());
      setCreateOpen(false);
      await loadCards();
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
              Igreja: {clientConfig.church_name || churchName || "-"} | Pastor: {clientConfig.pastor_name || pastorName || "-"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={blocked ? "border-rose-300 bg-rose-100 text-rose-700" : "border-emerald-300 bg-emerald-100 text-emerald-700"}>
                {profile.status || "AUTORIZADO"}
              </Badge>
              {profile.cargo_ministerial && (
                <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                  {profile.cargo_ministerial}
                </Badge>
              )}
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
              {!blocked && !profile.cargo_ministerial.trim() && (
                <span className="text-sm text-amber-700">Preencha seu cargo ministerial no cadastro para gerar carta.</span>
              )}
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Registro de Carta de Pregacao</DialogTitle>
            <DialogDescription>Preencha os dados para emissao da carta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                  <FileText className="h-6 w-6 text-primary" /> Registro de Carta de Pregacao
                </CardTitle>
                <CardDescription>Preencha os dados para emissao da carta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Nome do pregador</Label>
                  <Input value={profile.nome} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={profile.telefone} disabled placeholder="Digite o telefone" />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que faz a carta (origem)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={clientConfig.church_name || churchName} disabled className="pl-10" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Funcao ministerial</Label>
                  <Input value={profile.cargo_ministerial || "Nao informado"} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que vai pregar (destino)</Label>
                  <Select value={letterForm.igreja_destino} onValueChange={(value) => setLetterForm((prev) => ({ ...prev, igreja_destino: value, igreja_destino_manual: "" }))} disabled={!!letterForm.igreja_destino_manual.trim()}>
                    <SelectTrigger className="pl-10 relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <SelectValue placeholder={destinationOptions.length ? "Buscar por nome ou codigo TOTVS" : "Sem igrejas cadastradas na tabela"} />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationOptions.map((item) => (
                        <SelectItem key={item.totvs_church_id} value={item.church_name}>{item.church_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Outros (se nao encontrar)</Label>
                  <Input
                    value={letterForm.igreja_destino_manual}
                    onChange={(e) => setLetterForm((prev) => ({ ...prev, igreja_destino_manual: e.target.value, igreja_destino: "" }))}
                    placeholder="Digite a igreja manualmente"
                    disabled={!!letterForm.igreja_destino.trim()}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data da pregacao</Label>
                    <Input type="date" min={todayIso} max={maxPregacaoIso} value={letterForm.dia_pregacao} onChange={(e) => setLetterForm((prev) => ({ ...prev, dia_pregacao: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de emissao da carta</Label>
                    <Input value={formatDateBr(todayIso)} disabled />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">A data da pregacao pode ser escolhida entre hoje e os proximos 30 dias.</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-emerald-100 shadow-sm">
              <CardHeader className="bg-emerald-50/80">
                <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                  <FileText className="h-6 w-6 text-emerald-600" /> Pre-visualizacao da Carta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pregador</p>
                  <div className="flex items-start gap-3 text-slate-900 sm:items-center">
                    <UserCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-base font-semibold sm:text-lg">{profile.nome || "Nao informado"}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{clientConfig.church_name || churchName || "Nao informada"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span>{(letterForm.igreja_destino || letterForm.igreja_destino_manual).trim() || "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data de emissao</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{formatDateBr(todayIso)}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data da pregacao</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{letterForm.dia_pregacao ? formatDateBr(letterForm.dia_pregacao) : "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pastor responsavel da igreja</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{clientConfig.pastor_name || pastorName || "Nao informado"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{clientConfig.pastor_phone || "-"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">Fechar</Button>
            <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={() => void handleCreateLetter()} disabled={creatingLetter}>
              {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar carta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
