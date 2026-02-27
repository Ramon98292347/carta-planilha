import { useState, useEffect, useCallback } from "react";
import { extractSpreadsheetId, fetchSheetData, transformAcessoRow, transformCartaRow, transformObreiroRow } from "@/lib/sheets";

const STORAGE_KEY = "sheets_dashboard_url";
const STORAGE_SHEET_KEY = "sheets_dashboard_custom_sheet";

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

  const normalize = (v: string) =>
    (v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const connect = useCallback(async (inputUrl: string, sheetName?: string) => {
    const id = extractSpreadsheetId(inputUrl);
    if (!id) {
      setError("URL inválida. Cole uma URL do Google Sheets que contenha /spreadsheets/d/ID/");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try CARTAS_DB first, then custom name, then CARTAS
      let cartasData: Record<string, string>[] = [];
      let usedSheet = "";
      const cartasSheets = ["CARTAS_DB"];
      if (sheetName?.trim()) cartasSheets.push(sheetName.trim());
      cartasSheets.push("CARTAS");

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
          if (!acesso) return row;

          const status = (acesso.status || "").trim();
          const motivo = (acesso.motivo || "").trim();
          const next = { ...row };

          if (status) next.status = status;
          if (motivo && motivo !== "-" && motivo !== "—" && motivo !== "â€”") next.motivo_bloqueio = motivo;
          return next;
        });
      }

      // Try OBREIROS_DB then OBREIROS
      let obreirosData: Record<string, string>[] = [];
      let obOk = false;
      for (const sheet of ["OBREIROS_DB", "OBREIROS"]) {
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

      setCartas(cartasData);
      setObreiros(obreirosData);
      setHasObreiros(obOk);
      setCartasSheetUsed(usedSheet);
      setConnected(true);
      localStorage.setItem(STORAGE_KEY, inputUrl);
      if (sheetName?.trim()) localStorage.setItem(STORAGE_SHEET_KEY, sheetName.trim());
      setUrl(inputUrl);
    } catch (err: any) {
      setError(err.message || "Erro ao conectar à planilha.");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setCartas([]);
    setObreiros([]);
    setConnected(false);
    setHasObreiros(false);
    setUrl("");
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
