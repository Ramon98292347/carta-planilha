import { getSupabaseHeaders } from "@/lib/supabaseHeaders";

export type Announcement = {
  id: string;
  client_id: string;
  title: string;
  subtitle?: string | null;
  type: "image" | "video" | "text";
  media_path?: string | null;
  video_url?: string | null;
  link_url?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
};

export async function loadAnnouncements(
  supabaseUrl: string,
  clientId: string,
  headers: HeadersInit,
): Promise<Announcement[]> {
  const params = new URLSearchParams({
    select: "*",
    order: "sort_order.asc,created_at.desc",
  });
  params.set("client_id", `eq.${clientId}`);
  const response = await fetch(`${supabaseUrl}/rest/v1/church_announcements?${params.toString()}`, { headers });
  if (!response.ok) throw new Error("Falha ao carregar anÃºncios.");
  const payload = (await response.json().catch(() => [])) as Announcement[];
  return payload || [];
}

export async function uploadAnnouncementFile(
  supabaseUrl: string,
  supabaseAnonKey: string,
  bucket: string,
  clientId: string,
  file: File,
) {
  if (!supabaseUrl || !supabaseAnonKey || !clientId) return "";
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `clients/${clientId}/announcements/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      ...getSupabaseHeaders({ json: false }),
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!response.ok) throw new Error("Falha ao enviar arquivo.");
  return path;
}

export async function deleteAnnouncementFromStorage(
  supabaseUrl: string,
  supabaseAnonKey: string,
  bucket: string,
  path?: string | null,
) {
  if (!path || !supabaseUrl || !supabaseAnonKey) return;
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: "DELETE",
      headers: {
        ...getSupabaseHeaders({ json: false }),
      },
    });
  } catch {
    // ignore
  }
}

export async function saveAnnouncement(
  supabaseUrl: string,
  form: {
    id: string;
    title: string;
    subtitle: string;
    type: "image" | "video" | "text";
    media_path: string;
    video_url: string;
    link_url: string;
    start_at: string;
    end_at: string;
    is_active: boolean;
    sort_order: number;
  },
  clientId: string,
  headers: HeadersInit,
  toISOStringOrNull: (value: string) => string | null,
) {
  const payload = {
    client_id: clientId,
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    type: form.type,
    media_path: form.type === "image" ? form.media_path || null : null,
    video_url: form.type === "video" ? form.video_url.trim() || null : null,
    link_url: form.link_url.trim() || null,
    start_at: toISOStringOrNull(form.start_at),
    end_at: toISOStringOrNull(form.end_at),
    is_active: form.is_active,
    sort_order: Number.isNaN(Number(form.sort_order)) ? 0 : Number(form.sort_order),
  };

  if (form.id) {
    const response = await fetch(`${supabaseUrl}/rest/v1/church_announcements?id=eq.${form.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("NÃ£o foi possÃ­vel atualizar.");
    return "updated";
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/church_announcements`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("NÃ£o foi possÃ­vel criar.");
  return "created";
}

export async function deleteAnnouncement(
  supabaseUrl: string,
  itemId: string,
  headers: HeadersInit,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/church_announcements?id=eq.${itemId}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) throw new Error("NÃ£o foi possÃ­vel remover.");
}
