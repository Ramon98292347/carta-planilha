import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const isBlockedStatusValue = (value: string) => {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  if (["sim", "autorizado"].includes(v)) return false;
  if (["nao", "não", "bloqueado"].includes(v)) return true;
  return v !== "sim";
};

export default function Obreiro() {
  const navigate = useNavigate();
  const nome = (localStorage.getItem("obreiro_nome") || "").trim();
  const telefone = (localStorage.getItem("obreiro_telefone") || "").trim();
  const status = (localStorage.getItem("obreiro_status") || "").trim();
  const churchName = (localStorage.getItem("church_name") || "").trim();
  const pastorName = (localStorage.getItem("pastor_name") || "").trim();
  const googleFormUrl = (localStorage.getItem("google_form_url") || "").trim();

  const blocked = useMemo(() => isBlockedStatusValue(status), [status]);

  const handleLogout = () => {
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
      "sheets_dashboard_url",
      "user_role",
      "obreiro_nome",
      "obreiro_telefone",
      "obreiro_status",
    ].forEach((k) => localStorage.removeItem(k));
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Área do Obreiro</h1>
              <p className="text-xs text-muted-foreground">Cartas</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={handleLogout} className="gap-1">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-lg space-y-4 px-4 py-8">
        <div className={`rounded-lg border p-5 shadow-sm ${blocked ? "border-rose-500 bg-rose-50" : "border-emerald-400 bg-emerald-50"}`}>
          <div className="space-y-2 text-sm">
            <div className="text-base font-semibold">{nome || "Obreiro"}</div>
            <div>Telefone: {telefone || "—"}</div>
            <div>Igreja: {churchName || "—"}</div>
            <div>Pastor: {pastorName || "—"}</div>
            <div>Status: {status || "—"}</div>
          </div>
          <div className="mt-4">
            <Button
              type="button"
              className="w-full"
              onClick={() => googleFormUrl && window.open(googleFormUrl, "_blank", "noopener,noreferrer")}
              disabled={!googleFormUrl || blocked}
            >
              Fazer carta
            </Button>
          </div>
          {!googleFormUrl && <div className="mt-2 text-xs text-muted-foreground">Link da carta não configurado.</div>}
          {blocked && <div className="mt-2 text-xs text-rose-700">Acesso bloqueado. Procure o pastor.</div>}
        </div>
      </main>
    </div>
  );
}
