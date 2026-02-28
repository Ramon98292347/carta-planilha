import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type LoginResponse = {
  ok: boolean;
  mode?: "login" | "signup";
  session_key?: string;
  expires_at?: string;
  clientId?: string;
  church_name?: string | null;
  pastor_name?: string | null;
  google_sheet_url?: string | null;
  google_form_url?: string | null;
  google_block_form_url?: string | null;
  needs_admin_setup?: boolean;
  error?: string;
};

export default function Login() {
  const navigate = useNavigate();
  const [totvsId, setTotvsId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totvsId.trim() || !password.trim()) return;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuração do Supabase ausente");
      return;
    }

    setLoading(true);
    setAdminMsg("");

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          totvs_church_id: totvsId.trim(),
          password: password.trim(),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as LoginResponse;
      if (!response.ok || !result?.ok || !result.session_key) {
        toast.error("Falha no login. Verifique TOTVS ID e senha.");
        return;
      }

      localStorage.setItem("session_key", result.session_key || "");
      localStorage.setItem("clientId", result.clientId || "");
      localStorage.setItem("church_name", result.church_name || "");
      localStorage.setItem("pastor_name", result.pastor_name || "");
      localStorage.setItem("google_sheet_url", result.google_sheet_url || "");
      localStorage.setItem("google_form_url", result.google_form_url || "");
      localStorage.setItem("google_block_form_url", result.google_block_form_url || "");

      if (result.google_sheet_url) {
        localStorage.setItem("sheets_dashboard_url", result.google_sheet_url);
      }

      if (result.needs_admin_setup) {
        localStorage.setItem("needs_admin_setup", "true");
        setAdminMsg("Aguardando configuração do administrador (links ainda não cadastrados).");
      } else {
        localStorage.removeItem("needs_admin_setup");
      }

      if (SUPABASE_URL && SUPABASE_ANON_KEY && result.clientId) {
        const fetchClientLinks = async (filterKey: "id" | "client_id") => {
          const params = new URLSearchParams({
            select: "google_block_form_url,google_form_url_folder,google_form_url,google_sheet_url",
            limit: "1",
          });
          params.set(filterKey, `eq.${result.clientId}`);
          const response = await fetch(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`, {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          });
          if (!response.ok) return null;
          const payload = (await response.json().catch(() => [])) as Array<{
            google_block_form_url?: string | null;
            google_form_url_folder?: string | null;
            google_form_url?: string | null;
            google_sheet_url?: string | null;
          }>;
          return payload?.[0] || null;
        };

        const applyIfChanged = (key: string, nextValue?: string | null) => {
          const next = (nextValue || "").trim();
          if (!next) return;
          const current = (localStorage.getItem(key) || "").trim();
          if (current === next) return;
          localStorage.setItem(key, next);
        };

        try {
          const byId = await fetchClientLinks("id");
          const data = byId ?? (await fetchClientLinks("client_id"));
          if (data) {
            applyIfChanged("google_block_form_url", data.google_block_form_url);
            applyIfChanged("google_form_url_folder", data.google_form_url_folder);
            applyIfChanged("google_form_url", data.google_form_url);
            applyIfChanged("google_sheet_url", data.google_sheet_url);
            if (data.google_sheet_url) {
              applyIfChanged("sheets_dashboard_url", data.google_sheet_url);
            }
          }
        } catch {
          // silent
        }
      }

      navigate("/", { replace: true });
    } catch {
      toast.error("Erro ao conectar no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Painel de Gestão</h1>
            <p className="text-xs text-muted-foreground">Login</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-md px-4 py-10">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold">Acesso</h2>
          <form onSubmit={handleLogin} className="mt-4 space-y-3">
            <Input
              placeholder="TOTVS ID"
              value={totvsId}
              onChange={(e) => setTotvsId(e.target.value)}
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" className="w-full" disabled={loading || !totvsId.trim() || !password.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>

          {adminMsg && <p className="mt-3 text-xs text-amber-700">{adminMsg}</p>}
        </div>
      </main>
    </div>
  );
}
