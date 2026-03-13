import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Body = {
  totvs_church_id?: string;
  password?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Body;
    const totvsId = String(body.totvs_church_id || "").trim();
    const password = String(body.password || "").trim();

    if (!totvsId) return json({ ok: false, error: "missing_totvs_church_id" }, 400);
    if (!password) return json({ ok: false, error: "missing_password" }, 400);
    if (password.length < 6) return json({ ok: false, error: "weak_password" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        {
          ok: false,
          error: "missing_secrets",
          detail: "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
        },
        500
      );
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing, error: findErr } = await sb
      .from("clients")
      .select("id,password_hash,license_status,license_expires_at,church_name,pastor_name,google_sheet_url,google_form_url,google_block_form_url")
      .eq("totvs_church_id", totvsId)
      .maybeSingle();

    if (findErr) return json({ ok: false, error: "db_error", details: findErr.message }, 500);

    let clientId: string;
    let mode: "login" | "signup" = "login";

    if (existing) {
      const status = String(existing.license_status || "trial").toLowerCase();
      const exp = existing.license_expires_at ? new Date(existing.license_expires_at) : null;
      const expired = exp ? exp.getTime() < Date.now() : false;
      if (status === "blocked" || status === "overdue" || expired) {
        return json({ ok: false, error: "license_blocked" }, 403);
      }

      const stored = String(existing.password_hash || "").trim();

      // Primeiro acesso do cliente sem senha definida: cria hash e salva.
      if (!stored) {
        const newHash = await makePasswordHash(password);
        const { error: updateErr } = await sb.from("clients").update({ password_hash: newHash }).eq("id", existing.id);
        if (updateErr) return json({ ok: false, error: "password_set_failed", details: updateErr.message }, 500);
      } else {
        const ok = await verifyPassword(password, stored);
        if (!ok) return json({ ok: false, error: "invalid_credentials" }, 401);
      }

      clientId = existing.id;
    } else {
      mode = "signup";

      const password_hash = await makePasswordHash(password);
      const name = `Cliente ${totvsId}`;

      const { data: created, error: createErr } = await sb
        .from("clients")
        .insert({
          totvs_church_id: totvsId,
          name,
          password_hash,
          license_status: "trial",
          gas_delete_url: "PENDING",
          gas_delete_key: "PENDING",
        })
        .select("id")
        .single();

      if (createErr || !created) {
        return json({ ok: false, error: "signup_failed", details: createErr?.message || "unknown" }, 500);
      }

      clientId = created.id;
    }

    const session_key = crypto.randomUUID().replaceAll("-", "");
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessionErr } = await sb.from("client_sessions").insert({
      session_key,
      client_id: clientId,
      expires_at,
    });
    const sessionWarning =
      sessionErr && sessionErr.message && /client_sessions|does not exist|relation/i.test(sessionErr.message)
        ? "client_sessions_missing"
        : null;
    if (sessionErr && !sessionWarning) {
      return json({ ok: false, error: "session_create_failed", details: sessionErr.message }, 500);
    }

    // Tenta ler com google_form_url_folder; se a coluna nao existir, faz fallback sem ela.
    let clientData: Record<string, string | null> | null = null;
    {
      const withFolder = await sb
        .from("clients")
        .select("church_name,pastor_name,google_sheet_url,google_form_url,google_block_form_url,google_form_url_folder")
        .eq("id", clientId)
        .single();
      if (!withFolder.error && withFolder.data) {
        clientData = withFolder.data as unknown as Record<string, string | null>;
      } else {
        const fallback = await sb
          .from("clients")
          .select("church_name,pastor_name,google_sheet_url,google_form_url,google_block_form_url")
          .eq("id", clientId)
          .single();
        if (fallback.error) {
          return json({ ok: false, error: "read_client_failed", details: fallback.error.message }, 500);
        }
        clientData = {
          ...(fallback.data as unknown as Record<string, string | null>),
          google_form_url_folder: null,
        };
      }
    }

    return json(
      {
        ok: true,
        mode,
        session_key,
        expires_at,
        clientId,
        client_id: clientId,
        church_name: clientData?.church_name ?? null,
        pastor_name: clientData?.pastor_name ?? null,
        google_sheet_url: clientData?.google_sheet_url ?? null,
        google_form_url: clientData?.google_form_url ?? null,
        google_block_form_url: clientData?.google_block_form_url ?? null,
        google_form_url_folder: clientData?.google_form_url_folder ?? null,
        needs_admin_setup:
          !(clientData?.google_block_form_url) ||
          !(clientData?.google_form_url || clientData?.google_sheet_url),
        ...(sessionWarning ? { warning: sessionWarning } : {}),
      },
      200
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: "exception",
        message: String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      500
    );
  }
});

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

function randomSalt(bytes = 16) {
  const salt = new Uint8Array(bytes);
  crypto.getRandomValues(salt);
  return salt;
}

function toBase64(u8: Uint8Array) {
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function makePasswordHash(password: string) {
  const iterations = 120_000;
  const salt = randomSalt(16);
  const derived = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(derived)}`;
}

async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64(parts[2]);
  const expected = parts[3];
  const derived = await pbkdf2(password, salt, iterations);
  return toBase64(derived) === expected;
}
