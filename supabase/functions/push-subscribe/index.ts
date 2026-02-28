import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type PushSubscriptionPayload = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { subscription } = (await req.json()) as { subscription?: PushSubscriptionPayload };
    if (!subscription?.endpoint) {
      return new Response(JSON.stringify({ error: "Invalid subscription" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { endpoint, keys } = subscription;
    const payload = {
      endpoint,
      p256dh: keys?.p256dh || "",
      auth: keys?.auth || "",
      data: subscription,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("push_subscriptions").upsert(payload, {
      onConflict: "endpoint",
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
