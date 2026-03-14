import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { SignJWT } from "https://esm.sh/jose@5.2.4";

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

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

type TotvsAccessItem = string | { totvs_id?: string; role?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type Body = { cpf?: string; password?: string };

type NormalizedAccess = { totvs_id: string; role: string };

function normalizeTotvsAccess(arr: unknown, defaultRole: string): NormalizedAccess[] {
  const out: NormalizedAccess[] = [];
  if (!Array.isArray(arr)) return out;

  const allowed = new Set(["admin", "pastor", "obreiro"]);
  const safeDefault = allowed.has(defaultRole) ? defaultRole : "obreiro";

  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const totvsId = item.trim();
      if (totvsId) out.push({ totvs_id: totvsId, role: safeDefault });
      continue;
    }

    if (item && typeof item === "object") {
      const totvsId = String(item.totvs_id || "").trim();
      const roleRaw = String(item.role || safeDefault).trim().toLowerCase();
      const role = allowed.has(roleRaw) ? roleRaw : safeDefault;
      if (totvsId) out.push({ totvs_id: totvsId, role });
    }
  }

  const unique = new Map<string, NormalizedAccess>();
  for (const item of out) unique.set(item.totvs_id, item);
  return [...unique.values()];
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): string[] {
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = church.parent_totvs_id || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(church.totvs_id));
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];

  while (queue.length) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }

  return [...scope];
}

function computeRootTotvs(activeTotvs: string, churches: ChurchRow[]): string {
  const parentById = new Map<string, string | null>();
  for (const church of churches) {
    parentById.set(String(church.totvs_id), church.parent_totvs_id ? String(church.parent_totvs_id) : null);
  }

  let current = activeTotvs;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(current)) return activeTotvs;
    visited.add(current);

    const parent = parentById.get(current) ?? null;
    if (!parent) return current;
    current = parent;
  }
}

