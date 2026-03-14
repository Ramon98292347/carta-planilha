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
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";
type PreachPeriod = "MANHA" | "TARDE" | "NOITE";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  preacher_name?: string;
  minister_role?: string;
  preach_date?: string;
  preach_period?: PreachPeriod;
  church_origin?: string;
  church_destination?: string;
  preacher_user_id?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ChurchNode = {
  totvs_id: string;
  parent_totvs_id: string | null;
  church_name: string | null;
  class: ChurchClass | null;
  stamp_church_url: string | null;
  pastor_user_id: string | null;
  address_city: string | null;
  address_state: string | null;
};

function normalizeClass(v: unknown): ChurchClass | null {
  const s = String(v || "").toLowerCase().trim();
  if (s === "estadual" || s === "setorial" || s === "central" || s === "regional" || s === "local") return s;
  return null;
}

function parseTotvsFromText(value: string): string {
  const m = String(value || "").trim().match(/^(\d{3,})\b/);
  return m ? m[1] : "";
}

function mapById(churches: ChurchNode[]) {
  const byId = new Map<string, ChurchNode>();
  for (const c of churches) byId.set(c.totvs_id, c);
  return byId;
}

function computeScope(rootTotvs: string, churches: ChurchNode[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(c.totvs_id);
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];
  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);
    for (const k of children.get(cur) || []) queue.push(k);
  }
  return scope;
}

function collectAncestors(startTotvs: string, churches: ChurchNode[]): Set<string> {
  const byId = mapById(churches);
  const out = new Set<string>();
  let cur: string | null = startTotvs;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    const parent = row.parent_totvs_id ? String(row.parent_totvs_id) : "";
    if (parent) out.add(parent);
    cur = parent || null;
  }
  return out;
}

function getDirectParentChurch(startTotvs: string, churches: ChurchNode[]): ChurchNode | null {
  const byId = mapById(churches);
  const parentId = byId.get(startTotvs)?.parent_totvs_id || null;
  if (!parentId) return null;
  return byId.get(parentId) || null;
}

function findFirstAncestorByClass(startTotvs: string, churches: ChurchNode[], targetClass: ChurchClass): ChurchNode | null {
  const byId = mapById(churches);
  let cur = byId.get(startTotvs)?.parent_totvs_id || null;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) return null;
    if (row.class === targetClass) return row;
    cur = row.parent_totvs_id || null;
  }
  return null;
}

function resolveAllowedOriginTotvs(session: SessionClaims, activeChurch: ChurchNode, churches: ChurchNode[]): Set<string> {
  const allowed = new Set<string>();
  const activeTotvs = session.active_totvs_id;

  if (session.role === "obreiro") {
    allowed.add(activeTotvs);
    return allowed;
  }

  if (session.role === "pastor") {
    allowed.add(activeTotvs);
    const directParent = getDirectParentChurch(activeTotvs, churches);
    if (directParent) allowed.add(directParent.totvs_id);
    return allowed;
  }

  if (activeChurch.class === "estadual") {
    allowed.add(activeTotvs);
    return allowed;
  }

  if (activeChurch.class === "setorial") {
    allowed.add(activeTotvs);
    const estadual = findFirstAncestorByClass(activeTotvs, churches, "estadual");
    if (estadual) allowed.add(estadual.totvs_id);
    return allowed;
  }

  if (activeChurch.class === "central") {
    allowed.add(activeTotvs);
    const setorial = findFirstAncestorByClass(activeTotvs, churches, "setorial");
    if (setorial) allowed.add(setorial.totvs_id);
    const estadual = findFirstAncestorByClass(activeTotvs, churches, "estadual");
    if (estadual) allowed.add(estadual.totvs_id);
    return allowed;
  }

  const directParent = getDirectParentChurch(activeTotvs, churches);
  if (directParent) allowed.add(directParent.totvs_id);
  allowed.add(activeTotvs);
  return allowed;
}

function findFirstAncestorByClassWithPastor(startTotvs: string, churches: ChurchNode[], targetClass: ChurchClass): ChurchNode | null {
  const byId = mapById(churches);
  let cur = byId.get(startTotvs)?.parent_totvs_id || null;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) return null;
    if (row.class === targetClass && String(row.pastor_user_id || "").trim()) return row;
    cur = row.parent_totvs_id || null;
  }
  return null;
}

