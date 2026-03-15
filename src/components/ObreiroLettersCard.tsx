import { Dispatch, SetStateAction } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CartaRow = Record<string, string>;

type ObreiroStats = {
  total: number;
  aguardando: number;
  liberadas: number;
  automaticas: number;
  enviadas: number;
};

type ObreiroLettersCardProps = {
  stats: ObreiroStats;
  filteredCards: CartaRow[];
  profileStatus: string;
  cardsPeriodPreset: "7d" | "30d" | "all";
  setCardsPeriodPreset: Dispatch<SetStateAction<"7d" | "30d" | "all">>;
  cardsStatusFilter: string;
  setCardsStatusFilter: Dispatch<SetStateAction<string>>;
  cardsDateStart: string;
  setCardsDateStart: Dispatch<SetStateAction<string>>;
  cardsDateEnd: string;
  setCardsDateEnd: Dispatch<SetStateAction<string>>;
  pdfUrlByLetterId: Record<string, string>;
  getCartaStatus: (row: CartaRow) => string;
  getCartaStatusClass: (label: string) => string;
  formatDisplayDate: (value: string) => string;
  onOpenLetter: (row: CartaRow) => void;
};

export function ObreiroLettersCard({
  filteredCards,
  profileStatus,
  cardsPeriodPreset,
  setCardsPeriodPreset,
  cardsStatusFilter,
  setCardsStatusFilter,
  cardsDateStart,
  setCardsDateStart,
  cardsDateEnd,
  setCardsDateEnd,
  pdfUrlByLetterId,
  getCartaStatus,
  getCartaStatusClass,
  formatDisplayDate,
  onOpenLetter,
}: ObreiroLettersCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Minhas cartas</CardTitle>
        <CardDescription>As cartas agora sao lidas da tabela `letters` com as regras de acesso do banco novo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3">
            <div className="w-[180px] space-y-2">
              <Label>Periodo</Label>
              <Select value={cardsPeriodPreset} onValueChange={(value: "7d" | "30d" | "all") => setCardsPeriodPreset(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Ultimos 7 dias</SelectItem>
                  <SelectItem value="30d">Ultimos 30 dias</SelectItem>
                  <SelectItem value="all">Periodo completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px] space-y-2">
              <Label>Status</Label>
              <Select value={cardsStatusFilter} onValueChange={setCardsStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="aguardando liberacao">Aguardando liberacao</SelectItem>
                  <SelectItem value="liberacao automatica">Liberacao automatica</SelectItem>
                  <SelectItem value="carta liberada">Carta liberada</SelectItem>
                  <SelectItem value="carta enviada">Carta enviada</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px] space-y-2">
              <Label>De</Label>
              <Input type="date" value={cardsDateStart} onChange={(e) => setCardsDateStart(e.target.value)} />
            </div>
            <div className="w-[140px] space-y-2">
              <Label>Ate</Label>
              <Input type="date" value={cardsDateEnd} onChange={(e) => setCardsDateEnd(e.target.value)} />
            </div>
          </div>
        </div>
        {filteredCards.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma carta encontrada para este obreiro.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Data da pregacao</th>
                  <th className="px-4 py-3">Emissao</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((row, index) => {
                  const statusLabel = getCartaStatus(row);
                  const canOpenPdf =
                    statusLabel === "Carta liberada" ||
                    statusLabel === "Liberacao automatica" ||
                    statusLabel === "Carta enviada";
                  const hasReadyFile = !!String(pdfUrlByLetterId[String(row.id || "").trim()] || row.pdf_url || row.doc_url || "").trim();

                  return (
                    <tr key={`${row.id || row.doc_id || row.nome || "carta"}-${index}`} className="border-t">
                      <td className="px-4 py-3 font-medium text-foreground">{row.igreja_destino || row.ipda_destino || "Destino nao informado"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.igreja_origem || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDisplayDate(row.data_pregacao || row["Data da pregacao."] || "-")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDisplayDate(row.data_emissao || row["Carimbo de data/hora"] || "-")}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={getCartaStatusClass(statusLabel)}>
                          {statusLabel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          disabled={!canOpenPdf || !hasReadyFile || profileStatus.trim().toUpperCase() === "BLOQUEADO"}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
                          onClick={() => onOpenLetter(row)}
                        >
                          Abrir PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