async function signAppToken(payload: { sub: string; app_role: string; active_totvs_id: string }) {
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: payload.app_role,
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

// Comentario: esse token e usado nas leituras REST com RLS.
// O nome da env foi trocado para APP_RLS_JWT_SECRET porque o painel
// das Functions nao aceita criar secrets com prefixo SUPABASE_.
async function signRlsToken(payload: {
  sub: string;
  app_role: string;
  active_totvs_id: string;
  scope_totvs_ids: string[];
  root_totvs_id: string;
}) {
  const secret = Deno.env.get("APP_RLS_JWT_SECRET") || "";
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: "authenticated",
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
    scope_totvs_ids: payload.scope_totvs_ids,
    root_totvs_id: payload.root_totvs_id,
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const password = String(body.password || "");

    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!password) return json({ ok: false, error: "missing_password" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "missing_supabase_secrets" }, 500);
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { data: user, error: userError } = await sb
      .from("users")
      .select("id, cpf, full_name, role, password_hash, is_active, totvs_access, default_totvs_id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (userError) return json({ ok: false, error: "db_error", details: userError.message }, 500);
    if (!user) return json({ ok: false, error: "invalid_credentials" }, 401);
    if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

    const userRole = String(user.role || "obreiro").toLowerCase();
    const currentHash = user.password_hash ? String(user.password_hash) : "";

    if (!currentHash) {
      // Comentario: primeiro login de base importada sem senha definida.
      const newHash = bcrypt.hashSync(password, 10);
      const { error: setPasswordError } = await sb.from("users").update({ password_hash: newHash }).eq("id", user.id);
      if (setPasswordError) {
        return json({ ok: false, error: "set_password_failed", details: setPasswordError.message }, 500);
      }
    } else {
      const valid = bcrypt.compareSync(password, currentHash);
      if (!valid) return json({ ok: false, error: "invalid_credentials" }, 401);
    }

    let access = normalizeTotvsAccess(user.totvs_access, userRole);

    // Comentario: fallback para usuarios antigos sem totvs_access.
    if (access.length === 0) {
      const defaultTotvsFallback = String(user.default_totvs_id || "").trim();
      if (defaultTotvsFallback) {
        access = [{ totvs_id: defaultTotvsFallback, role: userRole }];
        await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
      }
    }

    // Comentario: admin sem escopo definido recebe acesso a todas as igrejas.
    if (access.length === 0 && userRole === "admin") {
      const { data: allForAdmin, error: adminAccessError } = await sb
        .from("churches")
        .select("totvs_id")
        .order("totvs_id", { ascending: true });

      if (adminAccessError) {
        return json({ ok: false, error: "db_error_admin_access", details: adminAccessError.message }, 500);
      }

      const ids = (allForAdmin || []).map((church) => String(church.totvs_id || "")).filter(Boolean);
      access = ids.map((id) => ({ totvs_id: id, role: "admin" }));
      if (ids.length > 0) {
        await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
      }
    }

    if (access.length === 0) {
      return json({ ok: false, error: "no_totvs_access", message: "Usuario sem acesso de igreja." }, 403);
    }

    const totvsIds = access.map((item) => item.totvs_id);

    const { data: churchesMeta, error: churchesMetaError } = await sb
      .from("churches")
      .select("totvs_id, church_name, class, parent_totvs_id")
      .in("totvs_id", totvsIds);

    if (churchesMetaError) {
      return json({ ok: false, error: "db_error_churches_meta", details: churchesMetaError.message }, 500);
    }

    const metaByTotvs = new Map<string, Record<string, unknown>>();
    for (const church of churchesMeta || []) {
      metaByTotvs.set(String(church.totvs_id), church as Record<string, unknown>);
    }

    const churchesForUI = access.map((item) => {
      const meta = metaByTotvs.get(item.totvs_id);
      return {
        totvs_id: item.totvs_id,
        role: item.role,
        church_name: String(meta?.church_name || ""),
        church_class: String(meta?.class || ""),
      };
    });

    const defaultTotvs = String(user.default_totvs_id || "").trim();
    const defaultAllowed = defaultTotvs && totvsIds.includes(defaultTotvs) ? defaultTotvs : "";
    const pastorAccess = access.filter((item) => item.role === "pastor").map((item) => item.totvs_id);

    let activeTotvs = "";
    if (userRole === "pastor") {
      if (defaultAllowed && pastorAccess.includes(defaultAllowed)) activeTotvs = defaultAllowed;
      else if (pastorAccess.length === 1) activeTotvs = pastorAccess[0];
      else if (defaultAllowed) activeTotvs = defaultAllowed;
      else if (churchesForUI.length === 1) activeTotvs = churchesForUI[0].totvs_id;
    } else if (userRole === "admin") {
      activeTotvs = defaultAllowed || (churchesForUI.length > 0 ? churchesForUI[0].totvs_id : "");
    } else {
      activeTotvs = defaultAllowed || (churchesForUI.length === 1 ? churchesForUI[0].totvs_id : "");
    }

    if (!activeTotvs) {
      return json(
        {
          ok: true,
          mode: "select_church",
          cpf: user.cpf,
          user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
          churches: churchesForUI,
        },
        200,
      );
    }

    const { data: allChurches, error: allChurchesError } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (allChurchesError) {
      return json({ ok: false, error: "db_error_scope", details: allChurchesError.message }, 500);
    }

    const all = (allChurches || []) as ChurchRow[];
    const scope_totvs_ids =
      userRole === "admin"
        ? all.map((church) => String(church.totvs_id || "")).filter(Boolean)
        : computeScope(activeTotvs, all);

    const root_totvs_id = computeRootTotvs(activeTotvs, all);
    const activeMeta = metaByTotvs.get(activeTotvs);

    const token = await signAppToken({
      sub: String(user.id),
      app_role: userRole,
      active_totvs_id: activeTotvs,
    });
    if (!token) return json({ ok: false, error: "missing_app_jwt_secret" }, 500);

    const rls_token = await signRlsToken({
      sub: String(user.id),
      app_role: userRole,
      active_totvs_id: activeTotvs,
      scope_totvs_ids,
      root_totvs_id,
    });
    if (!rls_token) return json({ ok: false, error: "missing_app_rls_jwt_secret" }, 500);

    return json(
      {
        ok: true,
        mode: "logged_in",
        token,
        rls_token,
        user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
        session: {
          totvs_id: activeTotvs,
          church_name: String(activeMeta?.church_name || ""),
          church_class: String(activeMeta?.class || ""),
          scope_totvs_ids,
          root_totvs_id,
        },
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
