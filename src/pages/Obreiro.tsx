import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Phone, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObreiroLetterDialog } from "@/components/ObreiroLetterDialog";
import { ObreiroLettersCard } from "@/components/ObreiroLettersCard";
import { ObreiroOverview } from "@/components/ObreiroOverview";
import { ObreiroProfileCard } from "@/components/ObreiroProfileCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { clearAppSession, getAppToken } from "@/lib/appSession";
import { formatDateBr, normalizeManualChurchDestination } from "@/lib/churchFormatting";
import { formatCep, lookupCep, onlyDigits } from "@/lib/cep";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const CREATE_LETTER_FUNCTION_NAME = (import.meta.env.VITE_CREATE_LETTER_FUNCTION_NAME || "create-letter").trim();
const GET_LETTER_PDF_URL_FUNCTION_NAME = (import.meta.env.VITE_GET_LETTER_PDF_URL_FUNCTION_NAME || "get-letter-pdf-url").trim();
const GET_MY_PROFILE_FUNCTION_NAME = (import.meta.env.VITE_GET_MY_PROFILE_FUNCTION_NAME || "get-my-profile").trim();
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
    const fallbackProfile = readProfileFromStorage();
    setProfile(fallbackProfile);

    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      profile?: Record<string, unknown>;
    }>(GET_MY_PROFILE_FUNCTION_NAME, {});

    if (error || !data?.ok || !data.profile) return;

    const nextProfile = mapSavedProfileToObreiroProfile(data.profile, fallbackProfile);
    setProfile(nextProfile);
    writeProfileToStorage(nextProfile);
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
    // Comentario: se o destino digitado nao bater com uma igreja conhecida,
    // ele passa a ser tratado como manual para a regra da hierarquia mae.
    church_destination: selectedDestination
      ? `${selectedDestination.totvs_church_id} - ${selectedDestination.church_name}`
      : normalizeManualChurchDestination(letterForm.igreja_destino.trim() || letterForm.igreja_destino_manual),
    manual_destination: !selectedDestination || !!letterForm.igreja_destino_manual.trim(),
    // Comentario: o backend novo completa os dados faltantes pela sessao,
    // pela hierarquia da igreja e pelo pastor assinante resolvido.
    preacher_name: profile.nome,
    minister_role: letterForm.ministerial || profile.cargo_ministerial,
    preach_date: letterForm.dia_pregacao,
    preach_period: "NOITE",
    church_origin: originTotvs ? `${originTotvs} ${clientConfig.church_name || churchName}`.trim() : clientConfig.church_name || churchName,
    preacher_user_id: profile.id,
    phone: profile.telefone,
    email: profile.email || null,
  });

  const handleCreateLetter = async () => {
    const igrejaDestinoFinal = selectedDestination
      ? `${selectedDestination.totvs_church_id} - ${selectedDestination.church_name}`
      : normalizeManualChurchDestination(letterForm.igreja_destino.trim() || letterForm.igreja_destino_manual);
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
      <main className="container mx-auto space-y-6 px-4 py-6">
        <ObreiroOverview
          profile={profile}
          churchName={clientConfig.church_name || churchName}
          pastorName={clientConfig.pastor_name || pastorName}
          stats={stats}
          blocked={blocked}
          notifications={notifications}
          onClearNotifications={clearNotifications}
          onLogout={handleLogout}
          onOpenLetterDialog={openLetterDialog}
        />

        <Tabs defaultValue="movimentos" className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max w-full sm:w-auto">
              <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
              <TabsTrigger value="cadastro">Meu cadastro</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="movimentos" className="space-y-4">
            <ObreiroLettersCard
              stats={stats}
              filteredCards={filteredCards}
              profileStatus={profile.status}
              cardsPeriodPreset={cardsPeriodPreset}
              setCardsPeriodPreset={setCardsPeriodPreset}
              cardsStatusFilter={cardsStatusFilter}
              setCardsStatusFilter={setCardsStatusFilter}
              cardsDateStart={cardsDateStart}
              setCardsDateStart={setCardsDateStart}
              cardsDateEnd={cardsDateEnd}
              setCardsDateEnd={setCardsDateEnd}
              pdfUrlByLetterId={pdfUrlByLetterId}
              getCartaStatus={(row) => getCartaStatus(row, profile)}
              getCartaStatusClass={getCartaStatusClass}
              formatDisplayDate={formatDisplayDate}
              onOpenLetter={(row) => void handleOpenLetter(row)}
            />
          </TabsContent>

          <TabsContent value="cadastro">
            <ObreiroProfileCard
              profile={profile}
              ministerialOptions={ministerialOptions}
              lookingUpCep={lookingUpCep}
              saving={saving}
              onChange={handleProfileChange}
              onSave={() => void handleSaveProfile()}
            />
          </TabsContent>
        </Tabs>
      </main>

      <ObreiroLetterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profileName={profile.nome}
        profilePhone={profile.telefone}
        profileMinisterial={profile.cargo_ministerial}
        letterForm={letterForm}
        setLetterForm={setLetterForm}
        destinationOptions={destinationOptions}
        filteredDestinationOptions={filteredDestinationOptions}
        searchingDestinations={searchingDestinations}
        clientConfig={{
          church_name: clientConfig.church_name,
          pastor_name: clientConfig.pastor_name,
          pastor_phone: clientConfig.pastor_phone,
        }}
        churchName={churchName}
        todayIso={todayIso}
        maxPregacaoIso={maxPregacaoIso}
        formatDateBr={formatDateBr}
        normalizeManualChurchDestination={normalizeManualChurchDestination}
        creatingLetter={creatingLetter}
        onSubmit={() => void handleCreateLetter()}
      />
    </div>
  );
}
