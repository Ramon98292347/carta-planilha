import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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

type Body = {
  cpf?: string;
  full_name?: string;
  password?: string;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  minister_role?: string | null;
  default_totvs_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const full_name = String(body.full_name || "").trim();
    const password = String(body.password || "");
    const phone = onlyDigits(String(body.phone || ""));
    const email = String(body.email || "").trim() || null;
    const birth_date = String(body.birth_date || "").trim() || null;
    const minister_role = String(body.minister_role || "").trim() || null;
    const default_totvs_id = String(body.default_totvs_id || "").trim();

    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!full_name) return json({ ok: false, error: "missing_full_name" }, 400);
    if (!default_totvs_id) return json({ ok: false, error: "missing_default_totvs_id" }, 400);
    if (!phone) return json({ ok: false, error: "missing_phone" }, 400);
    if (!password || password.length < 6) return json({ ok: false, error: "weak_password" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "missing_server_secrets" }, 500);
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Comentario: o pedido publico so aceita igrejas ja cadastradas.
    const { data: church, error: churchErr } = await sb
      .from("churches")
      .select("totvs_id, church_name")
      .eq("totvs_id", default_totvs_id)
      .maybeSingle();

    if (churchErr) return json({ ok: false, error: "db_error_church", details: churchErr.message }, 500);
    if (!church) return json({ ok: false, error: "church_not_found" }, 404);

    const { data: existingUser, error: existingErr } = await sb
      .from("users")
      .select("id, role, is_active, totvs_access, default_totvs_id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (existingErr) return json({ ok: false, error: "db_error_existing_user", details: existingErr.message }, 500);

    // Comentario: se ja existe um pastor/admin com esse CPF, nao deixamos
    // a solicitacao sobrescrever um perfil privilegiado.
    const existingRole = String(existingUser?.role || "").toLowerCase();
    if (existingRole === "pastor" || existingRole === "admin") {
      return json({ ok: false, error: "existing_privileged_user" }, 409);
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const totvs_access =
      Array.isArray(existingUser?.totvs_access) && existingUser.totvs_access.length > 0
        ? existingUser.totvs_access
        : [{ totvs_id: default_totvs_id, role: "obreiro" }];

    // Comentario: novo cadastro entra como inativo/pendente.
    // Assim o pastor ou admin revisa o perfil e decide a liberacao depois.
    const payload = {
      cpf,
      full_name,
      role: "obreiro",
      // Comentario: no banco novo `users.phone` e obrigatorio,
      // entao a solicitacao publica ja precisa trazer esse dado.
      phone,
      email,
      birth_date,
      minister_role,
      password_hash,
      totvs_access,
      default_totvs_id: String(existingUser?.default_totvs_id || default_totvs_id),
      is_active: false,
    };

    const { data: saved, error: saveErr } = await sb
      .from("users")
      .upsert(payload, { onConflict: "cpf" })
      .select("id, cpf, full_name, role, is_active, default_totvs_id")
      .single();

    if (saveErr) return json({ ok: false, error: "db_error_save_user", details: saveErr.message }, 500);

    return json(
      {
        ok: true,
        mode: existingUser ? "updated_request" : "created_request",
        message: "Solicitacao enviada. O pastor ou admin precisa revisar o cadastro.",
        church_name: String(church.church_name || ""),
        user: saved,
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
