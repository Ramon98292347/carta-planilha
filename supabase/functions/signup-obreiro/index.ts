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
    return new Response(JSON.stringify({ ok: false, error: "Configuração do Supabase ausente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const totvs = (body.totvs_church_id || "").trim();
    const nome = (body.nome || "").trim();
    const phone = normalizePhone((body.telefone || "").trim());
    const password = (body.password || "").trim();
    const status = (body.status || "AUTORIZADO").trim() || "AUTORIZADO";
    const email = (body.email || "").trim();
    const dataNascimento = (body.data_nascimento || "").trim();
    const cep = (body.cep || "").trim();
    const endereco = (body.endereco || "").trim();
    const numero = (body.numero || "").trim();
    const complemento = (body.complemento || "").trim();
    const bairro = (body.bairro || "").trim();
    const cidade = (body.cidade || "").trim();
    const uf = (body.uf || "").trim();

    if (!totvs || !nome || !phone || !password) {
      return new Response(JSON.stringify({ ok: false, error: "Preencha TOTVS, nome, telefone e senha." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("totvs_church_id", totvs)
      .limit(1);

    if (clientErr || !clients || clients.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "TOTVS não encontrado. Procure o pastor." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = clients[0];

    const { data: existing } = await supabase
      .from("obreiros_auth")
      .select("id")
      .eq("client_id", client.id)
      .eq("telefone", phone)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ ok: false, error: "Obreiro já cadastrado. Faça login." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senhaHash = await bcrypt.hash(password, 10);
    const { error: insertErr } = await supabase.from("obreiros_auth").insert({
      client_id: client.id,
      nome,
      telefone: phone,
      senha_hash: senhaHash,
      status,
      email: email || null,
      data_nascimento: dataNascimento || null,
      cep: cep || null,
      endereco: endereco || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
    });

    if (insertErr) {
      return new Response(JSON.stringify({ ok: false, error: "Não foi possível cadastrar o obreiro." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Falha inesperada no cadastro." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
