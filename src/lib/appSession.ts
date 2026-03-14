export type AppRole = "admin" | "pastor" | "obreiro";

export type ChurchChoice = {
  totvs_id: string;
  role: AppRole;
  church_name: string;
  church_class: string;
};

export type LoginSessionPayload = {
  token: string;
  rls_token?: string | null;
  user: {
    id: string;
    full_name: string;
    cpf: string;
    role: AppRole;
  };
  session: {
    totvs_id: string;
    church_name: string;
    church_class: string;
    scope_totvs_ids?: string[];
    root_totvs_id?: string;
  };
};

const SESSION_KEYS = [
  "session_key",
  "app_token",
  "rls_token",
  "user_id",
  "user_name",
  "user_cpf",
  "user_role",
  "church_name",
  "church_class",
  "totvs_church_id",
  "scope_totvs_ids",
  "root_totvs_id",
  // Chaves antigas mantidas por compatibilidade com telas ainda nao migradas.
  "clientId",
  "pastor_name",
  "pastor_phone",
  "google_sheet_url",
  "google_form_url",
  "google_block_form_url",
  "google_form_url_folder",
  "needs_admin_setup",
  "obreiro_nome",
  "obreiro_telefone",
  "obreiro_status",
  "obreiro_email",
  "obreiro_data_nascimento",
  "obreiro_data_ordenacao",
  "obreiro_cargo_ministerial",
  "obreiro_cep",
  "obreiro_endereco",
  "obreiro_numero",
  "obreiro_complemento",
  "obreiro_bairro",
  "obreiro_cidade",
  "obreiro_uf",
].sort();

export function clearAppSession() {
  // Comentario: limpamos tanto a sessao nova quanto as chaves legadas
  // para evitar que a interface misture dados de bancos diferentes.
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getAppToken() {
  return (localStorage.getItem("app_token") || localStorage.getItem("session_key") || "").trim();
}

export function getRlsToken() {
  return (localStorage.getItem("rls_token") || "").trim();
}

export function hasAppSession() {
  return getAppToken() !== "";
}

export function saveAppSession(payload: LoginSessionPayload) {
  const { token, rls_token, user, session } = payload;

  // Comentario: `session_key` continua sendo salvo porque o app atual
  // ainda usa esse nome em algumas protecoes de rota.
  localStorage.setItem("session_key", token);
  localStorage.setItem("app_token", token);
  localStorage.setItem("rls_token", (rls_token || "").trim());

  localStorage.setItem("user_id", user.id);
  localStorage.setItem("user_name", user.full_name);
  localStorage.setItem("user_cpf", user.cpf);
  localStorage.setItem("user_role", user.role);

  localStorage.setItem("church_name", session.church_name || "");
  localStorage.setItem("church_class", session.church_class || "");
  localStorage.setItem("totvs_church_id", session.totvs_id || "");
  localStorage.setItem("scope_totvs_ids", JSON.stringify(session.scope_totvs_ids || []));
  localStorage.setItem("root_totvs_id", session.root_totvs_id || "");

  // Comentario: chaves legadas para nao quebrar telas antigas enquanto a migracao
  // ainda esta em andamento. Quando migrarmos tudo, podemos remover este bloco.
  if (user.role === "pastor") {
    localStorage.setItem("pastor_name", user.full_name || "");
  }

  if (user.role === "obreiro") {
    localStorage.setItem("obreiro_nome", user.full_name || "");
  }
}
