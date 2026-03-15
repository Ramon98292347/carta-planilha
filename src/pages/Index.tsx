import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Bell, Building2, CalendarDays, CheckCircle2, Download, FileText, Loader2, LogOut, Phone, Plus, Save, Search, UserCircle2, UserPlus } from "lucide-react";

import { useSheetData } from "@/hooks/useSheetData";
import { MetricCards } from "@/components/MetricCards";
import { AdminChurchDialog } from "@/components/AdminChurchDialog";
import { AdminUserDialog } from "@/components/AdminUserDialog";
import { PastorLetterDialog } from "@/components/PastorLetterDialog";
import { PastorProfileCard } from "@/components/PastorProfileCard";
import { Filters, FilterValues, emptyFilters } from "@/components/Filters";
import { DataTable, CARTAS_COLUMNS, OBREIROS_COLUMNS } from "@/components/DataTable";
import { parseDate } from "@/lib/sheets";
import { clearAppSession } from "@/lib/appSession";
import { formatCep, lookupCep, onlyDigits } from "@/lib/cep";
import { formatDateBr, normalizeManualChurchDestination, normalizeSearch } from "@/lib/churchFormatting";
import { buildChurchLabel, buildChurchTotvsSet, resolveAllowedOriginChurches, resolveParentChurch, resolveSelectedDestinationChurch, shouldUseParentOriginForDestination } from "@/lib/churchScope";
import { isPastorManagedLetter, isPastorManagedMember } from "@/lib/letterPermissions";
import { buildPastorCartaRowActions } from "@/lib/pastorCartaActions";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type UserFormState = {
  cpf: string;
  full_name: string;
  role: "pastor" | "obreiro";
  default_totvs_id: string;
  phone: string;
  email: string;
  minister_role: string;
  password: string;
  birth_date: string;
  sacramental_date: string;
  is_active: boolean;
  can_create_released_letter: boolean;
};

type ChurchFormState = {
  totvs_id: string;
  church_name: string;
  class: "estadual" | "setorial" | "central" | "regional" | "local";
  parent_totvs_id: string;
  contact_email: string;
  contact_phone: string;
  address_city: string;
  address_state: string;
  is_active: boolean;
};

type LetterTarget = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cargo: string;
  church_totvs_id?: string;
};

type PastorLetterFormState = {
  church_origin: string;
  church_destination: string;
  church_destination_manual: string;
  preach_date: string;
  preach_period: "MANHA" | "TARDE" | "NOITE";
};

