import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Unlink, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  url: string;
  connected: boolean;
  loading: boolean;
  error: string | null;
  cartasSheetUsed?: string;
  customSheetName: string;
  onCustomSheetNameChange: (v: string) => void;
  onConnect: (url: string, sheetName?: string) => void;
  onDisconnect: () => void;
}

export function ConnectionPanel({ url, connected, loading, error, cartasSheetUsed, customSheetName, onCustomSheetNameChange, onConnect, onDisconnect }: Props) {
  const [inputUrl, setInputUrl] = useState(url);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(inputUrl, customSheetName);
  };

  return (
    <div className="rounded-lg border bg-card p-4 md:p-6 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-bold text-card-foreground">Conexão com Planilha</h2>
          </div>
          {connected && (
            <span className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
              {cartasSheetUsed && <span className="ml-1 truncate text-muted-foreground">(aba: {cartasSheetUsed})</span>}
            </span>
          )}
        </div>

        {connected && (
          <Button type="button" variant="outline" onClick={onDisconnect} disabled={loading} className="w-full sm:w-auto">
            <Unlink className="h-4 w-4 mr-1" /> Desconectar
          </Button>
        )}
      </div>

      {!connected && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Cole a URL da planilha Google Sheets publicada..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1"
              disabled={loading}
            />
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="submit" disabled={loading || !inputUrl.trim()} className="w-full sm:w-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Conectar
              </Button>
            </div>
          </div>

          <Input
            placeholder="Nome da aba de Cartas (opcional, ex: Respostas ao formulário 1)"
            value={customSheetName}
            onChange={(e) => onCustomSheetNameChange(e.target.value)}
            className="max-w-md text-sm"
            disabled={loading}
          />
        </form>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!connected && !error && (
        <p className="mt-2 text-xs text-muted-foreground">
          A planilha deve estar <strong>publicada na web</strong> (Arquivo → Compartilhar → Publicar na web).
          Abas esperadas: <strong>CARTAS_DB</strong> e <strong>OBREIROS_DB</strong>. Caso não existam, o sistema tentará <strong>CARTAS</strong> e <strong>OBREIROS</strong>.
        </p>
      )}
    </div>
  );
}
