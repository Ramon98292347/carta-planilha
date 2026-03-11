import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "public_media";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const isWithinWindow = (startAt?: string | null, endAt?: string | null) => {
  const now = Date.now();
  if (startAt) {
    const start = new Date(startAt).getTime();
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (endAt) {
    const end = new Date(endAt).getTime();
    if (!Number.isNaN(end) && now > end) return false;
  }
  return true;
};

const upcomingBirthday = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = parsed.getMonth();
  const day = parsed.getDate();
  const today = new Date();
  const target = new Date(today.getFullYear(), month, day);
  if (target.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
    target.setFullYear(today.getFullYear() + 1);
  }
  const diffMs = target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0 || diffDays > 7) return null;
  return { date: target, diffDays };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Configuração do Supabase ausente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const totvs = (url.searchParams.get("totvs") || "").trim();
  if (!totvs) {
    return new Response(JSON.stringify({ ok: true, client: null, announcements: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, church_name, pastor_name")
      .eq("totvs_church_id", totvs)
      .limit(1);

    if (clientErr || !clients || clients.length === 0) {
      return new Response(JSON.stringify({ ok: true, client: null, announcements: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = clients[0];

    const { data: rows } = await supabase
      .from("church_announcements")
      .select("id, title, subtitle, type, media_path, video_url, link_url, start_at, end_at, is_active, sort_order")
      .eq("client_id", client.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const storage = supabase.storage.from(BUCKET);
    const announcements =
      rows
        ?.filter((row) => isWithinWindow(row.start_at, row.end_at))
        .map((row) => {
          const media_url = row.media_path ? storage.getPublicUrl(row.media_path).data.publicUrl : null;
          return {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            type: row.type,
            media_url,
            video_url: row.video_url,
            link_url: row.link_url,
          };
        }) ?? [];

    const { data: obreiros } = await supabase
      .from("obreiros_auth")
      .select("nome, data_nascimento")
      .eq("client_id", client.id);

    const birthdays =
      obreiros
        ?.map((row) => {
          if (!row.data_nascimento) return null;
          const upcoming = upcomingBirthday(String(row.data_nascimento));
          if (!upcoming) return null;
          return { nome: row.nome || "Obreiro", diffDays: upcoming.diffDays, date: upcoming.date };
        })
        .filter(Boolean) as Array<{ nome: string; diffDays: number; date: Date }> | undefined;

    if (birthdays && birthdays.length > 0) {
      birthdays.sort((a, b) => a.diffDays - b.diffDays);
      const lines = birthdays.slice(0, 5).map((item) => {
        const label = item.diffDays === 0 ? "hoje" : `em ${item.diffDays} dia${item.diffDays > 1 ? "s" : ""}`;
        return `${item.nome} (${label})`;
      });
      announcements.unshift({
        id: "birthday-slide",
        title: "Aniversariantes da semana",
        subtitle: lines.join("\n"),
        type: "text",
        media_url: null,
        video_url: null,
        link_url: null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        client: {
          id: client.id,
          church_name: client.church_name || null,
          pastor_name: client.pastor_name || null,
        },
        announcements,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao buscar anúncios." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
