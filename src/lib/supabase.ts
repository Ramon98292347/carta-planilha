import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type InvokeResult<T = any> = {
  data: T | null;
  error: Error | null;
};

const functions = {
  async invoke<T = any>(functionName: string, options?: { body?: unknown }): Promise<InvokeResult<T>> {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { data: null, error: new Error("Supabase não configurado") };
    }

    try {
      // Comentario: usamos o token salvo no login novo quando existir.
      // Isso permite chamar edge functions protegidas por JWT da aplicacao.
      const authToken = (localStorage.getItem("app_token") || localStorage.getItem("session_key") || "").trim();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: "POST",
        headers: getSupabaseHeaders({ authToken }),
        body: JSON.stringify(options?.body ?? {}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = (payload as any)?.error || `Function invoke failed (${response.status})`;
        return { data: payload, error: new Error(message) };
      }
      return { data: payload, error: null };
    } catch (err: any) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
};

export const supabase = { functions };
