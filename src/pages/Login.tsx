import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";

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
  pastor_phone?: string | null;
  pastor_email?: string | null;
  obreiro_name?: string | null;
  obreiro_phone?: string | null;
  obreiro_status?: string | null;
  obreiro_email?: string | null;
  obreiro_data_nascimento?: string | null;
  obreiro_cep?: string | null;
  obreiro_endereco?: string | null;
  obreiro_numero?: string | null;
  obreiro_complemento?: string | null;
  obreiro_bairro?: string | null;
  obreiro_cidade?: string | null;
  obreiro_uf?: string | null;
  google_sheet_url?: string | null;
  google_form_url?: string | null;
  google_block_form_url?: string | null;
  google_form_url_folder?: string | null;
  needs_admin_setup?: boolean;
  error?: string;
  client_id?: string;
  phone?: string | null;
  email?: string | null;
};

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"pastor" | "obreiro">("pastor");
  const [totvsId, setTotvsId] = useState(() => localStorage.getItem("totvs_church_id") || "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");
  const [quickSignupOpen, setQuickSignupOpen] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupChurchName, setSignupChurchName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupBirthDate, setSignupBirthDate] = useState("");
  const [signupCep, setSignupCep] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupNumber, setSignupNumber] = useState("");
  const [signupComplement, setSignupComplement] = useState("");
  const [signupNeighborhood, setSignupNeighborhood] = useState("");
  const [signupCity, setSignupCity] = useState("");
  const [signupState, setSignupState] = useState("");

  const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");
  const normalizeCep = (value: string) => (value || "").replace(/\D/g, "").slice(0, 8);

  const shouldOfferSignup = (message: string) => {
    const msg = (message || "").toLowerCase();
    return (
      msg.includes("não encontrado") ||
      msg.includes("nao encontrado") ||
      msg.includes("sem cadastro") ||
      msg.includes("não cadastrado") ||
      msg.includes("nao cadastrado")
    );
  };

  const openQuickSignup = () => {
    setSignupName("");
    setSignupChurchName("");
    setSignupEmail("");
    setSignupPhone(mode === "obreiro" ? phone : "");
    setSignupBirthDate("");
    setSignupCep("");
    setSignupAddress("");
    setSignupNumber("");
    setSignupComplement("");
    setSignupNeighborhood("");
    setSignupCity("");
    setSignupState("");
    setQuickSignupOpen(true);
  };

  const openSignup = (nextMode: "pastor" | "obreiro") => {
    setMode(nextMode);
    openQuickSignup();
  };

  const performLogin = async () => {
    if (!totvsId.trim() || !password.trim()) return;
    if (mode === "obreiro" && !phone.trim()) return;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuração do Supabase ausente");
      return;
    }

    setLoading(true);
    setAdminMsg("");

    try {
      const endpoint = mode === "obreiro" ? "login-obreiro" : "login";
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          totvs_church_id: totvsId.trim(),
          password: password.trim(),
          phone: phone.trim(),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as LoginResponse;
      if (!response.ok || !result?.ok || !result.session_key) {
        const msg = (result?.error || "").trim();
        if (msg) {
          toast.error(msg);
          if (shouldOfferSignup(msg)) {
            openQuickSignup();
          }
        } else {
          toast.error("Falha no login. Verifique os dados.");
        }
        return;
      }

      // Sync de obreiros a partir do client_cache.last_15_cards (fallback: usuário logado)
      try {
        const clientId = (result.clientId || result.client_id || "").trim();
        const normalizePhoneValue = (value: string) => (value || "").replace(/\D/g, "");
        const toSyncCards: Array<{ full_name: string; phone: string; email: string; church_name: string }> = [];
        let fullName =
          mode === "obreiro"
            ? (result.obreiro_name || "").trim()
            : (result.pastor_name || "").trim();
        let rawPhone =
          mode === "obreiro"
            ? (result.obreiro_phone || result.phone || phone || "").trim()
            : (result.pastor_phone || result.phone || "").trim();
        let email =
          mode === "obreiro"
            ? (result.obreiro_email || result.email || "").trim()
            : (result.pastor_email || result.email || "").trim();

        // Fallback para login de pastor: tenta buscar telefone/email direto em clients
        if (mode === "pastor" && clientId && !normalizePhone(rawPhone) && SUPABASE_URL && SUPABASE_ANON_KEY) {
          const params = new URLSearchParams({
            select: "pastor_name,pastor_phone,pastor_email",
            id: `eq.${clientId}`,
            limit: "1",
          });
          const clientRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`, {
            headers: getSupabaseHeaders({ json: false }),
          });
          if (clientRes.ok) {
            const payload = (await clientRes.json().catch(() => [])) as Array<{
              pastor_name?: string | null;
              pastor_phone?: string | null;
              pastor_email?: string | null;
            }>;
            const info = payload?.[0];
            if (info) {
              rawPhone = (rawPhone || info.pastor_phone || "").trim();
              if (!email) email = (info.pastor_email || "").trim();
            }
          }
        }

        if (clientId && SUPABASE_URL && SUPABASE_ANON_KEY) {
          const params = new URLSearchParams({
            select: "last_15_cards",
            client_id: `eq.${clientId}`,
            limit: "1",
          });
          const cacheRes = await fetch(`${SUPABASE_URL}/rest/v1/client_cache?${params.toString()}`, {
            headers: getSupabaseHeaders({ json: false }),
          });
          if (cacheRes.ok) {
            const cachePayload = (await cacheRes.json().catch(() => [])) as Array<{
              last_15_cards?: Array<Record<string, string>>;
            }>;
            const rows = cachePayload?.[0]?.last_15_cards || [];
            rows.forEach((row) => {
              const rowPhone = normalizePhoneValue(String(row.telefone || row.phone || row["Telefone"] || ""));
              if (!rowPhone) return;
              toSyncCards.push({
                full_name: String(row.nome || row.full_name || row["Nome completo"] || "").trim(),
                phone: rowPhone,
                email: String(row.email || row["Endereço de e-mail"] || row["E-mail"] || "").trim(),
                church_name: String(row.igreja_origem || row.church_name || row["Qual Igreja Você Pertence?"] || "").trim(),
              });
            });
          }
        }

        if (!toSyncCards.length) {
          const phoneDigits = normalizePhone(rawPhone);
          if (phoneDigits) {
            toSyncCards.push({
              full_name: fullName,
              phone: phoneDigits,
              email,
              church_name: (result.church_name || "").trim(),
            });
          }
        }

        if (clientId && toSyncCards.length) {
          const { error } = await supabase.functions.invoke("sync-obreiros-from-cards", {
            body: {
              client_id: clientId,
              cards: toSyncCards,
            },
          });
          if (error) {
            console.error("sync-obreiros-from-cards falhou no login", error);
          }
        } else {
          console.warn("sync-obreiros-from-cards ignorado no login por falta de client_id/telefone", {
            clientId,
            cardsCount: toSyncCards.length,
            mode,
          });
        }
      } catch {
        // não bloqueia o login
      }

      localStorage.setItem("session_key", result.session_key || "");
      localStorage.setItem("clientId", result.clientId || "");
      localStorage.setItem("church_name", result.church_name || "");
      localStorage.setItem("pastor_name", result.pastor_name || "");
      localStorage.setItem("google_sheet_url", result.google_sheet_url || "");
      localStorage.setItem("google_form_url", result.google_form_url || "");
      localStorage.setItem("google_block_form_url", result.google_block_form_url || "");
      localStorage.setItem("google_form_url_folder", result.google_form_url_folder || "");

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
        const fetchClientLinks = async () => {
          const params = new URLSearchParams({
            select: "google_form_url,google_sheet_url",
            limit: "1",
          });
          params.set("id", `eq.${result.clientId}`);
          const response = await fetch(`${SUPABASE_URL}/rest/v1/clients?${params.toString()}`, {
            headers: getSupabaseHeaders({ json: false }),
          });
          if (!response.ok) return null;
          const payload = (await response.json().catch(() => [])) as Array<{
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
          const data = await fetchClientLinks();
          if (data) {
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

      if (mode === "obreiro") {
        localStorage.setItem("user_role", "obreiro");
        localStorage.setItem("obreiro_nome", result.obreiro_name || "");
        localStorage.setItem("obreiro_telefone", result.obreiro_phone || phone.trim());
        localStorage.setItem("obreiro_status", result.obreiro_status || "");
        localStorage.setItem("obreiro_email", result.obreiro_email || "");
        localStorage.setItem("obreiro_data_nascimento", result.obreiro_data_nascimento || "");
        localStorage.setItem("obreiro_cep", result.obreiro_cep || "");
        localStorage.setItem("obreiro_endereco", result.obreiro_endereco || "");
        localStorage.setItem("obreiro_numero", result.obreiro_numero || "");
        localStorage.setItem("obreiro_complemento", result.obreiro_complemento || "");
        localStorage.setItem("obreiro_bairro", result.obreiro_bairro || "");
        localStorage.setItem("obreiro_cidade", result.obreiro_cidade || "");
        localStorage.setItem("obreiro_uf", result.obreiro_uf || "");
        navigate("/obreiro", { replace: true });
      } else {
        localStorage.setItem("user_role", "pastor");
        navigate("/", { replace: true });
      }
    } catch {
      toast.error("Erro ao conectar no login");
    } finally {
      setLoading(false);
    }
  };

  const handleTotvsChange = (value: string) => {
    setTotvsId(value);
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem("totvs_church_id", trimmed);
    } else {
      localStorage.removeItem("totvs_church_id");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin();
  };

  const handleQuickSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuração do Supabase ausente");
      return;
    }

    if (!totvsId.trim() || !password.trim()) return;

    if (mode === "obreiro") {
      if (!signupName.trim() || !signupPhone.trim()) return;
    } else {
      if (!signupName.trim() || !signupChurchName.trim()) return;
    }

    setSignupLoading(true);
    try {
      const fn = mode === "obreiro" ? "signup-obreiro" : "signup-pastor";
      const payload =
        mode === "obreiro"
          ? {
              totvs_church_id: totvsId.trim(),
              nome: signupName.trim(),
              telefone: normalizePhone(signupPhone || phone),
              password: password.trim(),
              email: signupEmail.trim(),
              data_nascimento: signupBirthDate.trim(),
              cep: normalizeCep(signupCep),
              endereco: signupAddress.trim(),
              numero: signupNumber.trim(),
              complemento: signupComplement.trim(),
              bairro: signupNeighborhood.trim(),
              cidade: signupCity.trim(),
              uf: signupState.trim(),
            }
          : {
              totvs_church_id: totvsId.trim(),
              pastor_name: signupName.trim(),
              church_name: signupChurchName.trim(),
              pastor_email: signupEmail.trim(),
              pastor_phone: normalizePhone(signupPhone),
              data_nascimento: signupBirthDate.trim(),
              cep: normalizeCep(signupCep),
              endereco: signupAddress.trim(),
              numero: signupNumber.trim(),
              complemento: signupComplement.trim(),
              bairro: signupNeighborhood.trim(),
              cidade: signupCity.trim(),
              uf: signupState.trim(),
              password: password.trim(),
            };

      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(fn, { body: payload });
      if (error || !data || data.ok !== true) {
        const message = (data?.error || error?.message || "").trim();
        toast.error(message || "Não foi possível cadastrar.");
        return;
      }

      if (mode === "obreiro" && signupPhone.trim()) {
        setPhone(signupPhone.trim());
      }

      setQuickSignupOpen(false);
      toast.success("Cadastro realizado com sucesso.");
      await performLogin();
    } catch {
      toast.error("Não foi possível cadastrar.");
    } finally {
      setSignupLoading(false);
    }
  };

  const handleCepLookup = async () => {
    const cep = normalizeCep(signupCep);
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) return;
      const data = (await response.json().catch(() => null)) as
        | null
        | { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!data || data.erro) return;
      setSignupAddress((data.logradouro || "").trim());
      setSignupNeighborhood((data.bairro || "").trim());
      setSignupCity((data.localidade || "").trim());
      setSignupState((data.uf || "").trim());
    } catch {
      // silent
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <img src="/app-icon.svg" alt="Logo" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Painel de Gestão</h1>
              <p className="text-xs text-muted-foreground">Login</p>
            </div>
          </div>
          <div className="text-sm font-semibold text-emerald-700">
            TOTVS: {totvsId?.trim() ? totvsId.trim() : "—"}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6 pb-[calc(2.5rem+2px)]">
        <div className="mx-auto w-full max-w-md rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">
            Informe apenas o TOTVS da igreja cadastrada. Se não souber, procure o pastor.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Button type="button" variant={mode === "pastor" ? "default" : "outline"} onClick={() => setMode("pastor")}>
              Pastor
            </Button>
            <Button type="button" variant={mode === "obreiro" ? "default" : "outline"} onClick={() => setMode("obreiro")}>
              Obreiro
            </Button>
          </div>
          <form onSubmit={handleLogin} className="mt-3 space-y-3">
            <Input
              placeholder="TOTVS ID"
              value={totvsId}
              onChange={(e) => handleTotvsChange(e.target.value)}
              disabled={loading}
            />
            {mode === "obreiro" && (
              <Input
                placeholder="Telefone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            )}
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !totvsId.trim() || !password.trim() || (mode === "obreiro" && !phone.trim())}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => openSignup("pastor")}>
              Cadastrar pastor
            </Button>
            <Button type="button" variant="outline" onClick={() => openSignup("obreiro")}>
              Cadastrar obreiro
            </Button>
          </div>
          {adminMsg && <p className="mt-2 text-xs text-amber-700">{adminMsg}</p>}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-3 px-2.5 py-2.5 text-center text-xs text-muted-foreground">
          <span>Desenvolvedor: Ramon Rodrigues</span>
          <a href="https://wa.me/5527998292347" target="_blank" rel="noopener noreferrer" className="underline">
            WhatsApp: 27 99829-2347
          </a>
          <a href="mailto:ramon98292347@gmail.com" className="underline">
            Email: ramon98292347@gmail.com
          </a>
        </div>
      </footer>

      <Dialog open={quickSignupOpen} onOpenChange={setQuickSignupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Cadastro {mode === "pastor" ? "Pastor" : "Obreiro"}</DialogTitle>
            <DialogDescription className="sr-only">Formulário de cadastro rápido para primeiro acesso.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickSignup} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={mode === "pastor" ? "default" : "outline"} onClick={() => setMode("pastor")}>
                Pastor
              </Button>
              <Button type="button" variant={mode === "obreiro" ? "default" : "outline"} onClick={() => setMode("obreiro")}>
                Obreiro
              </Button>
            </div>
            <Input placeholder="TOTVS ID" value={totvsId} onChange={(e) => handleTotvsChange(e.target.value)} disabled={signupLoading} />
            {mode === "pastor" ? (
              <>
                <Input
                  placeholder="Nome do pastor"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Nome da igreja"
                  value={signupChurchName}
                  onChange={(e) => setSignupChurchName(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Telefone"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Email (opcional)"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={signupLoading}
                />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Data de nascimento</span>
                  <Input
                    type="date"
                    value={signupBirthDate}
                    onChange={(e) => setSignupBirthDate(e.target.value)}
                    disabled={signupLoading}
                  />
                </div>
                <Input
                  placeholder="CEP"
                  value={signupCep}
                  onChange={(e) => setSignupCep(normalizeCep(e.target.value))}
                  onBlur={handleCepLookup}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Endereço"
                  value={signupAddress}
                  onChange={(e) => setSignupAddress(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Número"
                  value={signupNumber}
                  onChange={(e) => setSignupNumber(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Complemento"
                  value={signupComplement}
                  onChange={(e) => setSignupComplement(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Bairro"
                  value={signupNeighborhood}
                  onChange={(e) => setSignupNeighborhood(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Cidade"
                  value={signupCity}
                  onChange={(e) => setSignupCity(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="UF"
                  value={signupState}
                  onChange={(e) => setSignupState(e.target.value)}
                  disabled={signupLoading}
                />
              </>
            ) : (
              <>
                <Input
                  placeholder="Nome do obreiro"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Telefone"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  disabled={signupLoading}
                />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Data de nascimento</span>
                  <Input
                    type="date"
                    value={signupBirthDate}
                    onChange={(e) => setSignupBirthDate(e.target.value)}
                    disabled={signupLoading}
                  />
                </div>
                <Input
                  placeholder="CEP"
                  value={signupCep}
                  onChange={(e) => setSignupCep(normalizeCep(e.target.value))}
                  onBlur={handleCepLookup}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Endereço"
                  value={signupAddress}
                  onChange={(e) => setSignupAddress(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Número"
                  value={signupNumber}
                  onChange={(e) => setSignupNumber(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Complemento"
                  value={signupComplement}
                  onChange={(e) => setSignupComplement(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Bairro"
                  value={signupNeighborhood}
                  onChange={(e) => setSignupNeighborhood(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="Cidade"
                  value={signupCity}
                  onChange={(e) => setSignupCity(e.target.value)}
                  disabled={signupLoading}
                />
                <Input
                  placeholder="UF"
                  value={signupState}
                  onChange={(e) => setSignupState(e.target.value)}
                  disabled={signupLoading}
                />
              </>
            )}
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={signupLoading}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={
                signupLoading ||
                !totvsId.trim() ||
                !password.trim() ||
                (mode === "obreiro" ? !signupName.trim() || !signupPhone.trim() : !signupName.trim() || !signupChurchName.trim())
              }
            >
              {signupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cadastrar e entrar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
