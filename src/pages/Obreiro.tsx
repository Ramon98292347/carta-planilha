import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Building2, CalendarDays, FileText, Loader2, LogOut, Phone, Save, Search, TrendingUp, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clearAppSession, getAppToken } from "@/lib/appSession";
import { formatCep, lookupCep, onlyDigits } from "@/lib/cep";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const CREATE_LETTER_FUNCTION_NAME = (import.meta.env.VITE_CREATE_LETTER_FUNCTION_NAME || "create-letter").trim();
const GET_LETTER_PDF_URL_FUNCTION_NAME = (import.meta.env.VITE_GET_LETTER_PDF_URL_FUNCTION_NAME || "get-letter-pdf-url").trim();
const LIST_LETTERS_FUNCTION_NAME = (import.meta.env.VITE_LIST_LETTERS_FUNCTION_NAME || "list-letters").trim();
const LIST_NOTIFICATIONS_FUNCTION_NAME = (import.meta.env.VITE_LIST_NOTIFICATIONS_FUNCTION_NAME || "list-notifications").trim();
const MARK_NOTIFICATIONS_READ_FUNCTION_NAME = (import.meta.env.VITE_MARK_NOTIFICATIONS_READ_FUNCTION_NAME || "mark-notifications-read").trim();
const SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME = (import.meta.env.VITE_SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME || "search-churches-public").trim();
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
  church_class: string;
};

type LetterFormState = {
  ministerial: string;
  igreja_destino: string;
  igreja_destino_manual: string;
  dia_pregacao: string;
};

type ObreiroNotification = {
  id: string;
  title: string;
  body: string;
  ts: number;
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
  church_class: "",
};

const emptyLetterForm: LetterFormState = {
  ministerial: "",
  igreja_destino: "",
  igreja_destino_manual: "",
  dia_pregacao: "",
};

const normalizePhone = onlyDigits;
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

