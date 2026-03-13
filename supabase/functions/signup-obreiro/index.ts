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
    const nome = String(body.nome || "").trim();
    const phone = normalizePhone(String(body.telefone || body.phone || "").trim());
    const password = String(body.password || "").trim();
    const status = String(body.status || "AUTORIZADO").trim() || "AUTORIZADO";
    const email = String(body.email || "").trim();
    const dataNascimento = String(body.data_nascimento || "").trim();
    const dataOrdenacao = String(body.data_ordenacao || "").trim();
    const cep = String(body.cep || "").trim();
    const endereco = String(body.endereco || "").trim();
    const numero = String(body.numero || "").trim();
    const complemento = String(body.complemento || "").trim();
    const bairro = String(body.bairro || "").trim();
    const cidade = String(body.cidade || "").trim();
    const uf = String(body.uf || "").trim();

    if (!totvs || !nome || !phone || !password) {
      return json({ ok: false, error: "Preencha TOTVS, nome, telefone e senha." }, 400);
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("totvs_church_id", totvs)
      .maybeSingle();

    if (clientErr || !client?.id) {
      return json({ ok: false, error: "TOTVS nao encontrado. Procure o pastor." }, 404);
    }

    const senhaHash = await bcrypt.hash(password, 10);

    const payload = {
      client_id: client.id,
      nome,
      telefone: phone,
      senha_hash: senhaHash,
      status,
      email: email || null,
      data_nascimento: dataNascimento || null,
      data_ordenacao: dataOrdenacao || null,
      cep: cep || null,
      endereco: endereco || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
    };

    const { data: existing, error: existingErr } = await supabase
      .from("obreiros_auth")
      .select("id")
      .eq("client_id", client.id)
      .eq("telefone", phone)
      .maybeSingle();

    if (existingErr) {
      return json({ ok: false, error: "Nao foi possivel consultar o obreiro." }, 500);
    }

    if (existing?.id) {
      const { error: updateErr } = await supabase
        .from("obreiros_auth")
        .update(payload)
        .eq("id", existing.id);

      if (updateErr) {
        return json({ ok: false, error: "Nao foi possivel atualizar o cadastro do obreiro." }, 500);
      }

      return json({ ok: true, mode: "updated", obreiro_id: existing.id });
    }

    const { data: created, error: insertErr } = await supabase
      .from("obreiros_auth")
      .insert(payload)
      .select("id")
      .single();

    if (insertErr || !created?.id) {
      return json({ ok: false, error: "Nao foi possivel cadastrar o obreiro." }, 500);
    }

    return json({ ok: true, mode: "created", obreiro_id: created.id });
  } catch {
    return json({ ok: false, error: "Falha inesperada no cadastro." }, 500);
  }
});
