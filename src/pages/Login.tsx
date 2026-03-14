import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getSupabaseHeaders } from "@/lib/supabaseHeaders";
import { ChurchChoice, clearAppSession, saveAppSession } from "@/lib/appSession";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME = (import.meta.env.VITE_SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME || "search-churches-public").trim();

type LoginResponse =
  | {
      ok: true;
      mode: "logged_in";
      token: string;
      rls_token?: string | null;
      user: {
        id: string;
        full_name: string;
        cpf: string;
        role: "admin" | "pastor" | "obreiro";
      };
      session: {
        totvs_id: string;
        church_name: string;
        church_class: string;
        scope_totvs_ids?: string[];
        root_totvs_id?: string;
      };
    }
  | {
      ok: true;
      mode: "select_church";
      cpf: string;
      user: {
        id: string;
        full_name: string;
        cpf: string;
        role: "admin" | "pastor" | "obreiro";
      };
      churches: ChurchChoice[];
    }
  | {
      ok?: false;
      error?: string;
      message?: string;
      details?: string;
    };

function onlyDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function normalizeMinisterial(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const ministerialOptions = ["Membro", "Cooperador", "Diácono", "Presbítero", "Pastor"];

export default function Login() {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quickSignupOpen, setQuickSignupOpen] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [churchChoices, setChurchChoices] = useState<ChurchChoice[]>([]);
  const [churchChoiceName, setChurchChoiceName] = useState("");
  const [signupCpf, setSignupCpf] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupTotvs, setSignupTotvs] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupBirthDate, setSignupBirthDate] = useState("");
  const [signupMinisterial, setSignupMinisterial] = useState("");
  const [signupSacramentalDate, setSignupSacramentalDate] = useState("");
  const [signupChurchMatches, setSignupChurchMatches] = useState<Array<{ totvs_id: string; church_name: string; class?: string }>>([]);
  const [searchingChurches, setSearchingChurches] = useState(false);

  const openQuickSignup = () => {
    // Comentario: preenchemos alguns campos com o que o usuario ja digitou
    // para reduzir retrabalho no primeiro acesso.
    setSignupCpf(formatCpf(cpf));
    setSignupPhone("");
    setSignupName("");
    setSignupTotvs("");
    setSignupEmail("");
    setSignupBirthDate("");
    setSignupMinisterial("");
    setSignupSacramentalDate("");
    setSignupChurchMatches([]);
    setQuickSignupOpen(true);
  };

  useEffect(() => {
    const query = onlyDigits(signupTotvs);
    if (query.length < 3 || !quickSignupOpen) {
      setSignupChurchMatches([]);
      setSearchingChurches(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingChurches(true);
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok?: boolean;
          churches?: Array<{ totvs_id: string; church_name: string; class?: string }>;
        }>(SEARCH_CHURCHES_PUBLIC_FUNCTION_NAME, {
          body: { query, limit: 8 },
        });

        if (error || !data?.ok) {
          setSignupChurchMatches([]);
          return;
        }

        setSignupChurchMatches(data.churches || []);
      } finally {
        setSearchingChurches(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [signupTotvs, quickSignupOpen]);

  const performLogin = async () => {
    const normalizedCpf = onlyDigits(cpf);
    if (normalizedCpf.length !== 11 || !password.trim()) return;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuração do Supabase ausente.");
      return;
    }

    setLoading(true);
    setChurchChoices([]);
    setChurchChoiceName("");

    try {
      // Comentario: limpamos a sessao anterior antes de iniciar um novo login
      // para nao misturar dados do banco antigo com o banco novo.
      clearAppSession();

      const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          cpf: normalizedCpf,
          password: password.trim(),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok || !result?.ok) {
        const message = "error" in result ? result.error || result.message || "Falha no login." : "Falha no login.";
        toast.error(message);
        return;
      }

      if (result.mode === "select_church") {
        // Comentario: o backend informou que o usuario tem mais de uma igreja.
        // Esta tela ainda nao tem a segunda etapa de escolha final, entao
        // mostramos a lista para o usuario e interrompemos aqui.
        setChurchChoices(result.churches || []);
        setChurchChoiceName(result.user.full_name || "");
        toast.message("Usuário com mais de uma igreja. Falta só a etapa final de seleção.");
        return;
      }

      if (!String(result.rls_token || "").trim()) {
        toast.error("Login sem rls_token. Configure a ENV SUPABASE_JWT_SECRET na function `login` e publique novamente.");
        clearAppSession();
        return;
      }

      saveAppSession({
        token: result.token,
        rls_token: result.rls_token || "",
        user: result.user,
        session: result.session,
      });

      toast.success("Login realizado com sucesso.");

      if (result.user.role === "obreiro") {
        navigate("/obreiro", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch {
      toast.error("Erro ao conectar no login.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin();
  };

  const handleQuickSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuração do Supabase ausente.");
      return;
    }

    if (
      onlyDigits(signupCpf).length !== 11 ||
      !signupName.trim() ||
      !signupTotvs.trim() ||
      !onlyDigits(signupPhone) ||
      !password.trim()
    ) {
      toast.error("Preencha CPF, nome, TOTVS da igreja, telefone e senha.");
      return;
    }

    setSignupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        message?: string;
      }>("signup-request", {
        body: {
          cpf: onlyDigits(signupCpf),
          full_name: signupName.trim(),
          password: password.trim(),
          phone: onlyDigits(signupPhone),
          email: signupEmail.trim(),
          birth_date: signupBirthDate || null,
          minister_role: signupMinisterial || null,
          baptism_date: normalizeMinisterial(signupMinisterial).includes("membro") ? signupSacramentalDate || null : null,
          ordination_date: normalizeMinisterial(signupMinisterial).includes("membro") ? null : signupSacramentalDate || null,
          default_totvs_id: signupTotvs.trim(),
        },
      });

      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || "Não foi possível enviar a solicitação.");
        return;
      }

      setCpf(formatCpf(onlyDigits(signupCpf)));
      setQuickSignupOpen(false);
      toast.success(data.message || "Solicitação enviada com sucesso.");
    } catch {
      toast.error("Não foi possível enviar a solicitação.");
    } finally {
      setSignupLoading(false);
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
              <p className="text-xs text-muted-foreground">Login por CPF e senha</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Banco novo conectado
          </div>
        </div>
      </header>

      <main className="container mx-auto flex max-w-6xl items-start justify-center px-4 py-6 pb-[calc(2.5rem+2px)]">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Agora o acesso usa <strong>CPF + senha</strong>. O sistema identifica automaticamente se você é pastor,
              obreiro ou admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">CPF</span>
                <Input
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Senha</span>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || onlyDigits(cpf).length !== 11 || !password.trim()}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Entrar
              </Button>
            </form>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Primeiro acesso</AlertTitle>
              <AlertDescription>
                Se você ainda não tem usuário, use o cadastro rápido. O pedido entra como <strong>pendente</strong> e
                depois o pastor ou admin revisa sua igreja, seu cargo e suas permissões.
              </AlertDescription>
            </Alert>

            <Button type="button" variant="outline" className="w-full" onClick={openQuickSignup}>
              Cadastro rápido
            </Button>

            {churchChoices.length > 0 ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Seleção de igreja pendente</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    O usuário <strong>{churchChoiceName}</strong> tem acesso a mais de uma igreja. O backend já listou
                    as opções abaixo, mas ainda falta ligar a etapa final de escolha no front.
                  </p>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-white p-2 text-sm">
                    {churchChoices.map((church) => (
                      <div key={`${church.totvs_id}-${church.role}`} className="rounded border p-2">
                        <div className="font-medium">{church.church_name || church.totvs_id}</div>
                        <div className="text-xs text-muted-foreground">
                          TOTVS: {church.totvs_id} | Classe: {church.church_class || "-"} | Papel: {church.role}
                        </div>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
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
            <DialogTitle>Cadastro rápido</DialogTitle>
            <DialogDescription>
              Você informa seus dados e o TOTVS da igreja. Depois o pastor ou admin decide a liberação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleQuickSignup} className="space-y-3">
            <Input
              placeholder="CPF"
              value={signupCpf}
              onChange={(e) => setSignupCpf(formatCpf(e.target.value))}
              disabled={signupLoading}
            />
            <Input
              placeholder="Nome completo"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              disabled={signupLoading}
            />
            <Input
              placeholder="TOTVS da igreja que pertence"
              value={signupTotvs}
              onChange={(e) => setSignupTotvs(e.target.value)}
              disabled={signupLoading}
            />
            {searchingChurches ? (
              <p className="text-xs text-muted-foreground">Buscando igreja...</p>
            ) : null}
            {signupChurchMatches.length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="mb-2 text-xs text-muted-foreground">Igrejas encontradas</p>
                <div className="space-y-1">
                  {signupChurchMatches.map((church) => (
                    <button
                      key={`${church.totvs_id}-${church.church_name}`}
                      type="button"
                      onClick={() => setSignupTotvs(church.totvs_id)}
                      className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{church.totvs_id}</span> - {church.church_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <Input
              placeholder="Telefone"
              value={signupPhone}
              onChange={(e) => setSignupPhone(e.target.value)}
              disabled={signupLoading}
            />
            <Input
              placeholder="Email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              disabled={signupLoading}
            />
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Cargo ministerial</span>
              <Select value={signupMinisterial} onValueChange={setSignupMinisterial} disabled={signupLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  {ministerialOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Data de nascimento</span>
              <Input
                type="date"
                value={signupBirthDate}
                onChange={(e) => setSignupBirthDate(e.target.value)}
                disabled={signupLoading}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {normalizeMinisterial(signupMinisterial).includes("membro") ? "Data do batismo" : "Data da separação"}
              </span>
              <Input
                type="date"
                value={signupSacramentalDate}
                onChange={(e) => setSignupSacramentalDate(e.target.value)}
                disabled={signupLoading}
              />
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={signupLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                signupLoading ||
                onlyDigits(signupCpf).length !== 11 ||
                !signupName.trim() ||
                !signupTotvs.trim() ||
                !onlyDigits(signupPhone) ||
                !password.trim()
              }
            >
              {signupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar solicitação
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