type PastorProfileState = {
  nome: string;
  telefone: string;
  email: string;
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

type DestinationChurchRow = {
  totvs_id: string;
  parent_totvs_id?: string | null;
  church_name: string;
  class?: string;
};

const ministerialOptions = ["Membro", "Cooperador", "Diácono", "Presbítero", "Pastor"] as const;

const CARTAS_DETAIL_FIELDS = [
  { key: "nome", label: "Nome completo" },
  { key: "telefone", label: "Telefone" },
  { key: "cargo", label: "Cargo ministerial" },
  { key: "igreja_origem", label: "Igreja origem" },
  { key: "igreja_destino", label: "Igreja destino" },
  { key: "data_pregacao", label: "Data da pregação" },
  { key: "data_emissao", label: "Data da emissão" },
  { key: "status", label: "Status" },
  { key: "liberado_por", label: "Liberado por" },
];

const FILTERS_STORAGE_KEY = "cartas_filters";
const CREATE_LETTER_FUNCTION_NAME = (import.meta.env.VITE_CREATE_LETTER_FUNCTION_NAME || "create-letter").trim();
const MANAGE_LETTER_FUNCTION_NAME = (import.meta.env.VITE_MANAGE_LETTER_FUNCTION_NAME || "manage-letter").trim();
const LIST_CHURCHES_FUNCTION_NAME = (import.meta.env.VITE_LIST_CHURCHES_FUNCTION_NAME || "list-churches-in-scope").trim();
const GET_MY_PROFILE_FUNCTION_NAME = (import.meta.env.VITE_GET_MY_PROFILE_FUNCTION_NAME || "get-my-profile").trim();

const createEmptyUserForm = (role: "pastor" | "obreiro", activeTotvsId: string): UserFormState => ({
  cpf: "",
  full_name: "",
  role,
  default_totvs_id: activeTotvsId,
  phone: "",
  email: "",
  minister_role: "",
  password: "",
  birth_date: "",
  sacramental_date: "",
  is_active: true,
  can_create_released_letter: false,
});

const createEmptyChurchForm = (activeTotvsId: string): ChurchFormState => ({
  totvs_id: "",
  church_name: "",
  class: "local",
  parent_totvs_id: activeTotvsId,
  contact_email: "",
  contact_phone: "",
  address_city: "",
  address_state: "",
  is_active: true,
});

const createEmptyLetterForm = (): PastorLetterFormState => ({
  church_origin: "",
  church_destination: "",
  church_destination_manual: "",
  preach_date: "",
  preach_period: "NOITE",
});

const readPastorProfileFromStorage = (): PastorProfileState => ({
  nome: (localStorage.getItem("user_name") || localStorage.getItem("pastor_name") || "").trim(),
  telefone: onlyDigits(localStorage.getItem("user_phone") || localStorage.getItem("pastor_phone") || ""),
  email: (localStorage.getItem("user_email") || "").trim(),
  data_nascimento: (localStorage.getItem("pastor_data_nascimento") || "").trim(),
  data_ordenacao: (localStorage.getItem("pastor_data_ordenacao") || "").trim(),
  cargo_ministerial: (localStorage.getItem("minister_role") || localStorage.getItem("pastor_minister_role") || "Pastor").trim(),
  cep: (localStorage.getItem("pastor_cep") || "").trim(),
  endereco: (localStorage.getItem("pastor_endereco") || "").trim(),
  numero: (localStorage.getItem("pastor_numero") || "").trim(),
  complemento: (localStorage.getItem("pastor_complemento") || "").trim(),
  bairro: (localStorage.getItem("pastor_bairro") || "").trim(),
  cidade: (localStorage.getItem("pastor_cidade") || "").trim(),
  uf: (localStorage.getItem("pastor_uf") || "").trim(),
});

const mapSavedProfileToPastorProfile = (input: Record<string, unknown>, fallback: PastorProfileState): PastorProfileState => ({
  ...fallback,
  nome: String(input.full_name || fallback.nome || "").trim(),
  telefone: onlyDigits(String(input.phone || fallback.telefone || "")),
  email: String(input.email || fallback.email || "").trim(),
  data_nascimento: String(input.birth_date || fallback.data_nascimento || "").trim(),
  data_ordenacao: String(input.ordination_date || fallback.data_ordenacao || "").trim(),
  cargo_ministerial: String(input.minister_role || fallback.cargo_ministerial || "").trim(),
  cep: String(input.cep || fallback.cep || "").trim(),
  endereco: String(input.address_street || fallback.endereco || "").trim(),
  numero: String(input.address_number || fallback.numero || "").trim(),
  complemento: String(input.address_complement || fallback.complemento || "").trim(),
  bairro: String(input.address_neighborhood || fallback.bairro || "").trim(),
  cidade: String(input.address_city || fallback.cidade || "").trim(),
  uf: String(input.address_state || fallback.uf || "").trim().toUpperCase(),
});

const writePastorProfileToStorage = (profile: PastorProfileState) => {
  localStorage.setItem("user_name", profile.nome || "");
  localStorage.setItem("pastor_name", profile.nome || "");
  localStorage.setItem("user_phone", profile.telefone || "");
  localStorage.setItem("pastor_phone", profile.telefone || "");
  localStorage.setItem("user_email", profile.email || "");
  localStorage.setItem("minister_role", profile.cargo_ministerial || "");
  localStorage.setItem("pastor_minister_role", profile.cargo_ministerial || "");
  localStorage.setItem("pastor_data_nascimento", profile.data_nascimento || "");
  localStorage.setItem("pastor_data_ordenacao", profile.data_ordenacao || "");
  localStorage.setItem("pastor_cep", profile.cep || "");
  localStorage.setItem("pastor_endereco", profile.endereco || "");
  localStorage.setItem("pastor_numero", profile.numero || "");
  localStorage.setItem("pastor_complemento", profile.complemento || "");
  localStorage.setItem("pastor_bairro", profile.bairro || "");
  localStorage.setItem("pastor_cidade", profile.cidade || "");
  localStorage.setItem("pastor_uf", profile.uf || "");
};

const normalizeMinisterRole = (value: string) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getDerivedStatusForFilter = (row: Record<string, string>) => {
  const statusUsuario = String(row.status_usuario || row["Status Usuario"] || "").trim().toUpperCase();
  const statusCartaOperacional = String(row.obreiro_auth_status_carta || "").trim().toUpperCase();
  const statusCarta = String(row.status_carta || row["Status Carta"] || "").trim().toUpperCase();
  const envio = String(row.envio || row["Envio"] || "").trim().toUpperCase();

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (envio === "ENVIADO") return "Carta enviada";
  if (statusCartaOperacional === "LIBERADA") return "Liberado automatico";
  if (statusCarta === "LIBERADA") return "Carta liberada";
  return "Aguardando liberacao";
};

const isRowBlocked = (row: Record<string, string>) => String(row.status_usuario || row.status || "").trim().toUpperCase() === "BLOQUEADO";
const isAutoReleaseEnabled = (row: Record<string, string>) => String(row.status_carta || "").trim().toUpperCase() === "LIBERADA";
const isLetterBlocked = (row: Record<string, string>, linkedUser?: Record<string, string> | null) =>
  String(linkedUser?.status_usuario || row.status_usuario || "").trim().toUpperCase() === "BLOQUEADO" ||
  String(row.raw_status || "").trim().toUpperCase() === "BLOQUEADO";

const Index = () => {
  const { cartas, obreiros, churches, loading, connected, connect, disconnect, notifications, clearNotifications, error, lastSyncAt } = useSheetData();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("cartas");
  const [cartasFilters, setCartasFilters] = useState<FilterValues>(() => {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return emptyFilters;
    try {
      const parsed = JSON.parse(raw) as Partial<FilterValues> & { dateStart?: string | null; dateEnd?: string | null };
      return {
        ...emptyFilters,
        ...parsed,
        dateStart: parsed.dateStart ? new Date(parsed.dateStart) : undefined,
        dateEnd: parsed.dateEnd ? new Date(parsed.dateEnd) : undefined,
      };
    } catch {
      return emptyFilters;
    }
  });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [churchDialogOpen, setChurchDialogOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingChurch, setSavingChurch] = useState(false);
  const [letterDialogOpen, setLetterDialogOpen] = useState(false);
  const [creatingLetter, setCreatingLetter] = useState(false);
  const [letterTarget, setLetterTarget] = useState<LetterTarget | null>(null);
  const [letterForm, setLetterForm] = useState<PastorLetterFormState>(createEmptyLetterForm());
  const [pastorDestinationChurches, setPastorDestinationChurches] = useState<DestinationChurchRow[]>([]);
  const [loadingPastorDestinations, setLoadingPastorDestinations] = useState(false);
  const [pastorProfile, setPastorProfile] = useState<PastorProfileState>(() => readPastorProfileFromStorage());
  const [savingPastorProfile, setSavingPastorProfile] = useState(false);
  const [lookingUpPastorCep, setLookingUpPastorCep] = useState(false);

  const userRole = (localStorage.getItem("user_role") || "").trim().toLowerCase();
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const userName = (localStorage.getItem("user_name") || localStorage.getItem("pastor_name") || "").trim();
  const userPhone = (localStorage.getItem("user_phone") || localStorage.getItem("pastor_phone") || "").trim();
  const userMinisterRole = (localStorage.getItem("minister_role") || localStorage.getItem("pastor_minister_role") || "Pastor").trim();
  const activeTotvsId = (localStorage.getItem("totvs_church_id") || "").trim();
  const userId = (localStorage.getItem("user_id") || "").trim();

  const [userForm, setUserForm] = useState<UserFormState>(() => createEmptyUserForm(userRole === "admin" ? "obreiro" : "obreiro", activeTotvsId));
  const [churchForm, setChurchForm] = useState<ChurchFormState>(() => createEmptyChurchForm(activeTotvsId));

  useEffect(() => {
    const payload = {
      ...cartasFilters,
      dateStart: cartasFilters.dateStart ? cartasFilters.dateStart.toISOString() : null,
      dateEnd: cartasFilters.dateEnd ? cartasFilters.dateEnd.toISOString() : null,
    };
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [cartasFilters]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (userDialogOpen) {
      setUserForm(createEmptyUserForm(userRole === "admin" ? "obreiro" : "obreiro", activeTotvsId));
    }
  }, [userDialogOpen, activeTotvsId, userRole]);

  useEffect(() => {
    if (churchDialogOpen) {
      setChurchForm(createEmptyChurchForm(activeTotvsId));
    }
  }, [churchDialogOpen, activeTotvsId]);

  useEffect(() => {
    if (!letterDialogOpen) {
      setLetterForm(createEmptyLetterForm());
      setLetterTarget(null);
    }
  }, [letterDialogOpen]);

  useEffect(() => {
    if (userRole === "pastor") {
      setPastorProfile(readPastorProfileFromStorage());
    }
  }, [userRole, userId]);

  useEffect(() => {
    if (userRole !== "pastor" || !userId) return;

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; profile?: Record<string, unknown> }>(GET_MY_PROFILE_FUNCTION_NAME, {});
      if (cancelled || error || !data?.ok || !data.profile) return;

      const nextProfile = mapSavedProfileToPastorProfile(data.profile, readPastorProfileFromStorage());
      setPastorProfile(nextProfile);
      writePastorProfileToStorage(nextProfile);
    })();

    return () => {
      cancelled = true;
    };
  }, [userRole, userId]);

  const cartasWithSearch = useMemo(() => {
    return cartas.map((row) => ({ row, search: normalizeSearch(row.nome || "") }));
  }, [cartas]);

  const filteredCartas = useMemo(() => {
    return cartasWithSearch
      .filter(({ row, search }) => {
        const f = cartasFilters;
        if (f.search && !search.includes(normalizeSearch(f.search))) return false;
        if (f.igreja && row.igreja_origem !== f.igreja) return false;
        if (f.cargo && row.cargo !== f.cargo) return false;
        if (f.status && getDerivedStatusForFilter(row) !== f.status) return false;
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
      })
      .map(({ row }) => row);
  }, [cartasWithSearch, cartasFilters]);

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

  const obreirosLookup = useMemo(() => {
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
    const byId = new Map<string, Record<string, string>>();

    obreiros.forEach((row) => {
      const idKey = String(row.id || "").trim();
      if (idKey && !byId.has(idKey)) byId.set(idKey, row);

      const nameKey = normalizeName(row.nome);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);

      const phoneKey = normalizePhone(row.telefone);
      if (phoneKey && !byPhone.has(phoneKey)) byPhone.set(phoneKey, row);
    });

    return { byId, byName, byPhone, normalizeName, normalizePhone };
  }, [obreiros]);

  const connectedHeader = Boolean(churchName && userName && connected);
  const sacramentalDateLabel = useMemo(() => {
    const role = normalizeMinisterRole(userForm.minister_role);
    return role.includes("membro") ? "Data do batismo" : "Data da separação";
  }, [userForm.minister_role]);
  const loggedPastorTarget = useMemo<LetterTarget | null>(() => {
    if (userRole !== "pastor") return null;
    return {
      id: userId,
      nome: userName,
      telefone: userPhone,
      email: "",
      cargo: userMinisterRole,
      church_totvs_id: activeTotvsId,
    };
  }, [userRole, userId, userName, userPhone, userMinisterRole, activeTotvsId]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxPregacaoIso = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return limit.toISOString().slice(0, 10);
  }, []);

  const activeChurch = useMemo(
    () => churches.find((church) => String(church.totvs_id || "").trim() === activeTotvsId) || null,
    [churches, activeTotvsId],
  );
  const directParentTotvsId = String(activeChurch?.parent_totvs_id || "").trim();

  const parentChurch = useMemo(
    () => churches.find((church) => String(church.totvs_id || "").trim() === directParentTotvsId) || null,
    [churches, directParentTotvsId],
  );

  useEffect(() => {
    if (!letterDialogOpen || userRole !== "pastor") {
      setPastorDestinationChurches([]);
      setLoadingPastorDestinations(false);
      return;
    }

    if (!directParentTotvsId) {
      setPastorDestinationChurches(churches);
      setLoadingPastorDestinations(false);
      return;
    }

    let cancelled = false;
    setLoadingPastorDestinations(true);

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok?: boolean;
          churches?: DestinationChurchRow[];
        }>(LIST_CHURCHES_FUNCTION_NAME, {
          body: { page: 1, page_size: 1000, root_totvs_id: directParentTotvsId },
        });

        if (cancelled) return;

        if (error || !data?.ok || !data.churches) {
          setPastorDestinationChurches(churches);
          return;
        }

        setPastorDestinationChurches(data.churches);
      } finally {
        if (!cancelled) setLoadingPastorDestinations(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [letterDialogOpen, userRole, directParentTotvsId, churches]);

  const destinationSourceChurches = useMemo(
    () => (userRole === "pastor" ? (pastorDestinationChurches.length ? pastorDestinationChurches : churches) : churches),
    [userRole, pastorDestinationChurches, churches],
  );
  const resolvedParentChurch = useMemo(
    () => resolveParentChurch({ parentChurch, sourceChurches: destinationSourceChurches, directParentTotvsId }),
    [parentChurch, destinationSourceChurches, directParentTotvsId],
  );

  const allowedOrigins = useMemo(() => resolveAllowedOriginChurches(activeChurch, resolvedParentChurch), [activeChurch, resolvedParentChurch]);
  const destinationOptions = useMemo(
    () => destinationSourceChurches.map((church) => ({ value: buildChurchLabel(church), church })),
    [destinationSourceChurches],
  );
  const filteredPastorDestinationOptions = useMemo(() => {
    const term = normalizeSearch(letterForm.church_destination);
    if (term.length < 2 || letterForm.church_destination_manual.trim()) return [];
    return destinationOptions
      .filter(({ value, church }) => {
        const haystack = normalizeSearch(`${value} ${church.class || ""}`);
        return haystack.includes(term);
      })
      .slice(0, 12);
  }, [destinationOptions, letterForm.church_destination, letterForm.church_destination_manual]);
  const activeScopeTotvs = useMemo(() => buildChurchTotvsSet(churches), [churches]);
  const parentScopeTotvs = useMemo(() => buildChurchTotvsSet(destinationSourceChurches), [destinationSourceChurches]);
  const selectedPastorDestinationChurch = useMemo(
    () => resolveSelectedDestinationChurch(destinationSourceChurches, letterForm.church_destination),
    [destinationSourceChurches, letterForm.church_destination],
  );
  const shouldAdjustOriginToParent = useMemo(
    () =>
      shouldUseParentOriginForDestination({
        selectedDestinationChurch: selectedPastorDestinationChurch,
        activeChurch,
        resolvedParentChurch,
        parentScopeTotvs,
        activeScopeTotvs,
      }),
    [selectedPastorDestinationChurch, activeChurch, resolvedParentChurch, parentScopeTotvs, activeScopeTotvs],
  );

  const pastorPermissionContext = useMemo(
    () => ({ userRole, userId, activeTotvsId, activeScopeTotvs }),
    [userRole, userId, activeTotvsId, activeScopeTotvs],
  );

  useEffect(() => {
    if (!letterDialogOpen || !activeChurch) return;

    const requiredOrigin = shouldAdjustOriginToParent && resolvedParentChurch
      ? buildChurchLabel(resolvedParentChurch)
      : buildChurchLabel(activeChurch);

    setLetterForm((prev) => (prev.church_origin === requiredOrigin ? prev : { ...prev, church_origin: requiredOrigin }));
  }, [letterDialogOpen, shouldAdjustOriginToParent, resolvedParentChurch, activeChurch]);
  const selectedOriginChurch = useMemo(
    () => allowedOrigins.find((church) => buildChurchLabel(church) === letterForm.church_origin) || null,
    [allowedOrigins, letterForm.church_origin],
  );
  const previewSignerName = String((selectedOriginChurch as { pastor?: { full_name?: string } } | null)?.pastor?.full_name || selectedOriginChurch?.church_name || churchName || "Resolvido pela hierarquia").trim();
  const previewSignerPhone = String((selectedOriginChurch as { pastor?: { phone?: string } } | null)?.pastor?.phone || "Definido pela igreja de origem na geracao da carta").trim();

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  const handlePastorProfileChange = (field: keyof PastorProfileState, value: string) => {
    setPastorProfile((prev) => ({
      ...prev,
      [field]: field === "telefone" ? onlyDigits(value) : value,
    }));
  };

  const handlePastorCepLookup = async (value: string) => {
    const formatted = formatCep(value);
    setPastorProfile((prev) => ({ ...prev, cep: formatted }));

    if (onlyDigits(formatted).length !== 8) return;

    setLookingUpPastorCep(true);
    try {
      const result = await lookupCep(formatted);
      if (!result) {
        toast.error("CEP não encontrado.");
        return;
      }

      setPastorProfile((prev) => ({
        ...prev,
        cep: result.cep,
        endereco: result.street || prev.endereco,
        bairro: result.neighborhood || prev.bairro,
        cidade: result.city || prev.cidade,
        uf: result.state || prev.uf,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao consultar o CEP.");
    } finally {
      setLookingUpPastorCep(false);
    }
  };

  const handleSavePastorProfile = async () => {
    if (!pastorProfile.nome.trim()) {
      toast.error("Preencha o nome completo.");
      return;
    }

    if (!pastorProfile.telefone.trim()) {
      toast.error("Preencha o telefone.");
      return;
    }

    setSavingPastorProfile(true);
    try {
      const payload = {
        full_name: pastorProfile.nome.trim(),
        phone: pastorProfile.telefone.trim(),
        email: pastorProfile.email.trim() || null,
        birth_date: pastorProfile.data_nascimento.trim() || null,
        ordination_date: pastorProfile.data_ordenacao.trim() || null,
        minister_role: pastorProfile.cargo_ministerial.trim() || null,
        cep: pastorProfile.cep.trim() || null,
        address_street: pastorProfile.endereco.trim() || null,
        address_number: pastorProfile.numero.trim() || null,
        address_complement: pastorProfile.complemento.trim() || null,
        address_neighborhood: pastorProfile.bairro.trim() || null,
        address_city: pastorProfile.cidade.trim() || null,
        address_state: pastorProfile.uf.trim().toUpperCase() || null,
      };

      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; profile?: Record<string, unknown>; error?: string }>("save-my-profile", {
        body: payload,
      });

      if (error) throw error;
      if (!data?.ok || !data.profile) throw new Error(data?.error || "Falha ao salvar cadastro.");

      const nextProfile = mapSavedProfileToPastorProfile(data.profile, pastorProfile);
      setPastorProfile(nextProfile);
      writePastorProfileToStorage(nextProfile);
      toast.success("Cadastro atualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar cadastro.");
    } finally {
      setSavingPastorProfile(false);
    }
  };

  const handleSaveUser = async () => {
    if (!userForm.cpf.trim() || !userForm.full_name.trim() || !userForm.default_totvs_id.trim() || !userForm.phone.trim()) {
      toast.error("Preencha CPF, nome, TOTVS e telefone.");
      return;
    }

    setSavingUser(true);
    try {
      // Comentario: o role define acesso. O cargo ministerial vai no campo minister_role.
      const payload = {
        cpf: userForm.cpf,
        full_name: userForm.full_name,
        role: userRole === "admin" ? userForm.role : "obreiro",
        default_totvs_id: userForm.default_totvs_id,
        totvs_access: [{ totvs_id: userForm.default_totvs_id, role: userRole === "admin" ? userForm.role : "obreiro" }],
        phone: userForm.phone,
        email: userForm.email || null,
        minister_role: userForm.minister_role || null,
        password: userForm.password || null,
        birth_date: userForm.birth_date || null,
        baptism_date: normalizeMinisterRole(userForm.minister_role).includes("membro") ? userForm.sacramental_date || null : null,
        ordination_date: normalizeMinisterRole(userForm.minister_role).includes("membro") ? null : userForm.sacramental_date || null,
        is_active: userForm.is_active,
        can_create_released_letter: userForm.can_create_released_letter,
      };

      const { data, error } = await supabase.functions.invoke("save-user", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao salvar usuário.");

      toast.success("Usuário salvo no banco novo.");
      setUserDialogOpen(false);
      await connect("", "", { silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar usuário.";
      toast.error(message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleSaveChurch = async () => {
    if (!churchForm.totvs_id.trim() || !churchForm.church_name.trim()) {
      toast.error("Preencha o TOTVS e o nome da igreja.");
      return;
    }

    setSavingChurch(true);
    try {
      const payload = {
        totvs_id: churchForm.totvs_id,
        church_name: churchForm.church_name,
        class: churchForm.class,
        parent_totvs_id: churchForm.class === "estadual" ? null : churchForm.parent_totvs_id || null,
        contact_email: churchForm.contact_email || null,
        contact_phone: churchForm.contact_phone || null,
        address_city: churchForm.address_city || null,
        address_state: churchForm.address_state || null,
        is_active: churchForm.is_active,
      };

      const { data, error } = await supabase.functions.invoke("save-church", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao salvar igreja.");

      toast.success("Igreja salva no banco novo.");
      setChurchDialogOpen(false);
      await connect("", "", { silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar igreja.";
      toast.error(message);
    } finally {
      setSavingChurch(false);
    }
  };

  const handleToggleUserBlock = async (row: Record<string, string>) => {
    const nextActive = isRowBlocked(row);
    try {
      const payload = {
        cpf: row.cpf || "",
        full_name: row.nome || "",
        role: userRole === "admin" && String(row.role || "").trim().toLowerCase() === "pastor" ? "pastor" : "obreiro",
        default_totvs_id: row.default_totvs_id || activeTotvsId,
        totvs_access: [{ totvs_id: row.default_totvs_id || activeTotvsId, role: userRole === "admin" && String(row.role || "").trim().toLowerCase() === "pastor" ? "pastor" : "obreiro" }],
        phone: row.telefone || "",
        email: row.email || null,
        minister_role: row.cargo || null,
        is_active: nextActive,
        can_create_released_letter: isAutoReleaseEnabled(row),
      };

      const { data, error } = await supabase.functions.invoke("save-user", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao atualizar usuario.");

      toast.success(nextActive ? "Usuario desbloqueado com sucesso." : "Usuario bloqueado com sucesso.");
      await connect("", "", { silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar bloqueio.");
    }
  };

  const handleToggleAutoRelease = async (row: Record<string, string>) => {
    if (isRowBlocked(row)) {
      toast.error("Usuario bloqueado nao pode ter liberacao automatica.");
      return;
    }

    const nextAutoRelease = !isAutoReleaseEnabled(row);
    try {
      const payload = {
        cpf: row.cpf || "",
        full_name: row.nome || "",
        role: userRole === "admin" && String(row.role || "").trim().toLowerCase() === "pastor" ? "pastor" : "obreiro",
        default_totvs_id: row.default_totvs_id || activeTotvsId,
        totvs_access: [{ totvs_id: row.default_totvs_id || activeTotvsId, role: userRole === "admin" && String(row.role || "").trim().toLowerCase() === "pastor" ? "pastor" : "obreiro" }],
        phone: row.telefone || "",
        email: row.email || null,
        minister_role: row.cargo || null,
        is_active: true,
        can_create_released_letter: nextAutoRelease,
      };

      const { data, error } = await supabase.functions.invoke("save-user", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao atualizar liberacao automatica.");

      toast.success(nextAutoRelease ? "Liberacao automatica ativada." : "Liberacao automatica desativada.");
      await connect("", "", { silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar liberacao automatica.");
    }
  };

  const openLetterDialogForTarget = (target: LetterTarget) => {
    const defaultOrigin = allowedOrigins[0] ? buildChurchLabel(allowedOrigins[0]) : churchName;
    setLetterTarget(target);
    setLetterForm({
      church_origin: defaultOrigin,
      church_destination: "",
      church_destination_manual: "",
      preach_date: "",
      preach_period: "NOITE",
    });
    setLetterDialogOpen(true);
  };

  const handleCreateLetter = async () => {
    if (!letterTarget) {
      toast.error("Pregador nao definido.");
      return;
    }
    if (!letterForm.church_origin.trim()) {
      toast.error("Selecione a igreja de origem.");
      return;
    }
    const finalDestination = letterForm.church_destination.trim() || normalizeManualChurchDestination(letterForm.church_destination_manual);
    if (!finalDestination) {
      toast.error("Selecione a igreja de destino.");
      return;
    }
    if (!letterForm.preach_date.trim()) {
      toast.error("Informe a data da pregacao.");
      return;
    }

    setCreatingLetter(true);
    try {
      const manualDestination = !!letterForm.church_destination_manual.trim();
      const payload = {
        preacher_user_id: letterTarget.id || null,
        preacher_name: letterTarget.nome,
        minister_role: letterTarget.cargo,
        preach_date: letterForm.preach_date,
        preach_period: letterForm.preach_period,
        church_origin: letterForm.church_origin,
        church_destination: finalDestination,
        manual_destination: manualDestination,
        phone: letterTarget.telefone || null,
        email: letterTarget.email || null,
      };

      const { data, error } = await supabase.functions.invoke(CREATE_LETTER_FUNCTION_NAME, { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "Falha ao criar carta.");

      toast.success("Carta criada com sucesso.");
      setLetterDialogOpen(false);
      await connect("", "", { silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar carta.");
    } finally {
      setCreatingLetter(false);
    }
  };

  const handleManageLetter = async (row: Record<string, string>, action: "release" | "share" | "delete") => {
    const letterId = String(row.id || "").trim();
    if (!letterId) {
      toast.error("Carta sem identificador.");
      return;
    }

    const { data, error } = await supabase.functions.invoke(MANAGE_LETTER_FUNCTION_NAME, {
      body: { letter_id: letterId, action },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.details || data?.error || "Falha ao atualizar carta.");
  };

  const shareLetterOnWhatsApp = (row: Record<string, string>) => {
    const nome = String(row.nome || "registro").trim() || "registro";
    const directUrl = String(row.url_pdf || row.pdf_url || row.doc_url || "").trim();
    if (!directUrl) {
      toast.error("PDF da carta ainda nao esta disponivel para compartilhar.");
      return false;
    }

    const message = `Confira esta carta de ${nome}: ${directUrl}`;
    const rawPhone = String(row.telefone || "").trim();
    let digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  };

  const resolveObreiroFromCarta = (row: Record<string, string>) => {
    const linkedUserId = String(row.linked_user_id || "").trim();
    if (linkedUserId) {
      return {
        id: linkedUserId,
        nome: String(row.linked_user_nome || row.nome || "").trim(),
        telefone: String(row.linked_user_telefone || row.telefone || "").trim(),
        email: String(row.linked_user_email || row.email || "").trim(),
        cargo: String(row.linked_user_cargo || row.cargo || "").trim(),
        church_totvs_id: String(row.linked_user_default_totvs_id || row.church_totvs_id || "").trim(),
        default_totvs_id: String(row.linked_user_default_totvs_id || row.church_totvs_id || "").trim(),
        status_usuario: String(row.linked_user_status || "").trim(),
        status_carta: String(row.linked_user_status_carta || "").trim(),
        can_create_released_letter: String(row.linked_user_auto_release || "0").trim(),
        role: String(row.linked_user_role || "").trim(),
      } as unknown as Record<string, string>;
    }

    const userIdKey = String(row.preacher_user_id || "").trim();
    if (userIdKey) {
      if (loggedPastorTarget && userIdKey === loggedPastorTarget.id) return loggedPastorTarget as unknown as Record<string, string>;
      const hit = obreirosLookup.byId.get(userIdKey);
      if (hit) return hit;
    }

    const phoneKey = obreirosLookup.normalizePhone(row.telefone);
    if (phoneKey) {
      const hit = obreirosLookup.byPhone.get(phoneKey);
      if (hit) return hit;
    }

    const nameKey = obreirosLookup.normalizeName(row.nome);
    return obreirosLookup.byName.get(nameKey) ?? null;
  };

  const previewDestination = (letterForm.church_destination || letterForm.church_destination_manual).trim();
  const previewOriginName =
    allowedOrigins.find((church) => buildChurchLabel(church) === letterForm.church_origin)?.church_name ||
    letterForm.church_origin ||
    churchName ||
    "";

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
              <p className="text-xs text-muted-foreground">Cartas, obreiros e notificações do banco novo</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="flex items-center gap-2 sm:order-2 sm:ml-auto">
              <div className="rounded-md border px-2 py-1 text-xs text-muted-foreground" title={connectedHeader ? "Conectado" : "Sessão incompleta"}>
                <div>Igreja: {churchName || "—"}</div>
                <div>Usuário: {userName || "—"}</div>
              </div>
              <div className="flex h-full items-center" title={connectedHeader ? "Conectado" : "Sessão incompleta"}>
                {connectedHeader ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:order-1">
              {installPrompt && (
                <Button type="button" variant="outline" onClick={handleInstall} className="gap-1">
                  <Download className="h-4 w-4" /> Instalar app
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setUserDialogOpen(true)} className="gap-1">
                <UserPlus className="h-4 w-4" /> Cadastrar usuário
              </Button>
              <Button type="button" variant="outline" onClick={() => setChurchDialogOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Cadastrar igreja
              </Button>
              {userRole === "pastor" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    openLetterDialogForTarget({
                      id: userId,
                      nome: userName,
                      telefone: userPhone,
                      email: "",
                      cargo: userMinisterRole,
                      church_totvs_id: activeTotvsId,
                    })}
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" /> Minha carta
                </Button>
              )}
              {userRole !== "obreiro" && (
                <Button type="button" variant="outline" onClick={() => navigate("/divulgacao")}>
                  Divulgação
                </Button>
              )}
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
                  <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <DropdownMenuItem className="text-muted-foreground">Sem notificações</DropdownMenuItem>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1">
                        <span className="text-xs font-semibold">{n.title}</span>
                        <span className="text-xs text-muted-foreground">{n.body || "Sem mensagem adicional"}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearNotifications} className="text-xs text-rose-700">
                    Marcar como lidas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  disconnect();
                  clearAppSession();
                  navigate("/login", { replace: true });
                }}
                className="gap-1"
              >
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!loading && lastSyncAt && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Última atualização: {new Date(lastSyncAt).toLocaleString()}
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
            <MetricCards cartas={filteredCartas} obreiros={obreiros} churches={churches} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max w-full sm:w-auto">
                  <TabsTrigger value="cartas" className="gap-1.5">
                    <FileText className="h-4 w-4" /> Cartas ({filteredCartas.length})
                  </TabsTrigger>
                  <TabsTrigger value="obreiros" className="gap-1.5">
                    Obreiros ({obreiros.length})
                  </TabsTrigger>
                  {userRole === "pastor" && (
                    <TabsTrigger value="cadastro" className="gap-1.5">
                      <UserCircle2 className="h-4 w-4" /> Meu cadastro
                    </TabsTrigger>
                  )}
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
                  actionsVariant="detailsOnly"
                  highlightStatus={false}
                  rowActions={(row) =>
                    buildPastorCartaRowActions({
                      row,
                      userRole,
                      pastorPermissionContext,
                      resolveObreiroFromCarta,
                      isLetterBlocked,
                      isRowBlocked,
                      isAutoReleaseEnabled,
                      handleManageLetter,
                      handleToggleUserBlock,
                      handleToggleAutoRelease,
                      openLetterDialogForTarget,
                      shareLetterOnWhatsApp,
                      connect,
                      toast,
                    })
                  }
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
                  rowActions={(row) => [
                    ...(userRole === "pastor"
                      ? [
                          {
                            label: "Carta",
                            onClick: () =>
                              openLetterDialogForTarget({
                                id: row.id || "",
                                nome: row.nome || "",
                                telefone: row.telefone || "",
                                email: row.email || "",
                                cargo: row.cargo || "",
                                church_totvs_id: row.church_totvs_id || row.default_totvs_id || "",
                              }),
                            disabled: isRowBlocked(row),
                          },
                        ]
                      : []),
                    {
                      label: isRowBlocked(row) ? "Desbloquear usuario" : "Bloquear usuario",
                      onClick: () => handleToggleUserBlock(row),
                      disabled: !isPastorManagedMember(pastorPermissionContext, row),
                    },
                    {
                      label: `Liberacao automatica: ${isAutoReleaseEnabled(row) ? "ON" : "OFF"}`,
                      onClick: () => handleToggleAutoRelease(row),
                      disabled: isRowBlocked(row) || !isPastorManagedMember(pastorPermissionContext, row),
                    },
                  ]}
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

              {userRole === "pastor" && (
                <TabsContent value="cadastro" className="mt-4">
                  <PastorProfileCard
                    profile={pastorProfile}
                    ministerialOptions={ministerialOptions}
                    lookingUpCep={lookingUpPastorCep}
                    saving={savingPastorProfile}
                    onChange={handlePastorProfileChange}
                    onCepChange={(value) => void handlePastorCepLookup(value)}
                    onSave={() => void handleSavePastorProfile()}
                  />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}

        {!connected && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-lg font-display font-semibold text-foreground">Sessão não encontrada</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Faça login novamente para carregar as cartas e os cadastros do banco novo.
            </p>
          </div>
        )}
      </main>

      <AdminUserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        userForm={userForm}
        setUserForm={setUserForm}
        ministerialOptions={ministerialOptions}
        sacramentalDateLabel={sacramentalDateLabel}
        userRole={userRole}
        saving={savingUser}
        onSave={handleSaveUser}
      />

      <AdminChurchDialog
        open={churchDialogOpen}
        onOpenChange={setChurchDialogOpen}
        churchForm={churchForm}
        setChurchForm={setChurchForm}
        saving={savingChurch}
        onSave={handleSaveChurch}
      />

      <PastorLetterDialog
        open={letterDialogOpen}
        onOpenChange={setLetterDialogOpen}
        letterTarget={letterTarget}
        letterForm={letterForm}
        setLetterForm={setLetterForm}
        allowedOrigins={allowedOrigins}
        destinationOptions={destinationOptions}
        filteredPastorDestinationOptions={filteredPastorDestinationOptions}
        loadingPastorDestinations={loadingPastorDestinations}
        shouldAdjustOriginToParent={shouldAdjustOriginToParent}
        resolvedParentChurch={resolvedParentChurch}
        todayIso={todayIso}
        maxPregacaoIso={maxPregacaoIso}
        formatDateBr={formatDateBr}
        normalizeManualChurchDestination={normalizeManualChurchDestination}
        previewOriginName={previewOriginName}
        previewDestination={previewDestination}
        previewSignerName={previewSignerName}
        previewSignerPhone={previewSignerPhone}
        creatingLetter={creatingLetter}
        onSubmit={() => void handleCreateLetter()}
      />
    </div>
  );
};

export default Index;

