type FriendlyErrorOptions = {
  fallback?: string;
};

const FRIENDLY_MESSAGES: Record<string, string> = {
  invalid_credentials: "CPF ou senha incorretos. Confira os dados e tente novamente.",
  inactive_user: "Seu acesso está inativo. Procure o pastor ou a administração da igreja.",
  invalid_cpf: "Digite um CPF válido com 11 números.",
  missing_password: "Digite sua senha para entrar.",
  unauthorized: "Sua sessão expirou. Faça login novamente.",
  forbidden: "Você não tem permissão para fazer essa ação.",
  db_error: "Não foi possível consultar seus dados agora. Tente novamente em instantes.",
  missing_supabase_secrets: "O login em produção ainda não está configurado corretamente.",
  missing_server_secrets: "A solicitação não pôde ser processada agora. Tente novamente mais tarde.",
  missing_app_jwt_secret: "A configuração do token de acesso ainda não foi concluída.",
  missing_app_rls_jwt_secret: "A configuração de acesso ao banco ainda não foi concluída.",
  no_totvs_access: "Seu usuário ainda não tem acesso vinculado a uma igreja.",
  church_not_found: "Igreja não encontrada. Confira o TOTVS informado.",
  weak_password: "A senha precisa ter pelo menos 6 caracteres.",
  missing_full_name: "Preencha o nome completo.",
  missing_default_totvs_id: "Informe o TOTVS da igreja.",
  missing_phone: "Informe o telefone.",
  existing_privileged_user: "Já existe um usuário de pastor ou administrador com esse CPF.",
  db_error_church: "Não foi possível consultar a igreja informada agora.",
  db_error_existing_user: "Não foi possível validar esse cadastro agora.",
  db_error_save_user: "Não foi possível salvar a solicitação agora.",
  set_password_failed: "Não foi possível finalizar seu primeiro acesso. Tente novamente.",
  method_not_allowed: "A ação solicitada não é permitida por esse endpoint.",
};

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

function looksLikeErrorCode(value: string) {
  return /^[a-z0-9_]+$/.test(value);
}

export function getFriendlyErrorMessage(raw: unknown, options?: FriendlyErrorOptions) {
  const fallback = options?.fallback || "Não foi possível concluir a operação. Tente novamente.";
  const message = String(raw || "").trim();

  if (!message) return fallback;

  const normalized = normalizeKey(message);
  if (FRIENDLY_MESSAGES[normalized]) return FRIENDLY_MESSAGES[normalized];

  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Falha de conexão. Confira sua internet e tente novamente.";
  }

  if (normalized === "401" || normalized.includes("unauthorized")) {
    return FRIENDLY_MESSAGES.unauthorized;
  }

  if (normalized === "403" || normalized.includes("forbidden")) {
    return FRIENDLY_MESSAGES.forbidden;
  }

  if (looksLikeErrorCode(normalized)) return fallback;

  return message;
}
