import { useCallback, useEffect, useState } from "react";
import { buildChurchByTotvs, buildMemberLookups, filterLettersForPastorScope, mapLettersToCartas, mapMembersToObreiros, mapNotifications } from "@/lib/sheetPanelMappers";
import { supabase } from "@/lib/supabase";

const LIST_MEMBERS_FUNCTION_NAME = (import.meta.env.VITE_LIST_MEMBERS_FUNCTION_NAME || "list-members").trim();
const LIST_LETTERS_FUNCTION_NAME = (import.meta.env.VITE_LIST_LETTERS_FUNCTION_NAME || "list-letters").trim();
const LIST_CHURCHES_FUNCTION_NAME = (import.meta.env.VITE_LIST_CHURCHES_FUNCTION_NAME || "list-churches-in-scope").trim();
const LIST_NOTIFICATIONS_FUNCTION_NAME = (import.meta.env.VITE_LIST_NOTIFICATIONS_FUNCTION_NAME || "list-notifications").trim();
const MARK_NOTIFICATIONS_READ_FUNCTION_NAME = (import.meta.env.VITE_MARK_NOTIFICATIONS_READ_FUNCTION_NAME || "mark-notifications-read").trim();

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
  signer_user_id?: string | null;
  signer_totvs_id?: string | null;
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
          body: { page: 1, page_size: 500, roles: ["obreiro", "pastor"] },
        }),
        supabase.functions.invoke<LettersResponse>(LIST_LETTERS_FUNCTION_NAME, {
          body: { page: 1, page_size: 500 },
        }),
        supabase.functions.invoke<NotificationsResponse>(LIST_NOTIFICATIONS_FUNCTION_NAME, {
          body: { page: 1, page_size: 50, unread_only: true },
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

      const churchByTotvs = buildChurchByTotvs(churches);

      if (userRole === "pastor" && activeTotvsId) {
        letters = filterLettersForPastorScope(letters, churches, activeTotvsId);
      }

      const { memberById, memberByPhone } = buildMemberLookups(members);
      const nextCartas = mapLettersToCartas(letters, churchByTotvs, memberById, memberByPhone);
      const nextObreiros = mapMembersToObreiros(members, churchByTotvs);
      const nextNotifications = mapNotifications(notificationsRows);

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
      const rawMessage = err instanceof Error ? err.message : "Erro ao carregar painel.";
      const lowered = rawMessage.toLowerCase();
      const friendlyMessage =
        lowered.includes("401") || lowered.includes("unauthorized") || lowered.includes("jwt")
          ? "Sessao expirada ou invalida. Faça login novamente."
          : lowered.includes("failed to fetch") || lowered.includes("connection") || lowered.includes("network")
            ? "Falha de conexao com as functions do Supabase. Verifique se as functions publicadas estao online."
            : rawMessage;
      setError(friendlyMessage);
      setOffline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async (_inputUrl?: string, _sheetName?: string, _options?: { silent?: boolean }) => {
    await refresh();
  }, [refresh]);

  const clearNotifications = useCallback(() => {
    void supabase.functions
      .invoke(MARK_NOTIFICATIONS_READ_FUNCTION_NAME, {
        body: { church_totvs_id: (localStorage.getItem("totvs_church_id") || "").trim() || null },
      })
      .finally(() => {
        setNotifications([]);
      });
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


