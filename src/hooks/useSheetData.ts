import { useState, useEffect, useCallback, useRef } from "react";
import { extractSpreadsheetId, fetchSheetData, transformAcessoRow, transformCartaRow, transformObreiroRow } from "@/lib/sheets";
import { toast } from "sonner";

const STORAGE_KEY = "sheets_dashboard_url";
const STORAGE_SHEET_KEY = "sheets_dashboard_custom_sheet";
const PRIMARY_CARTAS_SHEET = "Respostas ao formulário 1";
const REFRESH_INTERVAL_MS = 10000;
const RECENT_WINDOW_MS = 2 * 60 * 1000;

export function useSheetData() {
  const [url, setUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [customSheetName, setCustomSheetName] = useState(() => localStorage.getItem(STORAGE_SHEET_KEY) || "");
  const [cartas, setCartas] = useState<Record<string, string>[]>([]);
  const [obreiros, setObreiros] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hasObreiros, setHasObreiros] = useState(false);
  const [cartasSheetUsed, setCartasSheetUsed] = useState("");
  const knownCartaKeysRef = useRef<Set<string>>(new Set());
  const initializedKeysRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const notifiedRecentKeysRef = useRef<Set<string>>(new Set());

  const normalize = (v: string) =>
    (v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const buildCartaKey = (row: Record<string, string>) =>
    (() => {
      const base = [row.doc_id, row.url_pdf, row.data_emissao, row.nome, row.telefone]
        .map((v) => (v || "").trim())
        .join("|")
        .toLowerCase();
      if (base.replace(/\|/g, "").length > 0) return base;

      const fullFingerprint = Object.keys(row)
        .sort()
        .map((k) => `${k}:${(row[k] || "").trim()}`)
        .join("|")
        .toLowerCase();
      return fullFingerprint;
    })();

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
      // Sempre prioriza a aba oficial de dados de cartas
      let cartasData: Record<string, string>[] = [];
      let usedSheet = "";
      const cartasSheets = [PRIMARY_CARTAS_SHEET, "CARTAS_DB", "CARTAS"];
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

      // Try OBREIRO/OBREIROS first, then DB fallback
      let obreirosData: Record<string, string>[] = [];
      let obOk = false;
      for (const sheet of ["OBREIRO", "Obreiro", "OBREIROS", "OBREIROS_DB"]) {
        try {
          obreirosData = await fetchSheetData(id, sheet);
          if (obreirosData.length > 0) {
            obreirosData = obreirosData.map(transformObreiroRow);
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

      const incomingKeys = new Set(cartasData.map(buildCartaKey));
      const now = Date.now();
      const recentRows = cartasData.filter((row) => {
        const carimbo = parseCarimboDateTime(row.data_emissao);
        if (!carimbo) return false;
        const diff = now - carimbo.getTime();
        return diff >= 0 && diff <= RECENT_WINDOW_MS;
      });

      const newRecentRows = recentRows.filter((row) => {
        const key = buildCartaKey(row);
        return key && !notifiedRecentKeysRef.current.has(key);
      });

      if (initializedKeysRef.current && newRecentRows.length > 0) {
        const latest = newRecentRows.sort((a, b) => {
          const da = parseCarimboDateTime(a.data_emissao)?.getTime() ?? 0;
          const db = parseCarimboDateTime(b.data_emissao)?.getTime() ?? 0;
          return db - da;
        })[0];

        toast.info(newRecentRows.length === 1 ? "Nova carta emitida" : `${newRecentRows.length} novas cartas emitidas`, {
          description: `Nome: ${latest.nome || "-"} | Carimbo: ${latest.data_emissao || "-"} | Origem: ${
            latest.igreja_origem || "-"
          } | Destino: ${latest.igreja_destino || "-"}`,
        });
      }

      newRecentRows.forEach((row) => {
        const key = buildCartaKey(row);
        if (key) notifiedRecentKeysRef.current.add(key);
      });

      knownCartaKeysRef.current = incomingKeys;
      if (!initializedKeysRef.current) initializedKeysRef.current = true;

      setCartas(cartasData);
      setObreiros(obreirosData);
      setHasObreiros(obOk);
      setCartasSheetUsed(usedSheet);
      setConnected(true);

      if (!silent) {
        localStorage.setItem(STORAGE_KEY, inputUrl);
        if (sheetName?.trim()) localStorage.setItem(STORAGE_SHEET_KEY, sheetName.trim());
        setUrl(inputUrl);
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.message || "Erro ao conectar à planilha.");
        setConnected(false);
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
    knownCartaKeysRef.current = new Set();
    initializedKeysRef.current = false;
    syncInFlightRef.current = false;
    notifiedRecentKeysRef.current = new Set();
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
  };
}