function resolveSignerChurch(originTotvsId: string, churches: ChurchNode[]): ChurchNode | null {
  const byId = mapById(churches);
  const active = byId.get(originTotvsId) || null;
  if (!active || !active.class) return null;

  if (active.class === "regional" || active.class === "local") {
    return findFirstAncestorByClassWithPastor(originTotvsId, churches, "central");
  }

  if (String(active.pastor_user_id || "").trim()) return active;

  let cur = active.parent_totvs_id || null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    if (String(row.pastor_user_id || "").trim()) return row;
    cur = row.parent_totvs_id || null;
  }
  return null;
}

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
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

function parseDateYYYYMMDD(s: string): Date | null {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const preach_date_str = String(body.preach_date || "").trim();
    const church_origin = String(body.church_origin || "").trim();
    const church_destination = String(body.church_destination || "").trim();
    const preach_period = String(body.preach_period || "NOITE").trim().toUpperCase() as PreachPeriod;

    if (!["MANHA", "TARDE", "NOITE"].includes(preach_period)) return json({ ok: false, error: "invalid_preach_period" }, 400);
    if (!preach_date_str) return json({ ok: false, error: "missing_preach_date" }, 400);
    if (!church_origin) return json({ ok: false, error: "missing_church_origin" }, 400);
    if (!church_destination) return json({ ok: false, error: "missing_church_destination" }, 400);

    const preachDate = parseDateYYYYMMDD(preach_date_str);
    if (!preachDate) return json({ ok: false, error: "invalid_preach_date_format" }, 400);

    const today = todayUTC();
    if (preachDate.getTime() < today.getTime()) return json({ ok: false, error: "preach_date_in_past" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: churchesRaw, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id,church_name,class,stamp_church_url,pastor_user_id,address_city,address_state");

    if (churchesErr) return json({ ok: false, error: "db_error_church_tree", details: churchesErr.message }, 500);

    const churches: ChurchNode[] = ((churchesRaw || []) as Record<string, unknown>[]).map((r) => ({
      totvs_id: String(r.totvs_id || ""),
      parent_totvs_id: r.parent_totvs_id ? String(r.parent_totvs_id) : null,
      church_name: r.church_name ? String(r.church_name) : null,
      class: normalizeClass(r.class),
      stamp_church_url: r.stamp_church_url ? String(r.stamp_church_url) : null,
      pastor_user_id: r.pastor_user_id ? String(r.pastor_user_id) : null,
      address_city: r.address_city ? String(r.address_city) : null,
      address_state: r.address_state ? String(r.address_state) : null,
    }));

    const byId = mapById(churches);
    const activeChurch = byId.get(session.active_totvs_id) || null;
    if (!activeChurch) return json({ ok: false, error: "church_not_found" }, 404);

    const originTotvs = parseTotvsFromText(church_origin) || session.active_totvs_id;
    if (!byId.has(originTotvs)) return json({ ok: false, error: "origin_church_not_found" }, 404);

    const allowedOrigins = resolveAllowedOriginTotvs(session, activeChurch, churches);
    if (!allowedOrigins.has(originTotvs)) {
      return json({
        ok: false,
        error: "origin_out_of_allowed",
        detail: "Origem invalida para sua hierarquia. Use sua igreja ou a igreja mae permitida.",
        allowed_origins: [...allowedOrigins],
      }, 403);
    }

    const destinationTotvs = parseTotvsFromText(church_destination);
    if (!destinationTotvs) {
      return json({ ok: false, error: "destination_totvs_required", detail: "Selecione a igreja destino da lista com TOTVS." }, 400);
    }

    if (!byId.has(destinationTotvs)) return json({ ok: false, error: "destination_church_not_found" }, 404);

    const ownershipTotvs = session.active_totvs_id;
    const activeScope = computeScope(ownershipTotvs, churches);
    const activeAncestors = collectAncestors(ownershipTotvs, churches);
    const allowedDestinations = new Set<string>([...activeScope, ...activeAncestors]);

    if (!allowedDestinations.has(destinationTotvs)) {
      return json({
        ok: false,
        error: "destination_out_of_scope",
        detail: "Destino fora do seu escopo e da sua cadeia acima.",
      }, 403);
    }

    // Regra do pastor: se o destino estiver acima da igreja dele, a origem deve ser sempre a mae direta.
    if (session.role === "pastor" && activeAncestors.has(destinationTotvs)) {
      const directParent = getDirectParentChurch(ownershipTotvs, churches);
      if (!directParent) {
        return json({
          ok: false,
          error: "parent_origin_required_but_missing",
          detail: "Nao existe igreja mae configurada para sua igreja.",
        }, 409);
      }
      if (originTotvs !== directParent.totvs_id) {
        return json({
          ok: false,
          error: "origin_must_be_direct_parent",
          detail: "Para destino acima da sua igreja, a origem deve ser sempre a igreja mae.",
          required_origin_totvs_id: directParent.totvs_id,
        }, 403);
      }
    }

    const signerChurch = resolveSignerChurch(originTotvs, churches);
    if (!signerChurch) return json({ ok: false, error: "signer_not_found_for_class_rule" }, 409);

    const signerPastorId = String(signerChurch.pastor_user_id || "").trim();
    if (!signerPastorId) return json({ ok: false, error: "signer_pastor_not_defined" }, 409);

    const { data: pastorUser, error: pErr } = await sb
      .from("users")
      .select("id, full_name, phone, email, signature_url, stamp_pastor_url")
      .eq("id", signerPastorId)
      .maybeSingle();

    if (pErr) return json({ ok: false, error: "db_error_pastor", details: pErr.message }, 500);
    if (!pastorUser) return json({ ok: false, error: "pastor_not_found" }, 404);

    const { data: actorUser } = await sb
      .from("users")
      .select("id, full_name, phone, email, minister_role")
      .eq("id", session.user_id)
      .maybeSingle();

    const originChurch = byId.get(originTotvs) || null;
    const originPastorId = String(originChurch?.pastor_user_id || "").trim();
    let originPastorUser: Record<string, unknown> | null = null;
    if (originPastorId) {
      const { data } = await sb
        .from("users")
        .select("id, full_name, phone, email")
        .eq("id", originPastorId)
        .maybeSingle();
      originPastorUser = (data as Record<string, unknown> | null) || null;
    }

    let preacher_user_id: string | null = body.preacher_user_id ?? null;
    let preacher_name = String(body.preacher_name || "").trim();
    let minister_role = String(body.minister_role || "").trim();
    let preacher_phone = String(body.phone || "").trim() || null;
    let preacher_email = String(body.email || "").trim() || null;
    let preacher_ordination_date = "";

    let status = "AGUARDANDO_LIBERACAO";
    let canDirectRelease = false;

    if (session.role === "obreiro") {
      const { data: me, error: meErr } = await sb
        .from("users")
        .select("id, full_name, minister_role, phone, email, can_create_released_letter, ordination_date")
        .eq("id", session.user_id)
        .maybeSingle();

      if (meErr) return json({ ok: false, error: "db_error_me", details: meErr.message }, 500);
      if (!me) return json({ ok: false, error: "me_not_found" }, 404);

      preacher_user_id = String(me.id);
      preacher_name = String(me.full_name || "").trim();
      minister_role = String(me.minister_role || "").trim();
      preacher_phone = String((me as Record<string, unknown>).phone || "").trim() || null;
      preacher_email = String((me as Record<string, unknown>).email || "").trim() || null;
      preacher_ordination_date = String((me as Record<string, unknown>).ordination_date || "").trim();
      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name_in_profile" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role_in_profile" }, 400);
      canDirectRelease = Boolean((me as Record<string, unknown>).can_create_released_letter);
    } else {
      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role" }, 400);
      if (!preacher_user_id) {
        return json({
          ok: false,
          error: "missing_preacher_user_id",
          detail: "A carta precisa estar vinculada ao usuario alvo para validar a liberacao automatica.",
        }, 400);
      }

      const { data: target, error: targetErr } = await sb
        .from("users")
        .select("id, phone, email, can_create_released_letter, ordination_date")
        .eq("id", preacher_user_id)
        .maybeSingle();

      if (targetErr) return json({ ok: false, error: "db_error_target_user", details: targetErr.message }, 500);
      canDirectRelease = Boolean((target as Record<string, unknown> | null)?.can_create_released_letter);
      if (!preacher_phone) preacher_phone = String((target as Record<string, unknown> | null)?.phone || "").trim() || null;
      if (!preacher_email) preacher_email = String((target as Record<string, unknown> | null)?.email || "").trim() || null;
      preacher_ordination_date = String((target as Record<string, unknown> | null)?.ordination_date || "").trim();
    }

    if (canDirectRelease) status = "LIBERADA";

    const { data: created, error: insErr } = await sb
      .from("letters")
      .insert({
        church_totvs_id: ownershipTotvs,
        preacher_user_id,
        preacher_name,
        minister_role,
        preach_date: preach_date_str,
        preach_period,
        church_origin,
        church_destination,
        phone: preacher_phone,
        email: preacher_email,
        storage_path: null,
        status,
        signer_user_id: signerPastorId,
        signer_totvs_id: signerChurch.totvs_id,
      })
      .select("id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, created_at, raw_payload, webhook_response")
      .single();

    if (insErr) return json({ ok: false, error: "insert_failed", details: insErr.message }, 400);

    const n8nPayload = {
      nome: created.preacher_name || "",
      telefone: preacher_phone || "",
      igreja_origem: created.church_origin || "",
      origem: created.church_origin || "",
      igreja_destino: created.church_destination || "",
      dia_pregacao: formatDateBrShort(created.preach_date || ""),
      data_emissao: formatDateBrLong(created.created_at || ""),
      origem_totvs: originTotvs || "",
      destino_totvs: destinationTotvs || "",
      origem_nome: originChurch?.church_name || parseChurchNameFromText(created.church_origin || ""),
      destino_nome: parseChurchNameFromText(created.church_destination || ""),
      email: preacher_email || "",
      ministerial: created.minister_role || "",
      data_separacao: preacher_ordination_date || "",
      pastor_responsavel: String((pastorUser as Record<string, unknown>).full_name || ""),
      telefone_pastor: String((pastorUser as Record<string, unknown>).phone || ""),
      assinatura_url: String((pastorUser as Record<string, unknown>).signature_url || ""),
      carimbo_igreja_url: signerChurch.stamp_church_url || "",
      carimbo_pastor_url: String((pastorUser as Record<string, unknown>).stamp_pastor_url || ""),
      cidade_igreja: signerChurch.address_city || "",
      uf_igreja: signerChurch.address_state || "",
      status_usuario: "AUTORIZADO",
      status_carta: created.status || "",
      client_id: created.church_totvs_id || "",
      obreiro_id: created.preacher_user_id || "",
    };

    let n8nOk = false;
    let n8nStatus = 0;
    let n8nResponse: unknown = null;

    if (status === "LIBERADA") {
      const result = await postToN8n(n8nPayload);
      n8nOk = result.ok;
      n8nStatus = result.status;
      n8nResponse = result.response;
    }

    await sb
      .from("letters")
      .update({
        raw_payload: n8nPayload,
        webhook_response: n8nResponse || {},
      })
      .eq("id", created.id);

    try {
      const notificationTitle = status === "LIBERADA" ? "Carta liberada criada" : "Nova carta aguardando liberacao";
      const notificationMessage = `${preacher_name} - ${created.preach_date} (${created.preach_period})`;
      await sb.from("notifications").insert([
        {
          church_totvs_id: ownershipTotvs,
          user_id: signerPastorId,
          type: "LETTER_CREATED",
          title: notificationTitle,
          message: notificationMessage,
          is_read: false,
          related_id: String(created.id),
          data: { letter_id: created.id, status: created.status, preacher_name, preacher_user_id, phone: preacher_phone, email: preacher_email },
        },
        {
          church_totvs_id: ownershipTotvs,
          user_id: null,
          type: "LETTER_CREATED",
          title: notificationTitle,
          message: notificationMessage,
          is_read: false,
          related_id: String(created.id),
          data: { letter_id: created.id, status: created.status, preacher_name, preacher_user_id },
        },
      ]);
    } catch {
      // notificacao nao pode quebrar o fluxo principal
    }

    return json({ ok: true, letter: created, n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse } }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