const parseBrDateToDate = (value: string) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCartaStatus = (row: CartaRow, profile: ObreiroProfile) => {
  const backendStatus = String(row.status || "").trim().toUpperCase();
  if (backendStatus === "ENVIADA") return "Carta enviada";
  if (backendStatus === "LIBERADA") return "Carta liberada";
  if (backendStatus === "AGUARDANDO_LIBERACAO") return "Aguardando liberacao";
  if (backendStatus === "BLOQUEADO") return "Bloqueado";

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

const readProfileFromStorage = (): ObreiroProfile => ({
  ...emptyProfile,
  id: (localStorage.getItem("user_id") || "").trim(),
  nome: (localStorage.getItem("obreiro_nome") || localStorage.getItem("user_name") || "").trim(),
  telefone: normalizePhone(localStorage.getItem("obreiro_telefone") || ""),
  email: (localStorage.getItem("obreiro_email") || "").trim(),
  status: (localStorage.getItem("obreiro_status") || "AUTORIZADO").trim(),
  status_carta: (localStorage.getItem("obreiro_status_carta") || "GERADA").trim(),
  data_nascimento: (localStorage.getItem("obreiro_data_nascimento") || "").trim(),
  data_ordenacao: (localStorage.getItem("obreiro_data_ordenacao") || "").trim(),
  cargo_ministerial: (localStorage.getItem("obreiro_cargo_ministerial") || localStorage.getItem("minister_role") || "").trim(),
  cep: (localStorage.getItem("obreiro_cep") || "").trim(),
  endereco: (localStorage.getItem("obreiro_endereco") || "").trim(),
  numero: (localStorage.getItem("obreiro_numero") || "").trim(),
  complemento: (localStorage.getItem("obreiro_complemento") || "").trim(),
  bairro: (localStorage.getItem("obreiro_bairro") || "").trim(),
  cidade: (localStorage.getItem("obreiro_cidade") || "").trim(),
  uf: (localStorage.getItem("obreiro_uf") || "").trim(),
});

const mapSavedProfileToObreiroProfile = (input: Record<string, unknown>, fallback: ObreiroProfile): ObreiroProfile => ({
  ...fallback,
  id: String(input.id || fallback.id || "").trim(),
  nome: String(input.full_name || fallback.nome || "").trim(),
  telefone: normalizePhone(String(input.phone || fallback.telefone || "")),
  email: String(input.email || fallback.email || "").trim(),
  status: Boolean(input.is_active ?? true) ? "AUTORIZADO" : "BLOQUEADO",
  status_carta: Boolean(input.can_create_released_letter) ? "LIBERADA" : (fallback.status_carta || "GERADA"),
  data_nascimento: String(input.birth_date || fallback.data_nascimento || "").trim(),
  data_ordenacao: String(input.ordination_date || fallback.data_ordenacao || "").trim(),
  cargo_ministerial: String(input.minister_role || fallback.cargo_ministerial || "").trim(),
  cep: String(input.cep || fallback.cep || "").trim(),
  endereco: String(input.address_street || fallback.endereco || "").trim(),
  numero: String(input.address_number || fallback.numero || "").trim(),
  complemento: String(input.address_complement || fallback.complemento || "").trim(),
  bairro: String(input.address_neighborhood || fallback.bairro || "").trim(),
  cidade: String(input.address_city || fallback.cidade || "").trim(),
  uf: String(input.address_state || fallback.uf || "").trim(),
});

const writeProfileToStorage = (profile: ObreiroProfile) => {
  localStorage.setItem("obreiro_nome", profile.nome || "");
  localStorage.setItem("obreiro_telefone", profile.telefone || "");
  localStorage.setItem("obreiro_status", profile.status || "");
  localStorage.setItem("obreiro_status_carta", profile.status_carta || "");
  localStorage.setItem("obreiro_email", profile.email || "");
  localStorage.setItem("obreiro_data_nascimento", profile.data_nascimento || "");
  localStorage.setItem("obreiro_data_ordenacao", profile.data_ordenacao || "");
  localStorage.setItem("obreiro_cargo_ministerial", profile.cargo_ministerial || "");
  localStorage.setItem("obreiro_cep", profile.cep || "");
  localStorage.setItem("obreiro_endereco", profile.endereco || "");
  localStorage.setItem("obreiro_numero", profile.numero || "");
  localStorage.setItem("obreiro_complemento", profile.complemento || "");
  localStorage.setItem("obreiro_bairro", profile.bairro || "");
  localStorage.setItem("obreiro_cidade", profile.cidade || "");
  localStorage.setItem("obreiro_uf", profile.uf || "");
};

export default function Obreiro() {
  const navigate = useNavigate();
  const userId = (localStorage.getItem("user_id") || "").trim();
  const phone = normalizePhone(localStorage.getItem("obreiro_telefone") || "");
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const pastorName = (localStorage.getItem("pastor_name") || "").trim();
  const originTotvs = (localStorage.getItem("totvs_church_id") || "").trim();
  const authToken = getAppToken();

  const [profile, setProfile] = useState<ObreiroProfile>(() => readProfileFromStorage());
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
  const [cardsPeriodPreset, setCardsPeriodPreset] = useState<"7d" | "30d" | "all">("30d");
  const [cardsStatusFilter, setCardsStatusFilter] = useState("all");
  const [cardsDateStart, setCardsDateStart] = useState("");
  const [cardsDateEnd, setCardsDateEnd] = useState("");
  const [notifications, setNotifications] = useState<ObreiroNotification[]>([]);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [searchingDestinations, setSearchingDestinations] = useState(false);
  const [pdfUrlByLetterId, setPdfUrlByLetterId] = useState<Record<string, string>>({});

  const blocked = useMemo(() => isBlockedStatusValue(profile.status), [profile.status]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxPregacaoIso = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return limit.toISOString().slice(0, 10);
  }, []);

  const loadProfile = async () => {
    if (!userId) return;
    setProfile(readProfileFromStorage());
  };

  const loadClientConfig = async () => {
    const nextConfig: ClientConfig = {
      church_name: churchName || "",
      pastor_name: pastorName || "Resolvido pela hierarquia",
      pastor_phone: (localStorage.getItem("pastor_phone") || "").trim(),
      assinatura_url: (localStorage.getItem("assinatura_url") || "").trim(),
      carimbo_igreja_url: (localStorage.getItem("carimbo_igreja_url") || "").trim(),
      carimbo_pastor_url: (localStorage.getItem("carimbo_pastor_url") || "").trim(),
      church_class: (localStorage.getItem("church_class") || "").trim(),
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
    setDestinationOptions([]);
  };

  const loadCards = async () => {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      letters?: Array<Record<string, string | null>>;
    }>(LIST_LETTERS_FUNCTION_NAME, {
      body: { page: 1, page_size: 100 },
    });
    if (error || !data?.letters) return;

    const rows = data.letters.map((row) => ({
      id: String(row.id || "").trim(),
      doc_id: String(row.doc_id || "").trim(),
      doc_url: String(row.url_carta || "").trim(),
      pdf_url: String(row.pdf_url || row.url_carta || "").trim(),
      nome: String(row.preacher_name || "").trim(),
      telefone: normalizePhone(String(row.preacher_phone || row.phone || "")),
      email: String(row.email || "").trim(),
      ministerial: String(row.minister_role || "").trim(),
      igreja_origem: String(row.church_origin || "").trim(),
      igreja_destino: String(row.church_destination || "").trim(),
      data_pregacao: formatDateBr(String(row.preach_date || "").trim()),
      data_emissao: formatDateBr(String(row.created_at || "").trim().slice(0, 10)),
      status: String(row.status || "").trim(),
      status_usuario: profile.status || "",
      status_carta: String(row.status || "").trim(),
      envio: "",
      drive_status: "",
      created_at: String(row.created_at || "").trim(),
    }));

    setCards(rows);
  };

  const loadNotifications = async () => {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      notifications?: Array<Record<string, string | null>>;
    }>(LIST_NOTIFICATIONS_FUNCTION_NAME, {
      body: { page: 1, page_size: 20, unread_only: true },
    });
    if (error || !data?.notifications) return;

    const nextNotifications = data.notifications.map((row) => ({
      id: String(row.id || "").trim(),
      title: String(row.title || "Notificacao").trim(),
      body: String(row.message || "").trim(),
      ts: new Date(String(row.created_at || "").trim() || Date.now()).getTime(),
    }));
    setNotifications(nextNotifications);
  };

  const refreshPage = async () => {
    setLoading(true);
    try {
      await Promise.all([loadProfile(), loadClientConfig(), loadDestinationOptions(), loadCards(), loadNotifications()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshPage();
  }, [userId, originTotvs]);

  const selectedDestination = useMemo(() => {
    const typed = String(letterForm.igreja_destino || "").trim().toUpperCase();
    if (!typed) return null;
    return (
      destinationOptions.find((item) => item.church_name.trim().toUpperCase() === typed) ||
      destinationOptions.find((item) => item.totvs_church_id.trim().toUpperCase() === typed) ||
      destinationOptions.find((item) => `${item.totvs_church_id} ${item.church_name}`.trim().toUpperCase() === typed) ||
      null
    );
  }, [destinationOptions, letterForm.igreja_destino]);
  const filteredDestinationOptions = useMemo(() => {
    const term = String(letterForm.igreja_destino || "").trim().toLowerCase();
    if (term.length < 2 || letterForm.igreja_destino_manual.trim()) return [];
    return destinationOptions
      .filter((item) => `${item.totvs_church_id} - ${item.church_name}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [destinationOptions, letterForm.igreja_destino, letterForm.igreja_destino_manual]);

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

  const filteredCards = useMemo(() => {
    const now = new Date();
    const startBoundary = cardsDateStart ? new Date(`${cardsDateStart}T00:00:00`) : null;
    const endBoundary = cardsDateEnd ? new Date(`${cardsDateEnd}T23:59:59`) : null;

    return cards.filter((row) => {
      const statusLabel = getCartaStatus(row, profile).toLowerCase();
      if (cardsStatusFilter !== "all" && statusLabel !== cardsStatusFilter.toLowerCase()) return false;

      const cardDate = parseBrDateToDate(String(row.data_emissao || "").trim());
      if (cardsPeriodPreset !== "all" && cardDate) {
        const limit = new Date();
        limit.setDate(now.getDate() - (cardsPeriodPreset === "7d" ? 7 : 30));
        if (cardDate < limit || cardDate > now) return false;
      }

      if (startBoundary && cardDate && cardDate < startBoundary) return false;
      if (endBoundary && cardDate && cardDate > endBoundary) return false;

      return true;
    });
  }, [cards, cardsPeriodPreset, cardsStatusFilter, cardsDateStart, cardsDateEnd, profile]);

  const handleProfileChange = (field: keyof ObreiroProfile, value: string) => {
    setProfile((prev) => ({
      ...prev,
      [field]:
        field === "telefone"
          ? normalizePhone(value)
          : field === "cep"
            ? formatCep(value)
            : value,
    }));
  };

  const handleCepLookup = async (rawCep: string) => {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) return;

    setLookingUpCep(true);
    try {
      const result = await lookupCep(cep);
      if (!result) {
        toast.error("CEP nao encontrado.");
        return;
      }

      setProfile((prev) => ({
        ...prev,
        cep: result.cep || prev.cep,
        endereco: result.street || prev.endereco,
        bairro: result.neighborhood || prev.bairro,
        cidade: result.city || prev.cidade,
        uf: result.state || prev.uf,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel consultar o CEP.");
    } finally {
      setLookingUpCep(false);
    }
  };

  useEffect(() => {
    const cep = onlyDigits(profile.cep);
    if (cep.length === 8) {
      void handleCepLookup(cep);
    }
  }, [profile.cep]);

  useEffect(() => {
    const query = onlyDigits(letterForm.igreja_destino);
    if (query.length < 2 || letterForm.igreja_destino_manual.trim() || !createOpen) {
      setDestinationOptions([]);
      setSearchingDestinations(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingDestinations(true);
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok?: boolean;
          churches?: Array<{ totvs_id: string; church_name: string }>;
        }>(SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME, {
          body: { query, limit: 12 },
        });

        if (error || !data?.ok) {
          setDestinationOptions([]);
          return;
        }

        setDestinationOptions(
          (data.churches || []).map((church) => ({
            totvs_church_id: String(church.totvs_id || "").trim(),
            church_name: String(church.church_name || "").trim(),
          })),
        );
      } finally {
        setSearchingDestinations(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [letterForm.igreja_destino, letterForm.igreja_destino_manual, createOpen]);

  useEffect(() => {
    let cancelled = false;

    const releasedCards = cards.filter((row) => {
      const statusLabel = getCartaStatus(row, profile);
      return (
        statusLabel === "Carta liberada" ||
        statusLabel === "Liberacao automatica" ||
        statusLabel === "Carta enviada"
      );
    });

    const directUrls = Object.fromEntries(
      releasedCards
        .map((row) => {
          const directUrl = String(row.pdf_url || row.doc_url || "").trim();
          return directUrl ? [String(row.id || "").trim(), directUrl] : null;
        })
        .filter(Boolean) as Array<[string, string]>,
    );

    setPdfUrlByLetterId(directUrls);

    const pendingCards = releasedCards.filter((row) => {
      const id = String(row.id || "").trim();
      return id && !directUrls[id];
    });

    if (pendingCards.length === 0) return;

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingCards.map(async (row) => {
          const id = String(row.id || "").trim();
          try {
            const { data, error } = await supabase.functions.invoke<{
              ok?: boolean;
              url?: string;
            }>(GET_LETTER_PDF_URL_FUNCTION_NAME, {
              body: { letter_id: id },
            });

            if (error || !data?.ok || !data.url) return null;
            return [id, data.url] as [string, string];
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      const resolvedMap = Object.fromEntries(
        resolvedEntries.filter(Boolean) as Array<[string, string]>,
      );

      if (Object.keys(resolvedMap).length > 0) {
        setPdfUrlByLetterId((prev) => ({ ...prev, ...resolvedMap }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cards, profile]);

  const clearNotifications = () => {
    void supabase.functions
      .invoke(MARK_NOTIFICATIONS_READ_FUNCTION_NAME, {
        body: { church_totvs_id: originTotvs || null },
      })
      .finally(() => {
        setNotifications([]);
      });
  };

  const handleSaveProfile = async () => {
    if (!authToken) {
      toast.error("Sessao do obreiro nao encontrada.");
      return;
    }

    if (!profile.nome.trim()) {
      toast.error("Preencha o nome.");
      return;
    }

    if (!profile.telefone.trim()) {
      toast.error("Preencha o telefone antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        profile?: Record<string, unknown>;
      }>("save-my-profile", {
        body: {
          full_name: profile.nome.trim(),
          phone: profile.telefone.trim(),
          email: profile.email.trim(),
          birth_date: profile.data_nascimento.trim() || null,
          ordination_date: profile.data_ordenacao.trim() || null,
          minister_role: profile.cargo_ministerial.trim() || null,
          cep: profile.cep.trim() || null,
          address_street: profile.endereco.trim() || null,
          address_number: profile.numero.trim() || null,
          address_complement: profile.complemento.trim() || null,
          address_neighborhood: profile.bairro.trim() || null,
          address_city: profile.cidade.trim() || null,
          address_state: profile.uf.trim() || null,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Nao foi possivel atualizar o cadastro.");

      const nextProfile = data.profile
        ? mapSavedProfileToObreiroProfile(data.profile, profile)
        : { ...profile };
      writeProfileToStorage(nextProfile);
      setProfile(nextProfile);
      toast.success("Cadastro atualizado com sucesso.");
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
    // Comentario: o backend novo completa os dados faltantes pela sessao,
    // pela hierarquia da igreja e pelo pastor assinante resolvido.
    preacher_name: profile.nome,
    minister_role: letterForm.ministerial || profile.cargo_ministerial,
    preach_date: letterForm.dia_pregacao,
    preach_period: "NOITE",
    church_origin: originTotvs ? `${originTotvs} ${clientConfig.church_name || churchName}`.trim() : clientConfig.church_name || churchName,
    church_destination: (letterForm.igreja_destino || letterForm.igreja_destino_manual).trim(),
    preacher_user_id: profile.id,
    phone: profile.telefone,
    email: profile.email || null,
  });

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

    if (!CREATE_LETTER_FUNCTION_NAME) {
      toast.error("Function de criar carta nao configurada.");
      return;
    }

    setCreatingLetter(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
      }>(CREATE_LETTER_FUNCTION_NAME, {
        body: payload,
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Nao foi possivel enviar a carta.");

      toast.success("Carta enviada");
      setCreateOpen(false);
      await Promise.all([loadCards(), loadNotifications()]);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel enviar a carta.");
    } finally {
      setCreatingLetter(false);
    }
  };

  const handleLogout = () => {
    clearAppSession();
    navigate("/login", { replace: true });
  };

  const handleOpenLetter = async (row: CartaRow) => {
    const statusLabel = getCartaStatus(row, profile);
    const isReleased =
      statusLabel === "Carta liberada" ||
      statusLabel === "Liberacao automatica" ||
      statusLabel === "Carta enviada";
    const directUrl = String(pdfUrlByLetterId[String(row.id || "").trim()] || row.pdf_url || row.doc_url || "").trim();
    const hasReadyFile = !!directUrl;

    if (!isReleased) {
      toast.error("O PDF so pode ser aberto quando a carta estiver liberada.");
      return;
    }

    if (!hasReadyFile) {
      toast.error("O PDF ainda nao esta pronto. Aguarde a geracao do arquivo.");
      return;
    }

    window.open(directUrl, "_blank", "noopener,noreferrer");
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
                  notifications.slice(0, 8).map((item) => (
                    <DropdownMenuItem key={item.id} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-semibold">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.body}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearNotifications} className="text-xs text-rose-700">
                  Limpar notificacoes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <CardDescription>As cartas agora sao lidas da tabela `letters` com as regras de acesso do banco novo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <div className="flex min-w-max gap-3">
                    <div className="w-[180px] space-y-2">
                    <Label>Periodo</Label>
                    <Select value={cardsPeriodPreset} onValueChange={(value: "7d" | "30d" | "all") => setCardsPeriodPreset(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Periodo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">Ultimos 7 dias</SelectItem>
                        <SelectItem value="30d">Ultimos 30 dias</SelectItem>
                        <SelectItem value="all">Periodo completo</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                    <div className="w-[180px] space-y-2">
                    <Label>Status</Label>
                    <Select value={cardsStatusFilter} onValueChange={setCardsStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="aguardando liberacao">Aguardando liberacao</SelectItem>
                        <SelectItem value="liberacao automatica">Liberacao automatica</SelectItem>
                        <SelectItem value="carta liberada">Carta liberada</SelectItem>
                        <SelectItem value="carta enviada">Carta enviada</SelectItem>
                        <SelectItem value="bloqueado">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                    <div className="w-[140px] space-y-2">
                    <Label>De</Label>
                    <Input type="date" value={cardsDateStart} onChange={(e) => setCardsDateStart(e.target.value)} />
                    </div>
                    <div className="w-[140px] space-y-2">
                    <Label>Ate</Label>
                    <Input type="date" value={cardsDateEnd} onChange={(e) => setCardsDateEnd(e.target.value)} />
                    </div>
                  </div>
                </div>
                {filteredCards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhuma carta encontrada para este obreiro.</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Destino</th>
                          <th className="px-4 py-3">Origem</th>
                          <th className="px-4 py-3">Data da pregacao</th>
                          <th className="px-4 py-3">Emissao</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCards.map((row, index) => {
                          const statusLabel = getCartaStatus(row, profile);
                          const canOpenPdf =
                            statusLabel === "Carta liberada" ||
                            statusLabel === "Liberacao automatica" ||
                            statusLabel === "Carta enviada";
                          const hasReadyFile = !!String(pdfUrlByLetterId[String(row.id || "").trim()] || row.pdf_url || row.doc_url || "").trim();
                          return (
                            <tr key={`${row.id || row.doc_id || row.nome || "carta"}-${index}`} className="border-t">
                              <td className="px-4 py-3 font-medium text-foreground">{row.igreja_destino || row.ipda_destino || "Destino nao informado"}</td>
                              <td className="px-4 py-3 text-muted-foreground">{row.igreja_origem || "-"}</td>
                              <td className="px-4 py-3 text-muted-foreground">{formatDisplayDate(row.data_pregacao || row["Data da pregacao."] || "-")}</td>
                              <td className="px-4 py-3 text-muted-foreground">{formatDisplayDate(row.data_emissao || row["Carimbo de data/hora"] || "-")}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={getCartaStatusClass(statusLabel)}>
                                  {statusLabel}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  type="button"
                                  disabled={!canOpenPdf || !hasReadyFile}
                                  className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
                                  onClick={() => void handleOpenLetter(row)}
                                >
                                  Abrir PDF
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                  <Input id="telefone" value={profile.telefone} onChange={(e) => handleProfileChange("telefone", e.target.value)} />
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
                  <Input
                    id="cep"
                    value={profile.cep}
                    onChange={(e) => handleProfileChange("cep", e.target.value)}
                    placeholder="00000-000"
                  />
                  {lookingUpCep && <p className="text-xs text-muted-foreground">Buscando endereco pelo CEP...</p>}
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
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={letterForm.igreja_destino}
                      onChange={(e) =>
                        setLetterForm((prev) => ({
                          ...prev,
                          igreja_destino: e.target.value,
                          igreja_destino_manual: "",
                        }))
                      }
                      placeholder={destinationOptions.length ? "Digite o TOTVS ou nome da igreja" : "Digite o TOTVS ou nome da igreja destino"}
                      disabled={!!letterForm.igreja_destino_manual.trim()}
                      className="pl-10"
                    />
                  </div>
                  {filteredDestinationOptions.length > 0 && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {filteredDestinationOptions.map((item) => (
                        <button
                          key={item.totvs_church_id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          onClick={() =>
                            setLetterForm((prev) => ({
                              ...prev,
                              igreja_destino: `${item.totvs_church_id} - ${item.church_name}`,
                              igreja_destino_manual: "",
                            }))
                          }
                        >
                          <span className="font-medium text-slate-900">{item.totvs_church_id} - {item.church_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchingDestinations && (
                    <p className="text-xs text-muted-foreground">Buscando igrejas...</p>
                  )}
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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{clientConfig.pastor_name || "Resolvido pela hierarquia"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{clientConfig.pastor_phone || "Definido na liberacao/geracao da carta"}</span>
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
