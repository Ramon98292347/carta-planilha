import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import bcrypt from "npm:bcryptjs@2.4.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Missing env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const totvs = (body.totvs_church_id || "").trim();
    const phone = normalizePhone((body.phone || "").trim());
    const password = (body.password || "").trim();

    if (!totvs || !phone || !password) {
      return new Response(JSON.stringify({ ok: false, error: "Missing data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, church_name, pastor_name, google_sheet_url, google_form_url, google_block_form_url, google_form_url_folder")
      .eq("totvs_church_id", totvs)
      .limit(1);

    if (clientErr || !clients || clients.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Igreja não encontrada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = clients[0];

    const findObreiro = async () => {
      const { data, error } = await supabase
        .from("obreiros_auth")
        .select("id, nome, telefone, senha_hash, status")
        .eq("client_id", client.id)
        .eq("telefone", phone)
        .limit(1);
      if (error || !data || data.length === 0) return null;
      return data[0];
    };

    let obreiro = await findObreiro();

    if (!obreiro) {
      const { data: cacheRows } = await supabase
        .from("client_cache")
        .select("last_15_cards")
        .eq("client_id", client.id)
        .limit(1);

      const lastCards = (cacheRows?.[0]?.last_15_cards || []) as Array<Record<string, string>>;
      const match = lastCards.find((row) => normalizePhone(row.telefone || row.phone || "") === phone);

      if (match) {
        const nome = (match.nome || "").trim() || "Obreiro";
        const status = (match.status || "AUTORIZADO").trim() || "AUTORIZADO";
        const senhaHash = await bcrypt.hash(password, 10);

        await supabase.from("obreiros_auth").insert({
          client_id: client.id,
          nome,
          telefone: phone,
          senha_hash: senhaHash,
          status,
        });

        obreiro = await findObreiro();
      }
    }

    if (!obreiro) {
      return new Response(JSON.stringify({ ok: false, error: "Obreiro não encontrado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusValue = (obreiro.status || "").trim().toLowerCase();
    if (["bloqueado", "nao", "não"].includes(statusValue)) {
      return new Response(JSON.stringify({ ok: false, error: "Obreiro bloqueado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await bcrypt.compare(password, obreiro.senha_hash);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: "Senha inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionKey = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { error: sessionErr } = await supabase.from("obreiro_sessions").insert({
      session_key: sessionKey,
      obreiro_id: obreiro.id,
      client_id: client.id,
      expires_at: expiresAt,
    });

    if (sessionErr) {
      return new Response(JSON.stringify({ ok: false, error: "Erro ao criar sessão" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const needsAdminSetup = !client.google_form_url || !client.google_sheet_url;

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "login",
        session_key: sessionKey,
        expires_at: expiresAt,
        clientId: client.id,
        church_name: client.church_name || null,
        pastor_name: client.pastor_name || null,
        google_sheet_url: client.google_sheet_url || null,
        google_form_url: client.google_form_url || null,
        google_block_form_url: client.google_block_form_url || null,
        google_form_url_folder: client.google_form_url_folder || null,
        obreiro_name: obreiro.nome || null,
        obreiro_phone: obreiro.telefone || null,
        obreiro_status: obreiro.status || null,
        needs_admin_setup: needsAdminSetup,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
