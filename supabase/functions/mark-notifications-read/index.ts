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
type Body = { church_totvs_id?: string };

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
    const rawRole = String(payload.role || "").toLowerCase();
    const appRole = String(payload.app_role || "").toLowerCase();
    const resolvedRole = rawRole === "authenticated" ? appRole : rawRole;
    const role = resolvedRole as Role;
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
    const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const now = new Date().toISOString();

    const [mineResult, churchResult] = await Promise.all([
      sb
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("user_id", session.user_id)
        .or("is_read.eq.false,read_at.is.null"),
      sb
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .is("user_id", null)
        .eq("church_totvs_id", churchTotvsId)
        .or("is_read.eq.false,read_at.is.null"),
    ]);

    if (mineResult.error) return json({ ok: false, error: "db_error_mark_mine", details: mineResult.error.message }, 500);
    if (churchResult.error) return json({ ok: false, error: "db_error_mark_church", details: churchResult.error.message }, 500);

    return json({ ok: true, read_at: now }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
