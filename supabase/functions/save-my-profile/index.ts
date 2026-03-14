import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

type Body = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  ordination_date?: string | null;
  minister_role?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Comentario: esta function permite ao usuario atualizar apenas o proprio
    // cadastro, sem abrir permissao geral de update por RLS.
    const payload = {
      full_name: String(body.full_name || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      email: String(body.email || "").trim() || null,
      birth_date: String(body.birth_date || "").trim() || null,
      ordination_date: String(body.ordination_date || "").trim() || null,
      minister_role: String(body.minister_role || "").trim() || null,
      cep: String(body.cep || "").trim() || null,
      address_street: String(body.address_street || "").trim() || null,
      address_number: String(body.address_number || "").trim() || null,
      address_complement: String(body.address_complement || "").trim() || null,
      address_neighborhood: String(body.address_neighborhood || "").trim() || null,
      address_city: String(body.address_city || "").trim() || null,
      address_state: String(body.address_state || "").trim().toUpperCase() || null,
    };

    if (!payload.full_name) return json({ ok: false, error: "missing_full_name" }, 400);
    if (!payload.phone) return json({ ok: false, error: "missing_phone" }, 400);

    const { data, error } = await sb
      .from("users")
      .update(payload)
      .eq("id", session.user_id)
      .select(
        "id, full_name, phone, email, birth_date, ordination_date, minister_role, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, is_active, can_create_released_letter",
      )
      .single();

    if (error) return json({ ok: false, error: "db_error_update_profile", details: error.message }, 500);

    return json({ ok: true, profile: data }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
