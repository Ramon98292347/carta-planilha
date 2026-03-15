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
  page?: number;
  page_size?: number;
  root_totvs_id?: string;
};

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

function getDirectParentTotvs(rootTotvs: string, churches: ChurchRow[]): string {
  const current = churches.find((church) => String(church.totvs_id) === rootTotvs);
  return String(current?.parent_totvs_id || "").trim();
}

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
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

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
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

    const kids = children.get(current) || [];
    for (const kid of kids) queue.push(kid);
  }

  return scope;
}

async function resolveScopeRootTotvs(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
): Promise<string> {
  if (session.role !== "pastor") return session.active_totvs_id;

  const { data, error } = await sb
    .from("churches")
    .select("totvs_id")
    .eq("pastor_user_id", session.user_id)
    .eq("is_active", true);

  if (error || !data || data.length === 0) return session.active_totvs_id;

  const pastorChurches = data
    .map((row: Record<string, unknown>) => String(row.totvs_id || ""))
    .filter(Boolean);

  if (pastorChurches.includes(session.active_totvs_id)) return session.active_totvs_id;
  return pastorChurches[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(1000, Number(body.page_size))) : 500;
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: all, error: allError } = await sb
      .from("churches")
      .select("totvs_id, parent_totvs_id");

    if (allError) return json({ ok: false, error: "db_error_scope", details: allError.message }, 500);

    const allRows = (all || []) as ChurchRow[];
    const requestedRoot = String(body.root_totvs_id || "").trim();

    let scopeList: string[] = [];

    if (session.role === "admin") {
      if (requestedRoot) {
        const hasRoot = allRows.some((church) => String(church.totvs_id) === requestedRoot);
        if (!hasRoot) return json({ ok: false, error: "church_not_found" }, 404);
        scopeList = [...computeScope(requestedRoot, allRows)];
      } else {
        scopeList = allRows.map((church) => String(church.totvs_id)).filter(Boolean);
      }
    } else if (session.role === "obreiro") {
      if (requestedRoot && requestedRoot !== session.active_totvs_id) {
        return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
      }

      scopeList = [...computeScope(session.active_totvs_id, allRows)];
    } else {
      const scopeRootTotvs = await resolveScopeRootTotvs(sb, session);
      const baseScope = computeScope(scopeRootTotvs, allRows);
      const directParentTotvs = getDirectParentTotvs(scopeRootTotvs, allRows);
      const allowedRoots = new Set<string>([scopeRootTotvs]);
      if (directParentTotvs) allowedRoots.add(directParentTotvs);

      if (requestedRoot && !allowedRoots.has(requestedRoot) && !baseScope.has(requestedRoot)) {
        return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
      }
      const effectiveRoot = requestedRoot || scopeRootTotvs;
      scopeList = [...computeScope(effectiveRoot, allRows)];
    }

    const scopeTotal = scopeList.length;

    const { data: churches, error: churchesError } = await sb
      .from("churches")
      .select(`
        totvs_id,
        parent_totvs_id,
        church_name,
        class,
        is_active,
        image_url,
        stamp_church_url,
        pastor_user_id,
        pastor:pastor_user_id (
          id,
          full_name,
          phone,
          email,
          is_active
        )
      `)
      .in("totvs_id", scopeList)
      .order("church_name", { ascending: true })
      .range(from, to);

    if (churchesError) {
      return json({ ok: false, error: "db_error_list_churches", details: churchesError.message }, 500);
    }

    const churchIdsPage = (churches || [])
      .map((church: Record<string, unknown>) => String(church.totvs_id || ""))
      .filter(Boolean);

    let workers: Array<Record<string, unknown>> = [];
    if (churchIdsPage.length > 0) {
      const { data: workersData, error: workersError } = await sb
        .from("users")
        .select("id, default_totvs_id")
        .eq("role", "obreiro")
        .eq("is_active", true)
        .in("default_totvs_id", churchIdsPage);

      if (workersError) {
        return json({ ok: false, error: "db_error_workers_count", details: workersError.message }, 500);
      }
      workers = workersData || [];
    }

    const counts = new Map<string, number>();
    for (const worker of workers) {
      const key = String(worker.default_totvs_id || "");
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const enriched = (churches || []).map((church: Record<string, unknown>) => ({
      ...church,
      workers_count: counts.get(String(church.totvs_id || "")) || 0,
    }));

    return json({ ok: true, churches: enriched, total: scopeTotal, page, page_size }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
