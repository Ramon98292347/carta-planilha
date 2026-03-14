import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Bell, Building2, CalendarDays, CheckCircle2, Download, FileText, Loader2, LogOut, Phone, Plus, Search, UserCircle2, UserPlus } from "lucide-react";

import { useSheetData } from "@/hooks/useSheetData";
import { MetricCards } from "@/components/MetricCards";
import { Filters, FilterValues, emptyFilters } from "@/components/Filters";
import { DataTable, CARTAS_COLUMNS, OBREIROS_COLUMNS } from "@/components/DataTable";
import { parseDate } from "@/lib/sheets";
import { clearAppSession } from "@/lib/appSession";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const normalizeSearch = (value: string) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const formatDateBr = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const getDerivedStatusForFilter = (row: Record<string, string>) => {
  const status = String(row.status || "").trim();
  if (status) return status;

  const statusUsuario = String(row.status_usuario || row["Status Usuario"] || "").trim().toUpperCase();
  const statusCarta = String(row.status_carta || row["Status Carta"] || "").trim().toUpperCase();
  const envio = String(row.envio || row["Envio"] || "").trim().toUpperCase();

  if (statusUsuario === "BLOQUEADO") return "Bloqueado";
  if (envio === "ENVIADO") return "Carta enviada";
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

  const userRole = (localStorage.getItem("user_role") || "").trim().toLowerCase();
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const userName = (localStorage.getItem("user_name") || localStorage.getItem("pastor_name") || "").trim();
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
  const loggedPastorTarget = useMemo<LetterTarget | null>(() => {
    if (userRole !== "pastor") return null;
    return {
      id: userId,
      nome: userName,
      telefone: "",
      email: "",
      cargo: "Pastor",
      church_totvs_id: activeTotvsId,
    };
  }, [userRole, userId, userName, activeTotvsId]);
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

  const parentChurch = useMemo(
    () => churches.find((church) => String(church.totvs_id || "").trim() === String(activeChurch?.parent_totvs_id || "").trim()) || null,
    [churches, activeChurch],
  );

  const allowedOrigins = useMemo(() => {
    const list = [];
    if (activeChurch) list.push(activeChurch);
    if (parentChurch && parentChurch.totvs_id !== activeChurch?.totvs_id) list.push(parentChurch);
    return list;
  }, [activeChurch, parentChurch]);

  const destinationOptions = useMemo(
    () => churches.map((church) => ({ value: `${church.totvs_id} - ${church.church_name}`, church })),
    [churches],
  );

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
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
    const defaultOrigin = allowedOrigins[0] ? `${allowedOrigins[0].totvs_id} - ${allowedOrigins[0].church_name}` : churchName;
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
    const finalDestination = (letterForm.church_destination || letterForm.church_destination_manual).trim();
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
      const payload = {
        preacher_user_id: letterTarget.id || null,
        preacher_name: letterTarget.nome,
        minister_role: letterTarget.cargo,
        preach_date: letterForm.preach_date,
        preach_period: letterForm.preach_period,
        church_origin: letterForm.church_origin,
        church_destination: finalDestination,
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
    allowedOrigins.find((church) => `${church.totvs_id} - ${church.church_name}` === letterForm.church_origin)?.church_name ||
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
                      telefone: "",
                      email: "",
                      cargo: "Pastor",
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
                  actionsVariant="detailsOnly"
                  highlightStatus={false}
                  rowActions={(row) => {
                    const obreiro = resolveObreiroFromCarta(row);
                    const rawStatus = String(row.raw_status || "").trim().toUpperCase();
                    const blocked = isLetterBlocked(row, obreiro);
                    const isEnviado = rawStatus === "ENVIADA";
                    const canLiberar = !blocked && rawStatus === "AGUARDANDO_LIBERACAO";
                    const canCompartilhar = !blocked && (rawStatus === "LIBERADA" || rawStatus === "ENVIADA");

                    const actions = [];

                    actions.push(
                      {
                        label: canLiberar ? "Liberar carta" : "Detalhes da carta",
                        onClick: async () => {
                          if (!canLiberar) return;
                          try {
                            await handleManageLetter(row, "release");
                            toast.success("Carta liberada com sucesso.");
                            await connect("", "", { silent: true });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Falha ao liberar carta.");
                          }
                        },
                        disabled: !canLiberar,
                      },
                      ...(userRole === "pastor"
                        ? [
                            {
                              label: "Carta",
                              onClick: () =>
                                openLetterDialogForTarget({
                                  id: obreiro?.id || String(row.preacher_user_id || "").trim(),
                                  nome: obreiro?.nome || row.nome || "",
                                  telefone: obreiro?.telefone || row.telefone || "",
                                  email: obreiro?.email || row.email || "",
                                  cargo: obreiro?.cargo || row.cargo || "",
                                  church_totvs_id: row.church_totvs_id || obreiro?.church_totvs_id || obreiro?.default_totvs_id || "",
                                }),
                              disabled: Boolean(obreiro && isRowBlocked(obreiro)),
                            },
                          ]
                        : []),
                    );

                    if (obreiro) {
                      actions.push(
                        {
                          label: isRowBlocked(obreiro) ? "Desbloquear usuario" : "Bloquear usuario",
                          onClick: () => handleToggleUserBlock(obreiro),
                        },
                        {
                          label: `Liberacao automatica: ${isAutoReleaseEnabled(obreiro) ? "ON" : "OFF"}`,
                          onClick: () => handleToggleAutoRelease(obreiro),
                          disabled: isRowBlocked(obreiro),
                        },
                      );
                    } else {
                      actions.push({
                        label: "Obreiro nao vinculado",
                        onClick: () => {},
                        disabled: true,
                      });
                    }

                    actions.push(
                      {
                        label: "Compartilhar",
                        onClick: async () => {
                          const opened = shareLetterOnWhatsApp(row);
                          if (!opened) return;
                          try {
                            await handleManageLetter(row, "share");
                            await connect("", "", { silent: true });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Falha ao marcar carta como enviada.");
                          }
                        },
                        disabled: !canCompartilhar || isEnviado,
                      },
                      {
                        label: "Excluir",
                        onClick: async () => {
                          try {
                            await handleManageLetter(row, "delete");
                            toast.success("Carta excluida com sucesso.");
                            await connect("", "", { silent: true });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Falha ao excluir carta.");
                          }
                        },
                        destructive: true,
                        disabled: rawStatus === "EXCLUIDA",
                      },
                    );

                    return actions;
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
                    },
                    {
                      label: `Liberacao automatica: ${isAutoReleaseEnabled(row) ? "ON" : "OFF"}`,
                      onClick: () => handleToggleAutoRelease(row),
                      disabled: isRowBlocked(row),
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

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cadastrar usuário</DialogTitle>
            <DialogDescription>
              O role define acesso. O cargo ministerial fica no campo separado para manter a regra do sistema limpa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={userForm.cpf} onChange={(e) => setUserForm((prev) => ({ ...prev, cpf: e.target.value }))} placeholder="00000000000" />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={userForm.full_name} onChange={(e) => setUserForm((prev) => ({ ...prev, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={userForm.phone} onChange={(e) => setUserForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Cargo ministerial</Label>
              <Input value={userForm.minister_role} onChange={(e) => setUserForm((prev) => ({ ...prev, minister_role: e.target.value }))} placeholder="Pastor, Presbítero, Diácono..." />
            </div>
            <div className="space-y-2">
              <Label>Senha inicial</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento</Label>
              <Input type="date" value={userForm.birth_date} onChange={(e) => setUserForm((prev) => ({ ...prev, birth_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>TOTVS da igreja</Label>
              <Input value={userForm.default_totvs_id} onChange={(e) => setUserForm((prev) => ({ ...prev, default_totvs_id: e.target.value }))} />
            </div>
            {userRole === "admin" && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={userForm.role} onValueChange={(value: "pastor" | "obreiro") => setUserForm((prev) => ({ ...prev, role: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obreiro">Obreiro</SelectItem>
                    <SelectItem value="pastor">Pastor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Status inicial</Label>
              <Select value={userForm.is_active ? "ativo" : "inativo"} onValueChange={(value) => setUserForm((prev) => ({ ...prev, is_active: value === "ativo" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Liberacao automatica</Label>
              <Select
                value={userForm.can_create_released_letter ? "on" : "off"}
                onValueChange={(value) => setUserForm((prev) => ({ ...prev, can_create_released_letter: value === "on" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a liberacao" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">OFF</SelectItem>
                  <SelectItem value="on">ON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUserDialogOpen(false)} disabled={savingUser}>Cancelar</Button>
            <Button onClick={handleSaveUser} disabled={savingUser}>
              {savingUser ? "Salvando..." : "Salvar usuário"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={churchDialogOpen} onOpenChange={setChurchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cadastrar igreja</DialogTitle>
            <DialogDescription>
              Aqui a gente grava a igreja na hierarquia nova. O parent TOTVS define em qual nível ela entra.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>TOTVS</Label>
              <Input value={churchForm.totvs_id} onChange={(e) => setChurchForm((prev) => ({ ...prev, totvs_id: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Nome da igreja</Label>
              <Input value={churchForm.church_name} onChange={(e) => setChurchForm((prev) => ({ ...prev, church_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Classe</Label>
              <Select value={churchForm.class} onValueChange={(value: ChurchFormState["class"]) => setChurchForm((prev) => ({ ...prev, class: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a classe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estadual">Estadual</SelectItem>
                  <SelectItem value="setorial">Setorial</SelectItem>
                  <SelectItem value="central">Central</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parent TOTVS</Label>
              <Input value={churchForm.parent_totvs_id} onChange={(e) => setChurchForm((prev) => ({ ...prev, parent_totvs_id: e.target.value }))} disabled={churchForm.class === "estadual"} />
            </div>
            <div className="space-y-2">
              <Label>Email de contato</Label>
              <Input value={churchForm.contact_email} onChange={(e) => setChurchForm((prev) => ({ ...prev, contact_email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone de contato</Label>
              <Input value={churchForm.contact_phone} onChange={(e) => setChurchForm((prev) => ({ ...prev, contact_phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={churchForm.address_city} onChange={(e) => setChurchForm((prev) => ({ ...prev, address_city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input value={churchForm.address_state} onChange={(e) => setChurchForm((prev) => ({ ...prev, address_state: e.target.value }))} maxLength={2} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={churchForm.is_active ? "ativo" : "inativo"} onValueChange={(value) => setChurchForm((prev) => ({ ...prev, is_active: value === "ativo" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativa</SelectItem>
                  <SelectItem value="inativo">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setChurchDialogOpen(false)} disabled={savingChurch}>Cancelar</Button>
            <Button onClick={handleSaveChurch} disabled={savingChurch}>
              {savingChurch ? "Salvando..." : "Salvar igreja"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={letterDialogOpen} onOpenChange={setLetterDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Registro de Carta de Pregacao</DialogTitle>
            <DialogDescription>
              O pastor pode tirar carta para o usuario da linha ou para si mesmo. A origem segue a regra da igreja dele e da igreja mae.
            </DialogDescription>
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
                  <Input value={letterTarget?.nome || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={letterTarget?.telefone || ""} disabled placeholder="Telefone do pregador" />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que faz a carta (origem)</Label>
                  <Select value={letterForm.church_origin} onValueChange={(value) => setLetterForm((prev) => ({ ...prev, church_origin: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a origem" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedOrigins.map((church) => (
                        <SelectItem key={church.totvs_id} value={`${church.totvs_id} - ${church.church_name}`}>
                          {church.totvs_id} - {church.church_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Funcao ministerial</Label>
                  <Input value={letterTarget?.cargo || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que vai pregar (destino)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      list="pastor-destino-igrejas-list"
                      value={letterForm.church_destination}
                      onChange={(e) =>
                        setLetterForm((prev) => ({
                          ...prev,
                          church_destination: e.target.value,
                          church_destination_manual: "",
                        }))
                      }
                      placeholder="Digite o TOTVS ou nome da igreja"
                      disabled={!!letterForm.church_destination_manual.trim()}
                      className="pl-10"
                    />
                    <datalist id="pastor-destino-igrejas-list">
                      {destinationOptions.map(({ value }) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Outros (se nao encontrar)</Label>
                  <Input
                    value={letterForm.church_destination_manual}
                    onChange={(e) =>
                      setLetterForm((prev) => ({
                        ...prev,
                        church_destination_manual: e.target.value,
                        church_destination: "",
                      }))
                    }
                    placeholder="Digite a igreja manualmente"
                    disabled={!!letterForm.church_destination.trim()}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data da pregacao</Label>
                    <Input
                      type="date"
                      min={todayIso}
                      max={maxPregacaoIso}
                      value={letterForm.preach_date}
                      onChange={(e) => setLetterForm((prev) => ({ ...prev, preach_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de emissao da carta</Label>
                    <Input value={formatDateBr(todayIso)} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Periodo</Label>
                  <Select
                    value={letterForm.preach_period}
                    onValueChange={(value: "MANHA" | "TARDE" | "NOITE") => setLetterForm((prev) => ({ ...prev, preach_period: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o periodo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANHA">Manha</SelectItem>
                      <SelectItem value="TARDE">Tarde</SelectItem>
                      <SelectItem value="NOITE">Noite</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <span className="text-base font-semibold sm:text-lg">{letterTarget?.nome || "Nao informado"}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{previewOriginName || "Nao informada"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span>{previewDestination || "-"}</span>
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
                      <span>{letterForm.preach_date ? formatDateBr(letterForm.preach_date) : "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{parentChurch?.church_name || activeChurch?.church_name || churchName || "Resolvido pela hierarquia"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{letterTarget?.telefone || "Definido pela igreja de origem na geracao da carta"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setLetterDialogOpen(false)} className="w-full sm:w-auto" disabled={creatingLetter}>
              Fechar
            </Button>
            <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={() => void handleCreateLetter()} disabled={creatingLetter}>
              {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar carta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;

