import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { EllipsisVertical, FileText, LogOut, Save, Trash2, UploadCloud } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import {
  deleteAnnouncement,
  deleteAnnouncementFromStorage,
  loadAnnouncements,
  saveAnnouncement,
  type Announcement,
  uploadAnnouncementFile,
} from "@/lib/divulgacaoApi";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const BUCKET = "public_media";

const emptyForm = {
  id: "",
  title: "",
  subtitle: "",
  type: "image" as Announcement["type"],
  media_path: "",
  video_url: "",
  link_url: "",
  start_at: "",
  end_at: "",
  is_active: true,
  sort_order: 0,
};

const formatDateTimeLocal = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toISOStringOrNull = (value: string) => {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildPublicUrl = (path?: string | null) => {
  if (!path || !SUPABASE_URL) return "";
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
};

export default function Divulgacao() {
  const navigate = useNavigate();
  const clientId = (localStorage.getItem("clientId") || "").trim();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [uploading, setUploading] = useState(false);

  const headers = useMemo(
    () => getSupabaseHeaders(),
    []
  );

  const loadItems = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !clientId) return;
    setLoading(true);
    try {
      const payload = await loadAnnouncements(SUPABASE_URL, clientId, headers);
      setItems(payload || []);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao carregar anúncios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const resetForm = () => setForm({ ...emptyForm });

  const handleEdit = (item: Announcement) => {
    setForm({
      id: item.id,
      title: item.title || "",
      subtitle: item.subtitle || "",
      type: item.type || "image",
      media_path: item.media_path || "",
      video_url: item.video_url || "",
      link_url: item.link_url || "",
      start_at: formatDateTimeLocal(item.start_at),
      end_at: formatDateTimeLocal(item.end_at),
      is_active: item.is_active ?? true,
      sort_order: item.sort_order ?? 0,
    });
  };

  const uploadFile = async (file: File) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !clientId) return "";
    setUploading(true);
    try {
      return await uploadAnnouncementFile(SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET, clientId, file);
    } finally {
      setUploading(false);
    }
  };

  const deleteFromStorage = async (path?: string | null) => {
    return deleteAnnouncementFromStorage(SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET, path);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !clientId) return;
    if (!form.title.trim()) {
      toast.error("Informe o título.");
      return;
    }

    setSaving(true);
    try {
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
        const response = await fetch(`${SUPABASE_URL}/rest/v1/church_announcements?id=eq.${form.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Não foi possível atualizar.");
        toast.success("Anúncio atualizado.");
      } else {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/church_announcements`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Não foi possível criar.");
        toast.success("Anúncio criado.");
      }

      resetForm();
      await loadItems();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Announcement) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    if (!window.confirm("Remover este anúncio?")) return;
    try {
      await deleteAnnouncement(SUPABASE_URL, item.id, headers);
      await deleteFromStorage(item.media_path);
      toast.success("Anúncio removido.");
      await loadItems();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao remover.");
    }
  };

  const previewUrl = form.type === "image" ? buildPublicUrl(form.media_path) : "";
  const previewTitle = form.title.trim() || "Prévia do anúncio";
  const previewSubtitle = form.subtitle.trim();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Divulgação</h1>
              <p className="text-xs text-muted-foreground">Configurações do carrossel</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Button type="button" variant="outline" onClick={() => navigate("/")}>Voltar</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                [
                  "session_key",
                  "clientId",
                  "church_name",
                  "pastor_name",
                  "google_sheet_url",
                  "google_form_url",
                  "google_block_form_url",
                  "google_form_url_folder",
                  "needs_admin_setup",
                  "DELETE_API_URL",
                  "DELETE_API_KEY",
                  "sheets_dashboard_url",
                  "user_role",
                  "obreiro_nome",
                  "obreiro_telefone",
                  "obreiro_status",
                ].forEach((k) => localStorage.removeItem(k));
                navigate("/login", { replace: true });
              }}
              className="gap-1"
            >
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-9 p-0">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-2rem))]">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/")}>Voltar</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    [
                      "session_key",
                      "clientId",
                      "church_name",
                      "pastor_name",
                      "google_sheet_url",
                      "google_form_url",
                      "google_block_form_url",
                      "google_form_url_folder",
                      "needs_admin_setup",
                      "DELETE_API_URL",
                      "DELETE_API_KEY",
                      "sheets_dashboard_url",
                      "user_role",
                      "obreiro_nome",
                      "obreiro_telefone",
                      "obreiro_status",
                    ].forEach((k) => localStorage.removeItem(k));
                    navigate("/login", { replace: true });
                  }}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Anúncios</h2>
            <Button type="button" variant="outline" onClick={resetForm}>
              Novo anúncio
            </Button>
          </div>

          {loading ? (
            <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Carregando anúncios...</div>
          ) : items.length === 0 ? (
            <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Nenhum anúncio cadastrado.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((item) => {
                const img = item.media_path ? buildPublicUrl(item.media_path) : "";
                return (
                  <div key={item.id} className="rounded-lg border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        {item.subtitle ? <p className="text-xs text-muted-foreground">{item.subtitle}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Tipo: {item.type}</span>
                          <span>Ordem: {item.sort_order}</span>
                          <span className={cn(item.is_active ? "text-emerald-600" : "text-rose-600")}>
                            {item.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(item)} className="text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {item.type === "image" && img ? (
                      <img src={img} alt={item.title} className="mt-3 h-32 w-full rounded-md object-cover" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-base font-semibold">Editar anúncio</h2>
          <form onSubmit={handleSave} className="mt-4 space-y-3">
            <Input placeholder="Título" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Subtítulo / texto" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />

            <div className="grid gap-2">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(["image", "video", "text"] as Announcement["type"][]).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={form.type === type ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className="capitalize"
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            {form.type === "image" ? (
              <div className="space-y-2">
                <Label>Imagem</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const path = await uploadFile(file);
                        if (path) {
                          setForm((f) => ({ ...f, media_path: path }));
                          toast.success("Imagem enviada.");
                        }
                      } catch (err: any) {
                        toast.error(err?.message || "Falha no upload.");
                      }
                    }}
                    disabled={uploading}
                  />
                  {uploading ? <UploadCloud className="h-4 w-4 animate-pulse text-muted-foreground" /> : null}
                </div>
                {previewUrl ? <img src={previewUrl} alt="Prévia" className="h-28 w-full rounded-md object-cover" /> : null}
              </div>
            ) : null}

            {form.type === "video" ? (
              <Input placeholder="URL do vídeo" value={form.video_url} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))} />
            ) : null}

            <Input placeholder="Link (Saiba mais)" value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} />

            <div className="grid gap-2">
              <Label>Período (opcional)</Label>
              <Input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
              />
              <Input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label>Ativo</Label>
                <p className="text-xs text-muted-foreground">Exibir no carrossel</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))} />
            </div>

            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Prévia rápida</p>
              <div className="mt-2 rounded-md border bg-background p-3">
                <h3 className="text-sm font-semibold">{previewTitle}</h3>
                {previewSubtitle ? <p className="mt-1 text-xs text-muted-foreground">{previewSubtitle}</p> : null}
                {form.type === "image" && previewUrl ? (
                  <img src={previewUrl} alt="Prévia" className="mt-2 h-24 w-full rounded-md object-cover" />
                ) : null}
                {form.type === "video" && form.video_url ? (
                  <p className="mt-2 text-xs text-muted-foreground">Vídeo: {form.video_url}</p>
                ) : null}
              </div>
            </div>

            <Button type="submit" className="w-full gap-2" disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar anúncio"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

