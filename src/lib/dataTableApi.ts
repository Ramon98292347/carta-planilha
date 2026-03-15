import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import { parseClientConfig, type ClientLettersConfig, withTechnicalContext } from "@/lib/dataTableLetters";

type ObreiroAuthRow = {
  id?: string;
  telefone?: string;
  status?: string;
  status_carta?: string | null;
};

export async function fetchClientLettersConfig(
  clientId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<ClientLettersConfig | null> {
  if (!clientId || !supabaseUrl || !supabaseAnonKey) return null;

  const headers = getSupabaseHeaders({ json: false });

  try {
    const cacheParams = new URLSearchParams({ select: "*", limit: "1" });
    cacheParams.set("client_id", `eq.${clientId}`);
    const cacheRes = await fetch(`${supabaseUrl}/rest/v1/client_cache?${cacheParams.toString()}`, { headers });
    const cachePayload = (await cacheRes.json().catch(() => [])) as Record<string, any>[];
    const fromCache = parseClientConfig(cachePayload?.[0]);
    if (fromCache) return fromCache;
  } catch {
    // fallback below
  }

  try {
    const params = new URLSearchParams({
      select: "gas_delete_url,google_sheet_url,google_form_url,google_sheet_id,google_form_id,drive_sent_folder_id",
      limit: "1",
    });
    params.set("id", `eq.${clientId}`);
    const response = await fetch(`${supabaseUrl}/rest/v1/clients?${params.toString()}`, { headers });
    const payload = (await response.json().catch(() => [])) as Record<string, any>[];
    return parseClientConfig(payload?.[0]);
  } catch {
    return null;
  }
}

export async function fetchObreirosAuthRows(
  clientId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<ObreiroAuthRow[]> {
  if (!clientId || !supabaseUrl || !supabaseAnonKey) return [];

  const headers = getSupabaseHeaders({ json: false });
  const params = new URLSearchParams({ select: "telefone,status,status_carta", limit: "5000" });
  params.set("client_id", `eq.${clientId}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/obreiros_auth?${params.toString()}`, { headers });
  if (!response.ok) return [];

  const rows = (await response.json().catch(() => [])) as ObreiroAuthRow[];
  return Array.isArray(rows) ? rows : [];
}

export async function callLettersWebhookApi(
  lettersWebhookUrl: string,
  clientConfig: ClientLettersConfig,
  body: Record<string, string>,
) {
  const response = await fetch(lettersWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withTechnicalContext(clientConfig, body)),
  });

  let payload: Record<string, any> | null = null;
  try {
    payload = (await response.json()) as Record<string, any>;
  } catch {
    throw new Error("Resposta invalida do webhook");
  }

  if (!response.ok || !payload?.ok) {
    const message = (payload?.error || payload?.message || `Falha na API da igreja (${response.status})`).trim();
    throw new Error(message);
  }

  return payload;
}

export async function saveObreiroAuthRowApi(
  supabaseUrl: string,
  identity: { clientId: string; telefone: string; nome: string; email: string },
  patch: Record<string, string | null>,
) {
  const headers = {
    ...getSupabaseHeaders(),
    Prefer: "return=representation",
  };

  const params = new URLSearchParams({
    select: "id,telefone,status,status_carta",
    limit: "1",
  });
  params.set("client_id", "eq." + identity.clientId);
  params.set("telefone", "eq." + identity.telefone);

  const existingRes = await fetch(`${supabaseUrl}/rest/v1/obreiros_auth?${params.toString()}`, {
    headers: getSupabaseHeaders({ json: false }),
  });

  if (!existingRes.ok) {
    const body = await existingRes.text().catch(() => "");
    throw new Error(body || "Falha ao consultar obreiro_auth.");
  }

  const existing = await existingRes.json().catch(() => []);
  const basePayload = {
    client_id: identity.clientId,
    nome: identity.nome,
    telefone: identity.telefone,
    email: identity.email || null,
    ...patch,
  };

  if (Array.isArray(existing) && existing[0]?.id) {
    const updateParams = new URLSearchParams({ select: "id,telefone,status,status_carta" });
    updateParams.set("id", "eq." + existing[0].id);
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/obreiros_auth?${updateParams.toString()}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });

    if (!updateRes.ok) {
      const body = await updateRes.text().catch(() => "");
      throw new Error(body || "Falha ao atualizar obreiro_auth.");
    }

    const updated = await updateRes.json().catch(() => []);
    return Array.isArray(updated) ? updated[0] || null : null;
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/obreiros_auth`, {
    method: "POST",
    headers,
    body: JSON.stringify(basePayload),
  });

  if (!insertRes.ok) {
    const body = await insertRes.text().catch(() => "");
    throw new Error(body || "Falha ao criar obreiro_auth.");
  }

  const inserted = await insertRes.json().catch(() => []);
  return Array.isArray(inserted) ? inserted[0] || null : null;
}
