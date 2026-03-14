import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const REFRESH_INTERVAL_MS = 30000;
const LIST_MEMBERS_FUNCTION_NAME = (import.meta.env.VITE_LIST_MEMBERS_FUNCTION_NAME || "list-members").trim();
const LIST_LETTERS_FUNCTION_NAME = (import.meta.env.VITE_LIST_LETTERS_FUNCTION_NAME || "list-letters").trim();
const LIST_CHURCHES_FUNCTION_NAME = (import.meta.env.VITE_LIST_CHURCHES_FUNCTION_NAME || "list-churches-in-scope").trim();
const LIST_NOTIFICATIONS_FUNCTION_NAME = (import.meta.env.VITE_LIST_NOTIFICATIONS_FUNCTION_NAME || "list-notifications").trim();

type NotificationItem = { id: string; title: string; body: string; ts: number };
type ChurchRow = {
  totvs_id: string;
  parent_totvs_id?: string | null;
  church_name: string;
  class: string;
};
type LetterRow = {
  id: string;
  church_totvs_id: string;
  preacher_user_id?: string | null;
  preacher_name: string;
  minister_role: string;
  preach_date: string;
  church_origin: string;
  church_destination: string;
  created_at: string;
  status: string;
  preach_period?: string | null;
  preacher_phone?: string | null;
  phone?: string | null;
  email?: string | null;
  doc_id?: string | null;
  pdf_url?: string | null;
  url_carta?: string | null;
  released_by_name?: string | null;
  released_at?: string | null;
  sent_at?: string | null;
};
type MemberRow = {
  id: string;
  full_name: string;
  cpf?: string | null;
  phone: string;
  email?: string | null;
  minister_role?: string | null;
  default_totvs_id?: string | null;
  is_active: boolean;
  can_create_released_letter?: boolean;
  ordination_date?: string | null;
  baptism_date?: string | null;
  role: string;
};
type NotificationRow = {
  id: string;
  title: string;
  message?: string | null;
  created_at: string;
};

type ChurchesResponse = {
  ok?: boolean;
  churches?: ChurchRow[];
};

type MembersResponse = {
  ok?: boolean;
  members?: MemberRow[];
};

type LettersResponse = {
  ok?: boolean;
  letters?: LetterRow[];
};

type NotificationsResponse = {
  ok?: boolean;
  notifications?: NotificationRow[];
};

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-");
      return `${day}/${month}/${year}`;
    }
    return raw;
  }

  return date.toLocaleDateString("pt-BR");
};

const mapLetterStatus = (status: string) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "ENVIADA") return "Carta enviada";
  if (normalized === "LIBERADA") return "Carta liberada";
  if (normalized === "BLOQUEADO") return "Bloqueado";
  return "Aguardando liberacao";
};

const parseTotvsFromText = (value: string) => {
  const match = String(value || "").trim().match(/^(\d{3,})\b/);
  return match ? match[1] : "";
};

