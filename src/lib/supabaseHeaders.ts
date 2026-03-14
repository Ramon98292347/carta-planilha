const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const canUseBearer = !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("sb_publishable_");

export const getSupabaseHeaders = ({ json = true, authToken = "" }: { json?: boolean; authToken?: string } = {}) => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  // Comentario: quando existe token de sessao do app, ele tem prioridade
  // porque as funcoes novas do banco grande validam esse JWT.
  if (authToken.trim()) {
    headers.Authorization = `Bearer ${authToken.trim()}`;
  } else if (canUseBearer) {
    // Publishable keys are not JWT tokens. Sending them as Bearer causes 401.
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
};

export const getSupabaseRestHeaders = ({ json = true }: { json?: boolean } = {}) => {
  // Comentario: leituras diretas via REST precisam usar o `rls_token`,
  // porque as policies do banco novo dependem dos claims desse JWT.
  const rlsToken = (localStorage.getItem("rls_token") || "").trim();
  return getSupabaseHeaders({ json, authToken: rlsToken });
};

