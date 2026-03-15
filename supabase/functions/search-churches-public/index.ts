import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Body = {
  query?: string;
  limit?: number;
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeSearch(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const rawQuery = String(body.query || "").trim();
    const queryDigits = onlyDigits(rawQuery);
    const queryText = normalizeSearch(rawQuery);
    const limit = Math.max(1, Math.min(10, Number(body.limit || 5)));

    if (queryDigits.length < 2 && queryText.length < 2) {
      return json({ ok: true, churches: [] }, 200);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const query = sb
      .from("churches")
      .select("totvs_id, church_name, class")
      .eq("is_active", true);

    if (queryDigits.length >= 2 && queryText.length >= 2) {
      query.or(`totvs_id.ilike.${queryDigits}%,church_name.ilike.%${rawQuery}%`);
    } else if (queryDigits.length >= 2) {
      query.ilike("totvs_id", `${queryDigits}%`);
    } else {
      query.ilike("church_name", `%${rawQuery}%`);
    }

    const { data, error } = await query
      .order("totvs_id", { ascending: true })
      .limit(limit);

    if (error) return json({ ok: false, error: "db_error_search_churches", details: error.message }, 500);

    return json({
      ok: true,
      churches: (data || []).map((row) => ({
        totvs_id: String(row.totvs_id || ""),
        church_name: String(row.church_name || ""),
        class: String(row.class || ""),
      })),
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