export function useSheetData() {
  const [url, setUrl] = useState("");
  const [customSheetName, setCustomSheetName] = useState("");
  const [cartas, setCartas] = useState<Record<string, string>[]>([]);
  const [obreiros, setObreiros] = useState<Record<string, string>[]>([]);
  const [sendStatusById, setSendStatusById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(Boolean(localStorage.getItem("app_token") || localStorage.getItem("session_key")));
  const [offline, setOffline] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [hasObreiros, setHasObreiros] = useState(false);
  const [cartasSheetUsed, setCartasSheetUsed] = useState("letters");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [churches, setChurches] = useState<ChurchRow[]>([]);

  const refresh = useCallback(async () => {
    const sessionToken = (localStorage.getItem("app_token") || localStorage.getItem("session_key") || "").trim();
    const userRole = (localStorage.getItem("user_role") || "").trim().toLowerCase();
    const activeTotvsId = (localStorage.getItem("totvs_church_id") || "").trim();
    if (!sessionToken) {
      setConnected(false);
      setCartas([]);
      setObreiros([]);
      setNotifications([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Comentario: a leitura do painel agora usa apenas Edge Functions.
      // Isso segue o padrão do projeto maior e evita os 401 do /rest/v1 com ES256.
      const [churchesResult, membersResult, lettersResult, notificationsResult] = await Promise.all([
        supabase.functions.invoke<ChurchesResponse>(LIST_CHURCHES_FUNCTION_NAME, {
          body: { page: 1, page_size: 500 },
        }),
        supabase.functions.invoke<MembersResponse>(LIST_MEMBERS_FUNCTION_NAME, {
          body: { page: 1, page_size: 500, roles: ["obreiro"] },
        }),
        supabase.functions.invoke<LettersResponse>(LIST_LETTERS_FUNCTION_NAME, {
          body: { page: 1, page_size: 500 },
        }),
        supabase.functions.invoke<NotificationsResponse>(LIST_NOTIFICATIONS_FUNCTION_NAME, {
          body: { page: 1, page_size: 50 },
        }),
      ]);

      if (churchesResult.error) throw churchesResult.error;
      if (membersResult.error) throw membersResult.error;
      if (lettersResult.error) throw lettersResult.error;
      if (notificationsResult.error) throw notificationsResult.error;

      const churches = churchesResult.data?.churches || [];
      const members = membersResult.data?.members || [];
      let letters = lettersResult.data?.letters || [];
      const notificationsRows = notificationsResult.data?.notifications || [];

      // Comentario: para pastor, o painel mostra apenas as cartas emitidas
      // pela church_origin da igreja ativa do login.
      if (userRole === "pastor" && activeTotvsId) {
        letters = letters.filter((row) => parseTotvsFromText(String(row.church_origin || "")) === activeTotvsId);
      }

      const churchByTotvs = new Map<string, ChurchRow>();
      churches.forEach((church) => {
        churchByTotvs.set(String(church.totvs_id || "").trim(), church);
      });

      const nextCartas = letters.map((row) => {
        const rawStatus = String(row.status || "").trim().toUpperCase();
        const phone = String(row.preacher_phone || row.phone || "").trim();
        const churchMeta = churchByTotvs.get(String(row.church_totvs_id || "").trim());

        return {
          id: String(row.id || "").trim(),
          doc_id: String(row.doc_id || "").trim(),
          raw_status: rawStatus,
          church_totvs_id: String(row.church_totvs_id || "").trim(),
          preacher_user_id: String(row.preacher_user_id || "").trim(),
          nome: String(row.preacher_name || "-").trim() || "-",
          telefone: phone || "-",
          email: String(row.email || "-").trim() || "-",
          data_emissao: formatDateBr(row.created_at),
          data_pregacao: formatDateBr(row.preach_date),
          data_ordenacao: "-",
          igreja_origem: String(row.church_origin || "-").trim() || "-",
          igreja_destino: String(row.church_destination || "-").trim() || "-",
          cargo: String(row.minister_role || "-").trim() || "-",
          funcao: String(row.minister_role || "-").trim() || "-",
          regiao: String(churchMeta?.class || "-").trim() || "-",
          status: mapLetterStatus(rawStatus),
          status_carta: rawStatus === "LIBERADA" || rawStatus === "ENVIADA" ? "LIBERADA" : rawStatus === "BLOQUEADO" ? "GERADA" : "GERADA",
          status_usuario: rawStatus === "BLOQUEADO" ? "BLOQUEADO" : "",
          envio: rawStatus === "ENVIADA" ? "ENVIADO" : "",
          drive_status: rawStatus === "ENVIADA" ? "CARTA_ENVIADA" : "",
          data_liberacao: formatDateBr(row.released_at),
          liberado_por: String(row.released_by_name || "-").trim() || "-",
          data_envio: formatDateBr(row.sent_at),
          url_pdf: String(row.pdf_url || row.url_carta || "").trim(),
          pdf_url: String(row.pdf_url || "").trim(),
          doc_url: String(row.url_carta || "").trim(),
        };
      });

      const nextObreiros = members.map((row) => {
        const church = churchByTotvs.get(String(row.default_totvs_id || "").trim());
        return {
          id: String(row.id || "").trim(),
          cpf: String(row.cpf || "").trim(),
          nome: String(row.full_name || "-").trim() || "-",
          cargo: String(row.minister_role || "-").trim() || "-",
          igreja: String(church?.church_name || row.default_totvs_id || "-").trim() || "-",
          campo: String(church?.class || "-").trim() || "-",
          status: row.is_active ? "AUTORIZADO" : "BLOQUEADO",
          status_usuario: row.is_active ? "" : "BLOQUEADO",
          status_carta: row.can_create_released_letter ? "LIBERADA" : "GERADA",
          can_create_released_letter: row.can_create_released_letter ? "1" : "0",
          data_ordenacao: formatDateBr(row.ordination_date),
          data_batismo: formatDateBr(row.baptism_date),
          telefone: String(row.phone || "-").trim() || "-",
          email: String(row.email || "-").trim() || "-",
          funcao: String(row.minister_role || "-").trim() || "-",
          regiao: String(church?.class || "-").trim() || "-",
          church_totvs_id: String(row.default_totvs_id || "").trim(),
          default_totvs_id: String(row.default_totvs_id || "").trim(),
        };
      });

      const nextNotifications = notificationsRows.map((row) => ({
        id: String(row.id || "").trim(),
        title: String(row.title || "Notificacao").trim() || "Notificacao",
        body: String(row.message || "").trim(),
        ts: new Date(String(row.created_at || "")).getTime() || Date.now(),
      }));

      setCartas(nextCartas);
      setObreiros(nextObreiros);
      setChurches(churches);
      setNotifications(nextNotifications);
      setSendStatusById({});
      setHasObreiros(nextObreiros.length > 0);
      setCartasSheetUsed("letters");
      setConnected(true);
      setOffline(false);
      setLastSyncAt(Date.now());
    } catch (err) {
      setCartas([]);
      setObreiros([]);
      setChurches([]);
      setNotifications([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar painel.");
      setOffline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async (_inputUrl?: string, _sheetName?: string, _options?: { silent?: boolean }) => {
    await refresh();
  }, [refresh]);

  const clearNotifications = useCallback(() => {
    // Comentario: por enquanto limpamos so o estado local do sino.
    // Se voce quiser depois, a gente liga isso a uma function de marcar lida.
    setNotifications([]);
  }, []);

  const disconnect = useCallback(() => {
      setCartas([]);
      setObreiros([]);
      setChurches([]);
      setNotifications([]);
    setConnected(false);
    setHasObreiros(false);
    setUrl("");
    setError(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!connected) return;

    const intervalId = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [connected, refresh]);

  return {
    url,
    setUrl,
    customSheetName,
    setCustomSheetName,
    cartas,
    obreiros,
    loading,
    error,
    connected,
    connect,
    disconnect,
    hasObreiros,
    cartasSheetUsed,
    notifications,
    churches,
    clearNotifications,
    sendStatusById,
    offline,
    lastSyncAt,
  };
}
