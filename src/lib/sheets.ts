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
  data_emissao: ["Carimbo de data/hora", "carimbo_de_data/hora", "data_emissao", "data_emissão", "__col_A"],
  regiao: [
    "Regi?o",
    "Regiao",
    "regiao",
    "regi?o",
    "Qual regi?o Pertence",
    "Qual região Pertence",
    "qual_regi?o_pertence",
    "qual_região_pertence",
    "__col_B",
  ],
  igreja_origem: [
    "Igreja que pertence",
    "Qual Igreja Voc? Pertence?",
    "Qual Igreja Você Pertence?",
    "qual_igreja_voc?_pertence?",
    "qual_igreja_você_pertence?",
    "igreja_origem",
    "Qual Igreja Estadual?",
    "__col_C",
  ],
  nome: ["Nome completo", "nome_completo", "nome", "nome_obreiro", "__col_D"],
  email: ["email", "E-mail", "e-mail", "Email"],
  telefone: ["Telefone", "telefone", "__col_E"],
  data_pregacao: [
    "Data da prega??o",
    "Data da prega??o.",
    "Data da pregação.",
    "data_da_prega??o.",
    "data_da_pregação.",
    "Dia da prega??o",
    "dia_da_prega??o",
    "data_pregacao",
    "data_prega??o",
    "Dia",
    "M?s",
    "Ano",
    "Dia da prega??o",
    "M?s da prega??o",
    "Ano da prega??o",
    "__col_I",
  ],
  data_ordenacao: [
    "Data da Ordena??o",
    "Data da Ordenação",
    "data_da_ordena??o",
    "data_da_ordena??o",
    "data_ordenacao",
    "Dia da Ordena??o",
    "M?s da ordena??o",
    "Ano da Ordema??o",
    "__col_F",
  ],
  funcao: [
    "Fun??o Ministerial",
    "Fun??o Ministerial ?",
    "Função Ministerial ?",
    "fun??o_ministerial",
    "fun??o_ministerial_?",
    "função_ministerial_?",
    "funcao",
    "fun??o",
    "__col_J",
  ],
  ipda_destino: ["IPDA Destino", "ipda_destino", "Igreja Destino", "__col_L"],
  igreja_destino: [
    "Igreja que vai pregar",
    "Qual Igreja voc? est? indo pregar?",
    "Qual Igreja você está indo pregar?",
    "qual_igreja_voc?_est?_indo_pregar?",
    "qual_igreja_você está indo pregar?",
    "igreja_destino",
    "__col_G",
  ],
  status: ["status", "Status", "Status da carta", "Status Carta", "__col_Z", "Z", "Coluna Z"],
  status_merge: [
    "Status",
    "status",
    "status_carta",
    "status_merge",
    "Document Merge Status - Cartas",
    "Document Merge Status - cartas",
    "document_merge_status_-_cartas",
    "Document Merge Status - Carta de Prega??o",
  ],
  url_pdf: [
    "Merged Doc URL - catas",
    "Merged Doc URL - Cartas",
    "Merged Doc URL - cartas",
    "merged_doc_url_-_cartas",
    "Merged Doc URL - carta de pregacao",
    "Link to merged Doc - catas",
    "Link to merged Doc - Cartas",
    "Link to merged Doc - cartas",
    "link_to_merged_doc_-_cartas",
    "url_pdf",
    "Merged Doc URL - Carta de Prega??o",
    "Link to merged Doc - Carta de Prega??o",
    "__col_AB",
    "__col_AC",
  ],
  doc_id: [
    "Merged Doc ID - catas",
    "Merged Doc ID - Cartas",
    "Merged Doc ID - cartas",
    "merged_doc_id_-_cartas",
    "Merged Doc ID - carta de pregacao",
    "doc_id",
    "Merged Doc ID - Carta de Prega??o",
    "__col_AA",
  ],
  // cargo columns for derivation
  _ps: ["Ps", "ps"],
  _dic: ["Dic", "dic"],
  _ob: ["ob"],
  _mem: ["Mem", "mem"],
  cargo: ["cargo", "Fun??o Ministerial", "Fun??o Ministerial ?", "Função Ministerial ?", "__col_J"],
};
const OBREIROS_ALIASES: Record<string, string[]> = {
  nome: ["nome", "Nome", "Nome completo", "nome_completo"],
  cargo: ["cargo", "Fun??o Ministerial ?", "Função Ministerial ?", "funcao", "fun??o"],
  igreja: ["igreja", "igreja_origem", "Qual Igreja Voc? Pertence?", "Qual Igreja Você Pertence?", "Qual Igreja voc? est? indo pregar?"],
  campo: ["campo", "regiao", "regi?o", "Qual regi?o Pertence", "Qual região Pertence"],
  status: ["status", "Status", "__col_Z"],
  data_ordenacao: ["data_ordenacao", "data_ordena??o", "data_ordenação", "Data da Ordena??o", "Data da Ordenação", "Data da Ordena??o", "Data da prega??o.", "data_pregacao"],
  data_batismo: ["data_batismo", "Data do Batismo", "Data do batismo"],
  telefone: ["telefone", "Telefone", "Celular", "WhatsApp"],
  email: ["email", "E-mail", "e-mail", "Email"],
  funcao: ["Fun??o Ministerial ?", "Função Ministerial ?", "funcao", "fun??o"],
  regiao: ["regiao", "regi?o", "Qual regi?o Pertence", "Qual região Pertence"],
  foto: ["foto", "Foto", "imagem", "Imagem", "photo", "Photo", "url_foto", "URL Foto", "Link da foto", "Link Foto"],
  _ps: ["Ps", "ps"],
  _dic: ["Dic", "dic"],
  _ob: ["ob", "Ob"],
  _mem: ["Mem", "mem"],
};

