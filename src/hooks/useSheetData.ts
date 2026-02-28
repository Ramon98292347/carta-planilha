import { useState, useEffect, useCallback, useRef } from "react";
import { extractSpreadsheetId, fetchSheetData, transformAcessoRow, transformCartaRow, transformObreiroRow } from "@/lib/sheets";
import { toast } from "sonner";

const STORAGE_KEY = "sheets_dashboard_url";
const STORAGE_SHEET_KEY = "sheets_dashboard_custom_sheet";
const PRIMARY_CARTAS_SHEET = "Respostas ao formulário 1";
const PRIMARY_CARTAS_SHEET_ALT = "Respostas do Formulário 1";
const PRIMARY_CARTAS_SHEET_ALT2 = "Respostas do formulário 1";
const PRIMARY_CARTAS_SHEET_ALT3 = "Respostas do Formulario 1";
const REFRESH_INTERVAL_MS = 30000;
const RECENT_WINDOW_MS = 5 * 60 * 60 * 1000;
const NOTIFY_WINDOW_MS = 5 * 60 * 60 * 1000;
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export function useSheetData() {
  const [url, setUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [customSheetName, setCustomSheetName] = useState(() => localStorage.getItem(STORAGE_SHEET_KEY) || "");
  const [cartas, setCartas] = useState<Record<string, string>[]>([]);
  const [obreiros, setObreiros] = useState<Record<string, string>[]>([]);
  const [sendStatusById, setSendStatusById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [hasObreiros, setHasObreiros] = useState(false);
  const [cartasSheetUsed, setCartasSheetUsed] = useState("");
  const initializedKeysRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const lastSeenCarimboMsRef = useRef<number | null>(null);
  const lastNotifiedTsRef = useRef<number | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; ts: number }[]>([]);

  const fetchClientCache = async () => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    try {
      const params = new URLSearchParams({ select: "last_15_cards", limit: "1" });
      params.set("client_id", `eq.${clientId}`);
      const response = await fetch(`${SUPABASE_URL}/rest/v1/client_cache?${params.toString()}`, { headers });
      if (!response.ok) return null;
      const payload = (await response.json().catch(() => [])) as { last_15_cards?: Record<string, string>[] }[];
      return payload?.[0]?.last_15_cards ?? null;
    } catch {
      return null;
    }
  };

  const upsertClientCache = async (cartasRows: Record<string, string>[]) => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const headers = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "resolution=merge-duplicates",
    };

    const payload = {
      client_id: clientId,
      last_15_cards: cartasRows,
    };

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/client_cache?on_conflict=client_id`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  };

  const logClientError = async (message: string, context?: string) => {
    const clientId = (localStorage.getItem("clientId") || "").trim();
    if (!clientId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const headers = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    const payload = {
      client_id: clientId,
      message,
      context: context || null,
      created_at: new Date().toISOString(),
    };

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/client_erros`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  };

  const normalize = (v: string) =>
    (v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const parseCarimboDateTime = (value: string): Date | null => {
    if (!value || value === "-") return null;
    const v = value.trim();
    const match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const date = new Date(year, month, day, hour, minute, second);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const connect = useCallback(async (inputUrl: string, sheetName?: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    const id = extractSpreadsheetId(inputUrl);
    if (!id) {
      if (!silent) setError("URL inválida. Cole uma URL do Google Sheets que contenha /spreadsheets/d/ID/");
      return;
    }

    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      if (!silent && !initializedKeysRef.current) {
        const cached = await fetchClientCache();
        if (cached && cached.length > 0) {
          setCartas(cached);
        }
      }
      // Sempre prioriza a aba oficial de dados de cartas
      let cartasData: Record<string, string>[] = [];
      let usedSheet = "";
      const cartasSheets = [
        PRIMARY_CARTAS_SHEET,
        PRIMARY_CARTAS_SHEET_ALT,
        PRIMARY_CARTAS_SHEET_ALT2,
        PRIMARY_CARTAS_SHEET_ALT3,
        "CARTAS_DB",
        "CARTAS",
      ];
      if (sheetName?.trim() && !cartasSheets.includes(sheetName.trim())) {
        cartasSheets.push(sheetName.trim());
      }

      for (const sheet of cartasSheets) {
        try {
          cartasData = await fetchSheetData(id, sheet);
          if (cartasData.length > 0) {
            usedSheet = sheet;
            break;
          }
        } catch {
          // try next
        }
      }

      // Transform cartas to internal model
      if (cartasData.length > 0) {
        cartasData = cartasData
          .map(transformCartaRow)
          .filter((row) =>
            [row.data_emissao, row.nome, row.data_pregacao, row.igreja_origem, row.igreja_destino, row.status, row.url_pdf].some(
              (v) => v && v !== "-" && v !== "â€”" && v !== "—"
            )
          );
      }

      // Try ACESSO and merge status/motivo onto cartas
      let acessoData: Record<string, string>[] = [];
      for (const sheet of ["ACESSO", "ACESSOS", "ACESSO_DB"]) {
        try {
          const raw = await fetchSheetData(id, sheet);
          if (raw.length > 0) {
            acessoData = raw.map(transformAcessoRow);
            break;
          }
        } catch {
          // try next
        }
      }

      if (cartasData.length > 0 && acessoData.length > 0) {
        const acessoByNome = new Map<string, Record<string, string>>();
        const acessoByTelefone = new Map<string, Record<string, string>>();
        const acessoByEmail = new Map<string, Record<string, string>>();

        acessoData.forEach((row) => {
          const emailKey = normalize(row.email);
          const nomeKey = normalize(row.nome);
          const telKey = normalize(row.telefone);
          if (emailKey) acessoByEmail.set(emailKey, row);
          if (nomeKey) acessoByNome.set(nomeKey, row);
          if (telKey) acessoByTelefone.set(telKey, row);
        });

        cartasData = cartasData.map((row) => {
          const fromEmail = acessoByEmail.get(normalize(row.email));
          const fromNome = acessoByNome.get(normalize(row.nome));
          const fromTel = acessoByTelefone.get(normalize(row.telefone));
          const acesso = fromEmail ?? fromTel ?? fromNome;
          const next = { ...row, status: "-", motivo_bloqueio: "-" };
          if (!acesso) return next;

          const status = (acesso.status || "").trim();
          const motivo = (acesso.motivo || "").trim();

          if (status) next.status = status;
          if (motivo && motivo !== "-" && motivo !== "—" && motivo !== "â€”") next.motivo_bloqueio = motivo;
          return next;
        });
      }

      if (cartasData.length > 0) {
        cartasData = cartasData.slice(-10).reverse();
      }

      // Try OBREIRO/OBREIROS first, then DB fallback
      let obreirosData: Record<string, string>[] = [];
      let obOk = false;
      for (const sheet of ["OBREIRO", "Obreiro", "OBREIROS", "OBREIROS_DB"]) {
        try {
          obreirosData = await fetchSheetData(id, sheet);
          if (obreirosData.length > 0) {
            obreirosData = obreirosData.map((raw) => {
              const normalized = transformObreiroRow(raw);
              const merged: Record<string, string> = { ...raw, ...normalized };
              Object.keys(merged).forEach((key) => {
                if (key.startsWith("__col_")) delete merged[key];
              });
              return merged;
            });
            obOk = true;
            break;
          }
        } catch {
          // try next
        }
      }

      if (cartasData.length === 0 && !obOk) {
        const hint = sheetName?.trim()
          ? `Nenhum dado encontrado nas abas CARTAS_DB, "${sheetName}", CARTAS, OBREIROS_DB ou OBREIROS.`
          : "Nenhum dado encontrado. Verifique se a planilha está publicada e possui as abas CARTAS_DB (ou CARTAS) e/ou OBREIROS_DB (ou OBREIROS). Você também pode informar o nome da aba de cartas abaixo.";
        throw new Error(hint);
      }

      const sortedByCarimbo = [...cartasData]
        .map((row) => ({ row, ts: parseCarimboDateTime(row.data_emissao)?.getTime() ?? 0 }))
        .filter((item) => item.ts > 0)
        .sort((a, b) => b.ts - a.ts);

      if (sortedByCarimbo.length > 0) {
        const latestTs = sortedByCarimbo[0].ts;
        const previousTs = lastSeenCarimboMsRef.current;
        const newRows = previousTs
          ? sortedByCarimbo.filter((item) => item.ts > previousTs).map((item) => item.row)
          : [];
        const recentRowsOnLogin =
          !previousTs && !silent
            ? sortedByCarimbo
                .filter((item) => latestTs - item.ts <= RECENT_WINDOW_MS)
                .map((item) => item.row)
            : [];

        if (!previousTs && !silent && recentRowsOnLogin.length > 0) {
          setNotifications(
            recentRowsOnLogin.map((row) => {
              const rowTs = parseCarimboDateTime(row.data_emissao)?.getTime() ?? Date.now();
              return {
                id: `${rowTs}-${row.doc_id || row.nome || "carta"}`,
                title: "Carta recente",
                body: `Nome: ${row.nome || "-"} | Origem: ${row.igreja_origem || "-"} | Destino: ${row.igreja_destino || "-"}`,
                ts: rowTs,
              };
            })
          );
        }

        if (initializedKeysRef.current && newRows.length > 0) {
          const latest = newRows[0];
          const latestTs = parseCarimboDateTime(latest.data_emissao)?.getTime() ?? 0;
          const nowTs = Date.now();
          if (
            latestTs &&
            nowTs - latestTs <= NOTIFY_WINDOW_MS &&
            latestTs <= nowTs &&
            (lastNotifiedTsRef.current == null || latestTs > lastNotifiedTsRef.current)
          ) {
            const title = newRows.length === 1 ? "Nova carta cadastrada" : `${newRows.length} novas cartas cadastradas`;
            const body = `Nome: ${latest.nome || "-"} | Origem: ${latest.igreja_origem || "-"} | Destino: ${latest.igreja_destino || "-"}`;
            setNotifications((prev) => [
              { id: `${Date.now()}-${latest.doc_id || latest.nome || "carta"}`, title, body, ts: Date.now() },
              ...prev,
            ]);
            lastNotifiedTsRef.current = latestTs;
          }
        }

        // Sem toast no login. Notificacoes ficam apenas no sininho.

        lastSeenCarimboMsRef.current = latestTs;
      }
      if (!initializedKeysRef.current) initializedKeysRef.current = true;

      setCartas(cartasData);
      setObreiros(obreirosData);

      if (sortedByCarimbo.length > 0) {
        const cacheRows = sortedByCarimbo.slice(0, 15).map((item) => item.row);
        upsertClientCache(cacheRows);
      }

      // Fetch "Respostas ao formulário 3" for send status
      const fetchSendStatus = async () => {
        const sheets = ["Respostas ao formulário 3", "Respostas ao Formulário 3", "Respostas do formulário 3"];
        for (const sheet of sheets) {
          try {
            const raw = await fetchSheetData(id, sheet);
            if (raw.length === 0) continue;
            const nextMap: Record<string, string> = {};
            raw.forEach((row) => {
              const idValue = (row.ID || row.id || row["__col_B"] || "").toString().trim();
              const statusValue = (row.status_enviados || row.status || row["__col_C"] || "").toString().trim();
              if (idValue) nextMap[idValue] = statusValue;
            });
            setSendStatusById(nextMap);
            return;
          } catch {
            // try next
          }
        }
        setSendStatusById({});
      };

      fetchSendStatus();

      setHasObreiros(obOk);
      setCartasSheetUsed(usedSheet);
      setConnected(true);
      setOffline(false);
      setLastSyncAt(Date.now());

      if (!silent) {
        localStorage.setItem(STORAGE_KEY, inputUrl);
        if (sheetName?.trim()) localStorage.setItem(STORAGE_SHEET_KEY, sheetName.trim());
        setUrl(inputUrl);
      }
    } catch (err: any) {
      logClientError(err?.message || "Erro ao conectar à planilha.", "connect");
      let usedCache = false;
      if (!silent) {
        const cached = await fetchClientCache();
        if (cached && cached.length > 0) {
          setCartas(cached);
          usedCache = true;
        }
      }
      if (!silent) {
        setError(err.message || "Erro ao conectar à planilha.");
        setConnected(usedCache);
        setOffline(usedCache);
      }
    } finally {
      if (!silent) setLoading(false);
      syncInFlightRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    setCartas([]);
    setObreiros([]);
    setConnected(false);
    setHasObreiros(false);
    setUrl("");
    initializedKeysRef.current = false;
    syncInFlightRef.current = false;
    lastSeenCarimboMsRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedSheet = localStorage.getItem(STORAGE_SHEET_KEY);
    if (saved) {
      connect(saved, savedSheet || undefined);
    }
  }, [connect]);

  useEffect(() => {
    if (!connected || !url) return;

    const intervalId = window.setInterval(() => {
      connect(url, customSheetName || undefined, { silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [connected, url, customSheetName, connect]);

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
    clearNotifications: () => setNotifications([]),
    sendStatusById,
    offline,
    lastSyncAt,
  };
}
