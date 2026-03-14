import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const N8N_WEBHOOK_URL =
  Deno.env.get("N8N_CARTA_PREGACAO_WEBHOOK_URL") ||
  "https://n8n-n8n.ynlng8.easypanel.host/webhook/carta-pregacao";

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
type ActionType = "release" | "share" | "delete";
type Body = { letter_id?: string; action?: ActionType };

function parseTotvsFromText(value: string): string {
  const match = String(value || "").trim().match(/^(\d{3,})\b/);
  return match ? match[1] : "";
}

async function postToN8n(payload: Record<string, unknown>) {
  let ok = false;
  let status = 0;
  let response: unknown = null;

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    status = resp.status;
    const text = await resp.text();
    try {
      response = JSON.parse(text);
    } catch {
      response = { raw: text };
    }
    ok = resp.ok;
  } catch (e) {
    response = { error: String(e) };
  }

  return { ok, status, response };
}

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
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const letterId = String(body.letter_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase() as ActionType;

    if (!letterId) return json({ ok: false, error: "missing_letter_id" }, 400);
    if (!["release", "share", "delete"].includes(action)) return json({ ok: false, error: "invalid_action" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: letter, error: letterErr } = await sb
      .from("letters")
      .select("id,status,church_origin,church_totvs_id,released_by_name,released_at,sent_at,raw_payload,webhook_response")
      .eq("id", letterId)
      .maybeSingle();

    if (letterErr) return json({ ok: false, error: "db_error_letter", details: letterErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    const currentStatus = String(letter.status || "").trim().toUpperCase();
    const originTotvs = parseTotvsFromText(String(letter.church_origin || ""));

    if (session.role === "pastor" && originTotvs !== session.active_totvs_id) {
      return json({ ok: false, error: "forbidden_letter_out_of_origin_scope" }, 403);
    }

    if (currentStatus === "EXCLUIDA") {
      return json({ ok: false, error: "letter_deleted" }, 409);
    }

    const { data: actor } = await sb.from("users").select("full_name").eq("id", session.user_id).maybeSingle();
    const actorName = String((actor as Record<string, unknown> | null)?.full_name || "Pastor").trim() || "Pastor";
    const now = new Date().toISOString();

    let patch: Record<string, unknown> = {};

    if (action === "release") {
      if (currentStatus === "LIBERADA" || currentStatus === "ENVIADA") {
        return json({ ok: false, error: "letter_already_released" }, 409);
      }
      if (currentStatus === "BLOQUEADO") {
        return json({ ok: false, error: "blocked_letter" }, 409);
      }

      const payload = (letter.raw_payload && typeof letter.raw_payload === "object" && !Array.isArray(letter.raw_payload))
        ? { ...(letter.raw_payload as Record<string, unknown>) }
        : null;

      if (!payload) {
        return json({ ok: false, error: "missing_letter_payload", details: "Carta sem payload salvo para envio ao webhook." }, 409);
      }

      const result = await postToN8n(payload);
      if (!result.ok) {
        return json({ ok: false, error: "n8n_release_failed", details: result.response || "Webhook de liberacao falhou." }, 502);
      }

      patch = {
        status: "LIBERADA",
        released_by_name: actorName,
        released_at: now,
        webhook_response: result.response || {},
      };
    }

    if (action === "share") {
      if (currentStatus === "BLOQUEADO") {
        return json({ ok: false, error: "blocked_letter" }, 409);
      }
      if (currentStatus !== "LIBERADA" && currentStatus !== "ENVIADA") {
        return json({ ok: false, error: "release_required_before_share" }, 409);
      }
      patch = {
        status: "ENVIADA",
        sent_at: now,
        released_by_name: String(letter.released_by_name || actorName).trim() || actorName,
        released_at: letter.released_at || now,
      };
    }

    if (action === "delete") {
      patch = {
        status: "EXCLUIDA",
      };
    }

    const { data: updated, error: updErr } = await sb
      .from("letters")
      .update(patch)
      .eq("id", letterId)
      .select("id,status,released_by_name,released_at,sent_at")
      .single();

    if (updErr) return json({ ok: false, error: "db_error_update_letter", details: updErr.message }, 500);

    return json({ ok: true, letter: updated }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