const ACESSO_ALIASES: Record<string, string[]> = {
  email: ["email", "E-mail", "e-mail", "Email"],
  nome: ["nome", "Nome", "Nome completo"],
  telefone: ["telefone", "Telefone", "WhatsApp", "Celular"],
  status: ["status", "Status", "Statu", "Situa??o", "Situacao", "Acesso"],
  motivo: ["motivo", "Motivo", "Motivo do bloqueio", "Justificativa", "Observa??o", "Observacao"],
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
  if (!raw || raw === "-" || raw === "—" || raw === "?") return "-";

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized === "dic" || normalized === "diacono" || normalized === "diaconoa") return "Di?cono";
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
    else if (dic) cargo = "Di?cono";
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
    data_ordenacao: get("data_ordenacao") || "-",
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

  let cargo = get("cargo");
  if (!cargo) {
    const ps = findByAliases(raw, OBREIROS_ALIASES._ps);
    const dic = findByAliases(raw, OBREIROS_ALIASES._dic);
    const ob = findByAliases(raw, OBREIROS_ALIASES._ob);
    const mem = findByAliases(raw, OBREIROS_ALIASES._mem);
    if (ps) cargo = "Pastor";
    else if (dic) cargo = "Di?cono";
    else if (ob) cargo = "Obreiro";
    else if (mem) cargo = "Membro";
  }

  return {
    nome: get("nome") || "-",
    cargo: normalizeCargoLabel(cargo),
    igreja: get("igreja") || "-",
    campo: get("campo") || "-",
    status: get("status") || "-",
    data_ordenacao: get("data_ordenacao") || "-",
    data_batismo: get("data_batismo") || "-",
    telefone: get("telefone") || "-",
    email: get("email") || "-",
    funcao: get("funcao") || "-",
    regiao: get("regiao") || "-",
    foto: get("foto") || "-",
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
    // Alguns usu?rios preenchem o campo "email" com nome (ex.: MIGUEL)
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
    throw new Error(`N?o foi poss?vel acessar a aba "${sheetName}". Verifique se a planilha est? publicada na web.`);
  }
  const text = await response.text();
  if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
    throw new Error(`A aba "${sheetName}" n?o foi encontrada ou a planilha n?o est? p?blica. Publique via Arquivo -> Compartilhar -> Publicar na web.`);
  }
  return parseCSV(text);
}

// Simple accessor for transformed data
export function col(row: Record<string, string>, key: string): string {
  return row[key] || "-";
}











