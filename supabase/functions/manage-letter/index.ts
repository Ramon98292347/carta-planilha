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

function parseChurchNameFromText(value: string) {
  return String(value || "").replace(/^(\d{3,})\s*-\s*/, "").trim();
}

function formatDateBrShort(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateBrLong(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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
      .select("id,status,church_origin,church_destination,church_totvs_id,preacher_user_id,preacher_name,minister_role,preach_date,created_at,phone,email,signer_user_id,signer_totvs_id,released_by_name,released_at,sent_at,raw_payload,webhook_response")
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

      const [{ data: preacherUser }, { data: signerUser }, { data: signerChurch }] = await Promise.all([
        letter.preacher_user_id
          ? sb.from("users").select("id, ordination_date, is_active").eq("id", String(letter.preacher_user_id)).maybeSingle()
          : Promise.resolve({ data: null }),
        letter.signer_user_id
          ? sb.from("users").select("id, full_name, phone, email, signature_url, stamp_pastor_url").eq("id", String(letter.signer_user_id)).maybeSingle()
          : Promise.resolve({ data: null }),
        letter.signer_totvs_id
          ? sb.from("churches").select("totvs_id, church_name, stamp_church_url, address_city, address_state").eq("totvs_id", String(letter.signer_totvs_id)).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const payload = {
        letter_id: String(letter.id || ""),
        nome: String(letter.preacher_name || ""),
        telefone: String(letter.phone || ""),
        igreja_origem: String(letter.church_origin || ""),
        origem: String(letter.church_origin || ""),
        igreja_destino: String(letter.church_destination || ""),
        dia_pregacao: formatDateBrShort(String(letter.preach_date || "")),
        data_emissao: formatDateBrLong(String(letter.created_at || "")),
        origem_totvs: parseTotvsFromText(String(letter.church_origin || "")),
        destino_totvs: parseTotvsFromText(String(letter.church_destination || "")),
        origem_nome: parseChurchNameFromText(String(letter.church_origin || "")),
        destino_nome: parseChurchNameFromText(String(letter.church_destination || "")),
        email: String(letter.email || ""),
        ministerial: String(letter.minister_role || ""),
        data_separacao: formatDateBrShort(String((preacherUser as Record<string, unknown> | null)?.ordination_date || "")),
        pastor_responsavel: String((signerUser as Record<string, unknown> | null)?.full_name || ""),
        telefone_pastor: String((signerUser as Record<string, unknown> | null)?.phone || ""),
        assinatura_url: String((signerUser as Record<string, unknown> | null)?.signature_url || ""),
        carimbo_igreja_url: String((signerChurch as Record<string, unknown> | null)?.stamp_church_url || ""),
        carimbo_pastor_url: String((signerUser as Record<string, unknown> | null)?.stamp_pastor_url || ""),
        cidade_igreja: String((signerChurch as Record<string, unknown> | null)?.address_city || ""),
        uf_igreja: String((signerChurch as Record<string, unknown> | null)?.address_state || ""),
        status_usuario: (preacherUser as Record<string, unknown> | null)?.is_active === false ? "BLOQUEADO" : "AUTORIZADO",
        status_carta: "LIBERADA",
        client_id: String(letter.church_totvs_id || ""),
        obreiro_id: String(letter.preacher_user_id || ""),
      };

      const result = await postToN8n(payload);
      if (!result.ok) {
        return json({ ok: false, error: "n8n_release_failed", details: result.response || "Webhook de liberacao falhou." }, 502);
      }

      patch = {
        status: "LIBERADA",
        released_by_name: actorName,
        released_at: now,
        raw_payload: payload,
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
      const { error: delErr } = await sb
        .from("letters")
        .delete()
        .eq("id", letterId);

      if (delErr) return json({ ok: false, error: "db_error_delete_letter", details: delErr.message }, 500);

      return json({
        ok: true,
        letter: {
          id: letterId,
          status: "EXCLUIDA",
          deleted: true,
        },
      }, 200);
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
