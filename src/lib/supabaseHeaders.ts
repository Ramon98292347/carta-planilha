const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const canUseBearer = !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("sb_publishable_");

export const getSupabaseHeaders = ({ json = true }: { json?: boolean } = {}) => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  // Publishable keys are not JWT tokens. Sending them as Bearer causes 401.
  if (canUseBearer) {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
};

