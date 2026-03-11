import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    key,
    256
  );
  const hashBytes = new Uint8Array(bits);
  return `pbkdf2$120000$${encodeBase64(salt)}$${encodeBase64(hashBytes)}`;
};

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
    const pastorName = (body.pastor_name || "").trim();
    const churchName = (body.church_name || "").trim();
    const pastorEmail = (body.pastor_email || "").trim();
    const pastorPhone = (body.pastor_phone || "").trim();
    const password = (body.password || "").trim();
    const dataNascimento = (body.data_nascimento || "").trim();
    const cep = (body.cep || "").trim();
    const endereco = (body.endereco || "").trim();
    const numero = (body.numero || "").trim();
    const complemento = (body.complemento || "").trim();
    const bairro = (body.bairro || "").trim();
    const cidade = (body.cidade || "").trim();
    const uf = (body.uf || "").trim();

    if (!totvs || !pastorName || !churchName || !password) {
      return new Response(JSON.stringify({ ok: false, error: "Preencha TOTVS, nome do pastor, igreja e senha." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase.from("clients").select("id").eq("totvs_church_id", totvs).limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ ok: false, error: "Igreja já cadastrada. Faça login." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const passwordHash = await hashPassword(password);

    const { error: insertErr } = await supabase.from("clients").insert({
      totvs_church_id: totvs,
      name: pastorName || churchName,
      church_name: churchName,
      pastor_name: pastorName,
      pastor_email: pastorEmail || null,
      pastor_phone: pastorPhone || null,
      data_nascimento: dataNascimento || null,
      cep: cep || null,
      endereco: endereco || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
      password_hash: passwordHash,
    });

    if (insertErr) {
      return new Response(JSON.stringify({ ok: false, error: "Não foi possível cadastrar o pastor." }), {
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
