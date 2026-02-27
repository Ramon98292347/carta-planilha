export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function buildCsvUrl(spreadsheetId: string, sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

export function parseCSV(csv: string): Record<string, string>[] {
  const records = splitCsvRecords(csv);
  if (records.length < 2) return [];

  const headers = parseCsvLine(records[0]).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const line = records[i].trim();
    if (!line) continue;
    const values = parseCsvLine(records[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const value = (values[idx] || "").trim();
      row[h] = value;
      row[`__col_${toSpreadsheetColumnName(idx)}`] = value;
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvRecords(csv: string): string[] {
  const normalized = csv.replace(/\r\n/g, "\n");
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && i + 1 < normalized.length && normalized[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === "\n" && !inQuotes) {
      records.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0) records.push(current);
  return records;
}

function toSpreadsheetColumnName(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseDate(value: string): Date | null {
  if (!value || value === "-") return null;
  const v = value.trim();

  // DD/MM/YYYY HH:MM:SS or DD/MM/YYYY
  const brMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s+\d{1,2}:\d{2}(:\d{2})?)?$/);
  if (brMatch) {
    return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  }
  // DD-MM-YYYY
  const dashMatch = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    return new Date(Number(dashMatch[3]), Number(dashMatch[2]) - 1, Number(dashMatch[1]));
  }
  // YYYY-MM-DD
  const isoMatch = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString("pt-BR");
}

// --- Column alias mapping for CARTAS ---

const CARTAS_ALIASES: Record<string, string[]> = {
  data_emissao: ["Carimbo de data/hora", "carimbo_de_data/hora", "data_emissao", "data_emissÃ£o"],
  regiao: ["Qual região Pertence", "Qual regiÃ£o Pertence", "qual_região_pertence", "qual_regiÃ£o_pertence", "regiao", "região"],
  igreja_origem: ["Qual Igreja Você Pertence?", "Qual Igreja VocÃª Pertence?", "qual_igreja_você_pertence?", "qual_igreja_vocÃª_pertence?", "igreja_origem"],
  nome: ["Nome completo", "nome_completo", "nome", "nome_obreiro"],
  email: ["email", "E-mail", "e-mail", "Email"],
  telefone: ["Telefone", "telefone"],
  data_pregacao: ["Data da pregação.", "Data da pregaÃ§Ã£o.", "data_da_pregação.", "data_da_pregaÃ§Ã£o.", "Dia da pregação", "dia_da_pregação", "data_pregacao", "data_pregação"],
  funcao: ["Função Ministerial ?", "FunÃ§Ã£o Ministerial ?", "função_ministerial_?", "funÃ§Ã£o_ministerial_?", "funcao", "função"],
  ipda_destino: ["IPDA Destino", "ipda_destino"],
  igreja_destino: ["Qual Igreja você está indo pregar?", "Qual Igreja vocÃª estÃ¡ indo pregar?", "qual_igreja_você_está_indo_pregar?", "qual_igreja_vocÃª_estÃ¡_indo_pregar?", "igreja_destino"],
  status: ["status", "Status", "Status da carta", "Status Carta", "__col_Z", "Z", "Coluna Z"],
  status_merge: ["Status", "status", "status_carta", "status_merge", "Document Merge Status - Cartas", "Document Merge Status - cartas", "document_merge_status_-_cartas"],
  url_pdf: [
    "Merged Doc URL - Cartas",
    "Merged Doc URL - cartas",
    "merged_doc_url_-_cartas",
    "Link to merged Doc - Cartas",
    "Link to merged Doc - cartas",
    "link_to_merged_doc_-_cartas",
    "url_pdf",
  ],
  doc_id: ["Merged Doc ID - Cartas", "Merged Doc ID - cartas", "merged_doc_id_-_cartas", "doc_id"],
  // cargo columns for derivation
  _ps: ["Ps", "ps"],
  _dic: ["Dic", "dic"],
  _ob: ["ob"],
  _mem: ["Mem", "mem"],
  cargo: ["cargo", "Função Ministerial ?", "FunÃ§Ã£o Ministerial ?", "__col_Q"],
};

const OBREIROS_ALIASES: Record<string, string[]> = {
  nome: ["nome", "Nome completo", "nome_completo"],
  cargo: ["cargo", "Função Ministerial ?", "FunÃ§Ã£o Ministerial ?"],
  igreja: ["igreja", "Qual Igreja Você Pertence?", "Qual Igreja VocÃª Pertence?"],
  campo: ["campo"],
  status: ["__col_Z"],
  data_ordenacao: ["data_ordenacao", "data_ordenaÃ§Ã£o", "Data da OrdenaÃ§Ã£o"],
  data_batismo: ["data_batismo", "Data do Batismo"],
};

const ACESSO_ALIASES: Record<string, string[]> = {
  email: ["email", "E-mail", "e-mail", "Email"],
  nome: ["nome", "Nome", "Nome completo"],
  telefone: ["telefone", "Telefone", "WhatsApp", "Celular"],
  status: ["status", "Status", "Situação", "Situacao", "Acesso"],
  motivo: ["motivo", "Motivo", "Motivo do bloqueio", "Justificativa", "Observação", "Observacao"],
};

function findByAliases(row: Record<string, string>, aliases: string[]): string {
  const normalizeKey = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  // Try exact header match first
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  // Try normalized key match
  const normalizedKeys = Object.keys(row);
  for (const alias of aliases) {
    const norm = normalizeKey(alias);
    const found = normalizedKeys.find((k) => normalizeKey(k) === norm);
    if (found && row[found] !== undefined && row[found] !== "") return row[found];
  }
  return "";
}

function normalizeCargoLabel(value: string): string {
  const raw = (value || "").trim();
  if (!raw || raw === "-" || raw === "â€”" || raw === "—") return "-";

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized === "dic" || normalized === "diacono" || normalized === "diaconoa") return "Diácono";
  if (normalized === "ps" || normalized === "pastor") return "Pastor";
  if (normalized === "ob" || normalized === "obreiro") return "Obreiro";
  if (normalized === "mem" || normalized === "membro") return "Membro";

  return raw;
}

/** Transform raw CSV row into internal Cartas model */
export function transformCartaRow(raw: Record<string, string>): Record<string, string> {
  const get = (key: string) => {
    const aliases = CARTAS_ALIASES[key];
    if (!aliases) return "";
    return findByAliases(raw, aliases);
  };

  // Derive cargo
  let cargo = get("cargo");
  if (!cargo) {
    const ps = findByAliases(raw, CARTAS_ALIASES._ps);
    const dic = findByAliases(raw, CARTAS_ALIASES._dic);
    const ob = findByAliases(raw, CARTAS_ALIASES._ob);
    const mem = findByAliases(raw, CARTAS_ALIASES._mem);
    if (ps) cargo = "Pastor";
    else if (dic) cargo = "Diácono";
    else if (ob) cargo = "Obreiro";
    else if (mem) cargo = "Membro";
  }

  const result: Record<string, string> = {
    data_emissao: get("data_emissao") || "-",
    regiao: get("regiao") || "-",
    igreja_origem: get("igreja_origem") || "-",
    nome: get("nome") || "-",
    email: get("email") || "-",
    telefone: get("telefone") || "-",
    data_pregacao: get("data_pregacao") || "-",
    funcao: get("funcao") || "-",
    cargo: normalizeCargoLabel(cargo),
    ipda_destino: get("ipda_destino") || "-",
    igreja_destino: get("igreja_destino") || "-",
    status: get("status") || "-",
    status_merge: get("status_merge") || "-",
    url_pdf: get("url_pdf") || "-",
    doc_id: get("doc_id") || "-",
  };

  return result;
}

/** Transform raw CSV row into internal Obreiros model */
export function transformObreiroRow(raw: Record<string, string>): Record<string, string> {
  const get = (key: string) => {
    const aliases = OBREIROS_ALIASES[key];
    if (!aliases) return "";
    return findByAliases(raw, aliases);
  };

  return {
    nome: get("nome") || "-",
    cargo: normalizeCargoLabel(get("cargo")),
    igreja: get("igreja") || "-",
    campo: get("campo") || "-",
    status: get("status") || "-",
    data_ordenacao: get("data_ordenacao") || "-",
    data_batismo: get("data_batismo") || "-",
  };
}

/** Transform raw CSV row from ACESSO sheet into access model */
export function transformAcessoRow(raw: Record<string, string>): Record<string, string> {
  const get = (key: string) => {
    const aliases = ACESSO_ALIASES[key];
    if (!aliases) return "";
    return findByAliases(raw, aliases);
  };

  const email = get("email");
  const nome = get("nome");

  return {
    email: email || "-",
    // Alguns usuários preenchem o campo "email" com nome (ex.: MIGUEL)
    nome: nome || email || "-",
    telefone: get("telefone") || "-",
    status: get("status") || "-",
    motivo: get("motivo") || "-",
  };
}

export async function fetchSheetData(
  spreadsheetId: string,
  sheetName: string
): Promise<Record<string, string>[]> {
  const url = buildCsvUrl(spreadsheetId, sheetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NÃ£o foi possÃ­vel acessar a aba "${sheetName}". Verifique se a planilha estÃ¡ publicada na web.`);
  }
  const text = await response.text();
  if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
    throw new Error(`A aba "${sheetName}" nÃ£o foi encontrada ou a planilha nÃ£o estÃ¡ pÃºblica. Publique via Arquivo â†’ Compartilhar â†’ Publicar na web.`);
  }
  return parseCSV(text);
}

// Simple accessor for transformed data
export function col(row: Record<string, string>, key: string): string {
  return row[key] || "-";
}


