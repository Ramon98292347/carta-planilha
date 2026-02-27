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
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(options?.body ?? {}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return { data: payload, error: new Error("Function invoke failed") };
      }
      return { data: payload, error: null };
    } catch (err: any) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
};

export const supabase = { functions };

