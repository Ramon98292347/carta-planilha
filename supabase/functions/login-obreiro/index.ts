import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import bcrypt from "npm:bcryptjs@2.4.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Configuracao do Supabase ausente." }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const totvs = String(body.totvs_church_id || "").trim();
    const phone = normalizePhone(String(body.phone || body.telefone || "").trim());
    const password = String(body.password || "").trim();

    if (!totvs || !phone || !password) {
      return json({ ok: false, error: "Preencha TOTVS, telefone e senha." }, 400);
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, church_name, pastor_name, google_sheet_url, google_form_url")
      .eq("totvs_church_id", totvs)
      .maybeSingle();

    if (clientErr || !client?.id) {
      return json({ ok: false, error: "TOTVS nao encontrado. Procure o pastor." }, 401);
    }

    const findObreiro = async () => {
      const { data, error } = await supabase
        .from("obreiros_auth")
        .select("id, nome, telefone, senha_hash, status, email, data_nascimento, data_ordenacao, cargo_ministerial, cep, endereco, numero, complemento, bairro, cidade, uf")
        .eq("client_id", client.id)
        .eq("telefone", phone)
        .maybeSingle();

      if (error) return null;
      return data || null;
    };

    const upsertFromCache = async () => {
      const { data: cacheRow } = await supabase
        .from("client_cache")
        .select("last_15_cards")
        .eq("client_id", client.id)
        .maybeSingle();

      const lastCards = Array.isArray(cacheRow?.last_15_cards) ? cacheRow.last_15_cards : [];
      const match = lastCards.find((row) => normalizePhone(String(row?.telefone || row?.phone || "")) === phone);
      if (!match) return null;

      const nome = String(match.nome || match.full_name || "Obreiro").trim() || "Obreiro";
      const email = String(match.email || match["Endereço de e-mail"] || match["Endereco de e-mail"] || "").trim();
      const status = String(match.status_usuario || match.status || "AUTORIZADO").trim() || "AUTORIZADO";
      const cargoMinisterial = String(match.funcao || match.cargo || "").trim();
      const senhaHash = await bcrypt.hash(password, 10);

      const payload = {
        client_id: client.id,
        nome,
        telefone: phone,
        senha_hash: senhaHash,
        status,
        email: email || null,
        cargo_ministerial: cargoMinisterial || null,
      };

      const { data: existing } = await supabase
        .from("obreiros_auth")
        .select("id")
        .eq("client_id", client.id)
        .eq("telefone", phone)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("obreiros_auth").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("obreiros_auth").insert(payload);
      }

      return await findObreiro();
    };

    let obreiro = await findObreiro();

    if (!obreiro) {
      obreiro = await upsertFromCache();
    }

    if (!obreiro) {
      return json({ ok: false, error: "Obreiro nao encontrado na base. Procure o pastor." }, 401);
    }

    const currentHash = String(obreiro.senha_hash || "").trim();
    if (!currentHash) {
      const senhaHash = await bcrypt.hash(password, 10);
      await supabase.from("obreiros_auth").update({ senha_hash: senhaHash }).eq("id", obreiro.id);
      obreiro.senha_hash = senhaHash;
    }

    const statusValue = String(obreiro.status || "").trim().toLowerCase();
    if (["bloqueado", "nao", "não"].includes(statusValue)) {
      return json({ ok: false, error: "Seu pastor te bloqueou. Procure ele para acessar o seu registro." }, 403);
    }

    const ok = await bcrypt.compare(password, String(obreiro.senha_hash || ""));
    if (!ok) {
      return json({ ok: false, error: "Senha incorreta. Tente novamente." }, 401);
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
      return json({ ok: false, error: "Erro ao criar sessao. Tente novamente." }, 500);
    }

    const needsAdminSetup = !client.google_form_url || !client.google_sheet_url;

    return json({
      ok: true,
      mode: "login",
      session_key: sessionKey,
      expires_at: expiresAt,
      clientId: client.id,
      church_name: client.church_name || null,
      pastor_name: client.pastor_name || null,
      google_sheet_url: client.google_sheet_url || null,
      google_form_url: client.google_form_url || null,
      google_block_form_url: null,
      google_form_url_folder: null,
      obreiro_name: obreiro.nome || null,
      obreiro_phone: obreiro.telefone || null,
      obreiro_status: obreiro.status || null,
      obreiro_email: obreiro.email || null,
      obreiro_data_nascimento: obreiro.data_nascimento || null,
      obreiro_data_ordenacao: obreiro.data_ordenacao || null,
      obreiro_cargo_ministerial: obreiro.cargo_ministerial || null,
      obreiro_cep: obreiro.cep || null,
      obreiro_endereco: obreiro.endereco || null,
      obreiro_numero: obreiro.numero || null,
      obreiro_complemento: obreiro.complemento || null,
      obreiro_bairro: obreiro.bairro || null,
      obreiro_cidade: obreiro.cidade || null,
      obreiro_uf: obreiro.uf || null,
      needs_admin_setup: needsAdminSetup,
    });
  } catch {
    return json({ ok: false, error: "Falha inesperada no login." }, 500);
  }
});
