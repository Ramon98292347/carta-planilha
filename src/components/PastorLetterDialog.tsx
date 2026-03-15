import { Building2, CalendarDays, FileText, Loader2, Phone, Search, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildChurchLabel, type ScopedChurch } from "@/lib/churchScope";

type LetterTarget = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cargo: string;
  church_totvs_id?: string;
};

type PastorLetterFormState = {
  church_origin: string;
  church_destination: string;
  church_destination_manual: string;
  preach_date: string;
  preach_period: "MANHA" | "TARDE" | "NOITE";
};

type DestinationChurchRow = {
  totvs_id: string;
  parent_totvs_id?: string | null;
  church_name: string;
  class?: string;
};

type PastorLetterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterTarget: LetterTarget | null;
  letterForm: PastorLetterFormState;
  setLetterForm: React.Dispatch<React.SetStateAction<PastorLetterFormState>>;
  allowedOrigins: ScopedChurch[];
  filteredPastorDestinationOptions: Array<{ value: string; church: DestinationChurchRow }>;
  loadingPastorDestinations: boolean;
  shouldAdjustOriginToParent: boolean;
  resolvedParentChurch: ScopedChurch | null;
  todayIso: string;
  maxPregacaoIso: string;
  formatDateBr: (value: string) => string;
  normalizeManualChurchDestination: (value: string) => string;
  previewOriginName: string;
  previewDestination: string;
  previewSignerName: string;
  previewSignerPhone: string;
  creatingLetter: boolean;
  onSubmit: () => void;
};

export function PastorLetterDialog({
  open,
  onOpenChange,
  letterTarget,
  letterForm,
  setLetterForm,
  allowedOrigins,
  filteredPastorDestinationOptions,
  loadingPastorDestinations,
  shouldAdjustOriginToParent,
  resolvedParentChurch,
  todayIso,
  maxPregacaoIso,
  formatDateBr,
  normalizeManualChurchDestination,
  previewOriginName,
  previewDestination,
  previewSignerName,
  previewSignerPhone,
  creatingLetter,
  onSubmit,
}: PastorLetterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>Registro de Carta de Pregacao</DialogTitle>
          <DialogDescription>
            O pastor pode tirar carta para o usuario da linha ou para si mesmo. A origem segue a regra da igreja dele e da igreja mae.
          </DialogDescription>
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
                <Input value={letterTarget?.nome || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={letterTarget?.telefone || ""} disabled placeholder="Telefone do pregador" />
              </div>
              <div className="space-y-2">
                <Label>Igreja que faz a carta (origem)</Label>
                <Select value={letterForm.church_origin} onValueChange={(value) => setLetterForm((prev) => ({ ...prev, church_origin: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedOrigins.map((church) => (
                      <SelectItem key={church.totvs_id} value={buildChurchLabel(church)}>
                        {buildChurchLabel(church)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Funcao ministerial</Label>
                <Input value={letterTarget?.cargo || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>Igreja que vai pregar (destino)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={letterForm.church_destination}
                    onChange={(e) =>
                      setLetterForm((prev) => ({
                        ...prev,
                        church_destination: e.target.value,
                        church_destination_manual: "",
                      }))
                    }
                    placeholder="Digite o TOTVS ou nome da igreja"
                    disabled={!!letterForm.church_destination_manual.trim()}
                    className="pl-10"
                  />
                </div>
                {letterForm.church_destination.trim().length > 0 && letterForm.church_destination.trim().length < 2 && !letterForm.church_destination_manual.trim() && (
                  <p className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres para buscar.</p>
                )}
                {filteredPastorDestinationOptions.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {filteredPastorDestinationOptions.map(({ value, church }) => (
                      <button
                        key={value}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={() =>
                          setLetterForm((prev) => ({
                            ...prev,
                            church_destination: value,
                            church_destination_manual: "",
                          }))
                        }
                      >
                        <span className="font-medium text-slate-900">{value}</span>
                        <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{church.class}</span>
                      </button>
                    ))}
                  </div>
                )}
                {loadingPastorDestinations && (
                  <p className="text-xs text-muted-foreground">Carregando igrejas do campo da mãe...</p>
                )}
                {shouldAdjustOriginToParent && resolvedParentChurch && (
                  <p className="text-xs text-amber-700">
                    Destino acima da sua igreja. A origem foi ajustada para a igreja mãe: {buildChurchLabel(resolvedParentChurch)}.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Outros (se nao encontrar)</Label>
                <Input
                  value={letterForm.church_destination_manual}
                  onChange={(e) =>
                    setLetterForm((prev) => ({
                      ...prev,
                      church_destination_manual: e.target.value,
                      church_destination: "",
                    }))
                  }
                  onBlur={(e) =>
                    setLetterForm((prev) => ({
                      ...prev,
                      church_destination_manual: normalizeManualChurchDestination(e.target.value),
                      church_destination: "",
                    }))
                  }
                  placeholder="Ex.: 9901 - PIUMA-NITEROI"
                  disabled={!!letterForm.church_destination.trim()}
                />
                <p className="text-xs text-muted-foreground">
                  Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Se digitar diferente, o sistema tenta padronizar automaticamente.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data da pregacao</Label>
                  <Input
                    type="date"
                    min={todayIso}
                    max={maxPregacaoIso}
                    value={letterForm.preach_date}
                    onChange={(e) => setLetterForm((prev) => ({ ...prev, preach_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de emissao da carta</Label>
                  <Input value={formatDateBr(todayIso)} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select
                  value={letterForm.preach_period}
                  onValueChange={(value: "MANHA" | "TARDE" | "NOITE") => setLetterForm((prev) => ({ ...prev, preach_period: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANHA">Manha</SelectItem>
                    <SelectItem value="TARDE">Tarde</SelectItem>
                    <SelectItem value="NOITE">Noite</SelectItem>
                  </SelectContent>
                </Select>
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
                  <span className="text-base font-semibold sm:text-lg">{letterTarget?.nome || "Nao informado"}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{previewOriginName || "Nao informada"}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span>{previewDestination || "-"}</span>
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
                    <span>{letterForm.preach_date ? formatDateBr(letterForm.preach_date) : "-"}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{previewSignerName}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{previewSignerPhone}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto" disabled={creatingLetter}>
            Fechar
          </Button>
          <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={onSubmit} disabled={creatingLetter}>
            {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar carta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
