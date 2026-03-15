import { Building2, CalendarDays, FileText, Loader2, Phone, Search, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LetterFormState = {
  ministerial: string;
  igreja_destino: string;
  igreja_destino_manual: string;
  dia_pregacao: string;
};

type DestinationOption = {
  totvs_church_id: string;
  church_name: string;
};

type ClientConfig = {
  church_name: string;
  pastor_name: string;
  pastor_phone: string;
};

type ObreiroLetterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  profilePhone: string;
  profileMinisterial: string;
  letterForm: LetterFormState;
  setLetterForm: React.Dispatch<React.SetStateAction<LetterFormState>>;
  destinationOptions: DestinationOption[];
  filteredDestinationOptions: DestinationOption[];
  searchingDestinations: boolean;
  clientConfig: ClientConfig;
  churchName: string;
  todayIso: string;
  maxPregacaoIso: string;
  formatDateBr: (value: string) => string;
  normalizeManualChurchDestination: (value: string) => string;
  creatingLetter: boolean;
  onSubmit: () => void;
};

export function ObreiroLetterDialog({
  open,
  onOpenChange,
  profileName,
  profilePhone,
  profileMinisterial,
  letterForm,
  setLetterForm,
  destinationOptions,
  filteredDestinationOptions,
  searchingDestinations,
  clientConfig,
  churchName,
  todayIso,
  maxPregacaoIso,
  formatDateBr,
  normalizeManualChurchDestination,
  creatingLetter,
  onSubmit,
}: ObreiroLetterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>Registro de Carta de Pregacao</DialogTitle>
          <DialogDescription>Preencha os dados para emissao da carta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                <FileText className="h-6 w-6 text-primary" /> Registro de Carta de Pregacao
              </CardTitle>
              <CardDescription>Preencha os dados para emissao da carta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Nome do pregador</Label>
                <Input value={profileName} disabled />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={profilePhone} disabled placeholder="Digite o telefone" />
              </div>
              <div className="space-y-2">
                <Label>Igreja que faz a carta (origem)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={clientConfig.church_name || churchName} disabled className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Funcao ministerial</Label>
                <Input value={profileMinisterial || "Nao informado"} disabled />
              </div>
              <div className="space-y-2">
                <Label>Igreja que vai pregar (destino)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={letterForm.igreja_destino}
                    onChange={(e) =>
                      setLetterForm((prev) => ({
                        ...prev,
                        igreja_destino: e.target.value,
                        igreja_destino_manual: "",
                      }))
                    }
                    placeholder={destinationOptions.length ? "Digite o TOTVS ou nome da igreja" : "Digite o TOTVS ou nome da igreja destino"}
                    disabled={!!letterForm.igreja_destino_manual.trim()}
                    className="pl-10"
                  />
                </div>
                {filteredDestinationOptions.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {filteredDestinationOptions.map((item) => (
                      <button
                        key={item.totvs_church_id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={() =>
                          setLetterForm((prev) => ({
                            ...prev,
                            igreja_destino: `${item.totvs_church_id} - ${item.church_name}`,
                            igreja_destino_manual: "",
                          }))
                        }
                      >
                        <span className="font-medium text-slate-900">{item.totvs_church_id} - {item.church_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingDestinations && (
                  <p className="text-xs text-muted-foreground">Buscando igrejas...</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Outros (se nao encontrar)</Label>
                <Input
                  value={letterForm.igreja_destino_manual}
                  onChange={(e) => setLetterForm((prev) => ({ ...prev, igreja_destino_manual: e.target.value, igreja_destino: "" }))}
                  onBlur={(e) =>
                    setLetterForm((prev) => ({
                      ...prev,
                      igreja_destino_manual: normalizeManualChurchDestination(e.target.value),
                      igreja_destino: "",
                    }))
                  }
                  placeholder="Ex.: 9901 - PIUMA-NITEROI"
                  disabled={!!letterForm.igreja_destino.trim()}
                />
                <p className="text-xs text-muted-foreground">
                  Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Se digitar diferente, o sistema tenta padronizar automaticamente.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data da pregacao</Label>
                  <Input type="date" min={todayIso} max={maxPregacaoIso} value={letterForm.dia_pregacao} onChange={(e) => setLetterForm((prev) => ({ ...prev, dia_pregacao: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data de emissao da carta</Label>
                  <Input value={formatDateBr(todayIso)} disabled />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">A data da pregacao pode ser escolhida entre hoje e os proximos 30 dias.</p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-emerald-100 shadow-sm">
            <CardHeader className="bg-emerald-50/80">
              <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                <FileText className="h-6 w-6 text-emerald-600" /> Pre-visualizacao da Carta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pregador</p>
                <div className="flex items-start gap-3 text-slate-900 sm:items-center">
                  <UserCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-base font-semibold sm:text-lg">{profileName || "Nao informado"}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{clientConfig.church_name || churchName || "Nao informada"}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span>{(letterForm.igreja_destino || letterForm.igreja_destino_manual).trim() || "-"}</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data de emissao</p>
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                    <CalendarDays className="h-5 w-5 text-emerald-600" />
                    <span>{formatDateBr(todayIso)}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data da pregacao</p>
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                    <CalendarDays className="h-5 w-5 text-emerald-600" />
                    <span>{letterForm.dia_pregacao ? formatDateBr(letterForm.dia_pregacao) : "-"}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{clientConfig.pastor_name || "Resolvido pela hierarquia"}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{clientConfig.pastor_phone || "Definido na liberacao/geracao da carta"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Fechar</Button>
          <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={onSubmit} disabled={creatingLetter}>
            {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar carta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
