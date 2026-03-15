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
import { formatCep, lookupCep } from "@/lib/cep";
import { isValidCpf } from "@/lib/cpf";
import { getFriendlyErrorMessage } from "@/lib/friendlyErrorMessages";

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

const ministerialOptions = ["Membro", "Cooperador", "Diacono", "Presbitero", "Pastor"];

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
  const [signupCep, setSignupCep] = useState("");
  const [signupStreet, setSignupStreet] = useState("");
  const [signupNumber, setSignupNumber] = useState("");
  const [signupNeighborhood, setSignupNeighborhood] = useState("");
  const [signupCity, setSignupCity] = useState("");
  const [signupState, setSignupState] = useState("");
  const [signupChurchMatches, setSignupChurchMatches] = useState<Array<{ totvs_id: string; church_name: string; class?: string }>>([]);
  const [searchingChurches, setSearchingChurches] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);

  const openQuickSignup = () => {
    setSignupCpf(formatCpf(cpf));
    setSignupPhone("");
    setSignupName("");
    setSignupTotvs("");
    setSignupEmail("");
    setSignupBirthDate("");
    setSignupMinisterial("");
    setSignupSacramentalDate("");
    setSignupCep("");
    setSignupStreet("");
    setSignupNumber("");
    setSignupNeighborhood("");
    setSignupCity("");
    setSignupState("");
    setSignupChurchMatches([]);
    setQuickSignupOpen(true);
  };

  useEffect(() => {
    const query = onlyDigits(signupTotvs);
    if (query.length < 2 || !quickSignupOpen) {
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

  useEffect(() => {
    const cep = onlyDigits(signupCep);
    if (cep.length !== 8 || !quickSignupOpen) return;

    let active = true;
    setLookingUpCep(true);

    void lookupCep(cep)
      .then((result) => {
        if (!active) return;
        if (!result) {
          toast.error("CEP nao encontrado.");
          return;
        }

        setSignupCep(result.cep || formatCep(cep));
        setSignupStreet(result.street || "");
        setSignupNeighborhood(result.neighborhood || "");
        setSignupCity(result.city || "");
        setSignupState(result.state || "");
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "Nao foi possivel consultar o CEP.");
      })
      .finally(() => {
        if (active) setLookingUpCep(false);
      });

    return () => {
      active = false;
    };
  }, [signupCep, quickSignupOpen]);

  const performLogin = async () => {
    const normalizedCpf = onlyDigits(cpf);
    if (normalizedCpf.length !== 11 || !password.trim()) return;

    if (!isValidCpf(normalizedCpf)) {
      toast.error("Digite um CPF valido para entrar.");
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast.error("Configuracao do Supabase ausente.");
      return;
    }

    setLoading(true);
    setChurchChoices([]);
    setChurchChoiceName("");

    try {
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
        const rawMessage = "error" in result ? result.error || result.message || "Falha no login." : "Falha no login.";
        const message = getFriendlyErrorMessage(rawMessage, {
          fallback: "Nao foi possivel entrar agora. Tente novamente.",
        });
        toast.error(message);
        return;
      }

      if (result.mode === "select_church") {
        setChurchChoices(result.churches || []);
        setChurchChoiceName(result.user.full_name || "");
        toast.message("Seu usuario tem mais de uma igreja vinculada. Falta so a etapa final de selecao.");
        return;
      }

      if (!String(result.rls_token || "").trim()) {
        toast.error("Login sem rls_token. Configure a ENV SUPABASE_JWT_SECRET na function login e publique novamente.");
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
      toast.error("Nao foi possivel conectar ao login agora.");
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
      toast.error("Configuracao do Supabase ausente.");
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

    if (!isValidCpf(signupCpf)) {
      toast.error("Digite um CPF valido para enviar a solicitacao.");
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
          cep: signupCep.trim() || null,
          address_street: signupStreet.trim() || null,
          address_number: signupNumber.trim() || null,
          address_neighborhood: signupNeighborhood.trim() || null,
          address_city: signupCity.trim() || null,
          address_state: signupState.trim() || null,
          default_totvs_id: signupTotvs.trim(),
        },
      });

      if (error || !data?.ok) {
        if (data?.error === "cpf_already_registered") {
          setCpf(formatCpf(onlyDigits(signupCpf)));
          setQuickSignupOpen(false);
          toast.message("Esse CPF ja possui cadastro. Agora e so entrar com a sua senha.");
          return;
        }

        toast.error(
          getFriendlyErrorMessage(data?.error || error?.message, {
            fallback: "Nao foi possivel enviar a solicitacao agora.",
          }),
        );
        return;
      }

      setCpf(formatCpf(onlyDigits(signupCpf)));
      setQuickSignupOpen(false);
      toast.success(data.message || "Solicitacao enviada com sucesso.");
    } catch {
      toast.error("Nao foi possivel enviar a solicitacao agora.");
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#eef3f8_48%,_#f7f9fc_100%)]">
      <header className="border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
              <img src="/app-icon.svg" alt="Logo" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Sistema de Cartas</h1>
              <p className="text-xs text-muted-foreground">Acesso por CPF e senha</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Ambiente seguro
          </div>
        </div>
      </header>

      <main className="container mx-auto grid min-h-[calc(100vh-121px)] max-w-6xl gap-6 px-4 py-6 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="order-2 space-y-5 lg:order-1">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm">
              Plataforma para igrejas
            </div>
            <div className="space-y-3">
              <h2 className="max-w-xl text-3xl font-display font-extrabold leading-tight text-foreground sm:text-4xl">
                Emissao e controle de cartas com um acesso simples e organizado.
              </h2>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Entre no sistema para emitir cartas, acompanhar liberacoes e manter o fluxo do campo de forma clara
                tanto no computador quanto no celular.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-white/70 bg-white/85 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso rapido</p>
                <p className="mt-2 text-sm font-medium text-foreground">Login com CPF e senha em poucos passos.</p>
              </CardContent>
            </Card>
            <Card className="border-white/70 bg-white/85 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fluxo claro</p>
                <p className="mt-2 text-sm font-medium text-foreground">Pastor, obreiro e liberacao no mesmo lugar.</p>
              </CardContent>
            </Card>
            <Card className="border-white/70 bg-white/85 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF pronto</p>
                <p className="mt-2 text-sm font-medium text-foreground">Acompanhe a carta ate a abertura do arquivo.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <Card className="mx-auto w-full max-w-md border-white/80 bg-white/92 shadow-xl shadow-slate-200/60">
            <CardHeader className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                Entrar no painel
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-display">Bem-vindo</CardTitle>
                <CardDescription className="text-sm leading-6">
                  O sistema identifica automaticamente se voce entra como pastor, obreiro ou administrador.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">CPF</span>
                  <Input
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(formatCpf(e.target.value))}
                    disabled={loading}
                    className="h-11 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Senha</span>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Digite sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="h-11 bg-white pr-10"
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
                  className="h-11 w-full"
                  disabled={loading || onlyDigits(cpf).length !== 11 || !password.trim()}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Entrar
                </Button>
              </form>

              <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Primeiro acesso</AlertTitle>
                <AlertDescription className="leading-6">
                  Se voce ainda nao tem usuario, use o cadastro rapido. O pedido entra como <strong>pendente</strong>
                  e depois o pastor ou admin revisa sua igreja, seu cargo e suas permissoes.
                </AlertDescription>
              </Alert>

              <Button type="button" variant="outline" className="h-11 w-full" onClick={openQuickSignup}>
                Cadastro rapido
              </Button>

              {churchChoices.length > 0 ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Selecao de igreja pendente</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      O usuario <strong>{churchChoiceName}</strong> tem acesso a mais de uma igreja. O backend ja listou
                      as opcoes abaixo, mas ainda falta ligar a etapa final de escolha no front.
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
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t bg-white/90 backdrop-blur">
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
        <DialogContent className="max-h-[88vh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Cadastro rapido</DialogTitle>
            <DialogDescription>
              Voce informa seus dados e o TOTVS da igreja. Depois o pastor ou admin decide a liberacao.
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
            {searchingChurches ? <p className="text-xs text-muted-foreground">Buscando igreja...</p> : null}
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
              placeholder="CEP"
              value={signupCep}
              onChange={(e) => setSignupCep(formatCep(e.target.value))}
              disabled={signupLoading}
            />
            {lookingUpCep ? <p className="text-xs text-muted-foreground">Consultando CEP...</p> : null}
            {signupStreet || signupNeighborhood || signupCity || signupState ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">{signupStreet || "Endereco localizado"}</p>
                <p className="text-muted-foreground">
                  {[signupNeighborhood, signupCity, signupState].filter(Boolean).join(" - ") || "Endereco preenchido pelo CEP"}
                </p>
              </div>
            ) : null}
            <Input
              placeholder="Numero"
              value={signupNumber}
              onChange={(e) => setSignupNumber(e.target.value)}
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
                {normalizeMinisterial(signupMinisterial).includes("membro") ? "Data do batismo" : "Data da separacao"}
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
              Enviar solicitacao
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
