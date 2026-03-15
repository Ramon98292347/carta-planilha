import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Eye, EllipsisVertical, Share2, Trash2 } from "lucide-react";
import { getEnvioStatus } from "@/lib/dataTableLetters";
import { isAutoReleaseEnabled, isBlockedRow } from "@/lib/dataTableHelpers";
import type { RowActionItem } from "@/lib/dataTableTypes";

interface Props {
  row: Record<string, string>;
  variant: "full" | "detailsOnly";
  buttonVariant: "ghost" | "outline";
  buttonClassName: string;
  fullWidth?: boolean;
  rowActions: RowActionItem[];
  enableDelete: boolean;
  deleting: boolean;
  canLiberarCarta?: (row: Record<string, string>) => boolean;
  onOpenDetails: () => void;
  onToggleBloqueioUsuario: (row: Record<string, string>) => void;
  onToggleLiberacaoAutomatica: (row: Record<string, string>) => void;
  onLiberarCarta: (row: Record<string, string>) => void;
  onOpenCartaForm: (row: Record<string, string>) => void;
  onCompartilharCarta: (row: Record<string, string>) => void;
  onDeleteCarta: (row: Record<string, string>) => void;
}

export function DataTableActionMenu({
  row,
  variant,
  buttonVariant,
  buttonClassName,
  fullWidth = false,
  rowActions,
  enableDelete,
  deleting,
  canLiberarCarta,
  onOpenDetails,
  onToggleBloqueioUsuario,
  onToggleLiberacaoAutomatica,
  onLiberarCarta,
  onOpenCartaForm,
  onCompartilharCarta,
  onDeleteCarta,
}: Props) {
  const blocked = isBlockedRow(row);
  const liberacaoAutomatica = isAutoReleaseEnabled(row);
  const isEnviado = getEnvioStatus(row) === "ENVIADO";
  const canLiberar = canLiberarCarta ? canLiberarCarta(row) : !blocked;
  const buttonWidthClass = fullWidth ? "w-full" : "";

  if (variant === "detailsOnly") {
    if (rowActions.length === 0) {
      return (
        <Button variant={buttonVariant} size="sm" onClick={onOpenDetails} className={`${buttonWidthClass} ${buttonClassName}`.trim()}>
          <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={buttonVariant} size="sm" className={`${buttonWidthClass} ${buttonClassName}`.trim()}>
            <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
          <DropdownMenuItem onSelect={onOpenDetails}>
            <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {rowActions.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onSelect={() => {
                void item.onClick();
              }}
              disabled={item.disabled}
              className={item.destructive ? "text-rose-700 focus:text-rose-800" : undefined}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={buttonVariant} size="sm" className={`${buttonWidthClass} ${buttonClassName}`.trim()}>
          <EllipsisVertical className="mr-1 h-3.5 w-3.5" /> Acoes
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
        <DropdownMenuItem onSelect={onOpenDetails}>
          <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleBloqueioUsuario(row)}>
          {blocked ? "Desbloquear usuario" : "Bloquear usuario"}
        </DropdownMenuItem>
        {!blocked && (
          <DropdownMenuItem onSelect={() => onToggleLiberacaoAutomatica(row)}>
            Liberacao automatica: {liberacaoAutomatica ? "ON" : "OFF"}
          </DropdownMenuItem>
        )}
        {canLiberar && (
          <DropdownMenuItem disabled={isEnviado} onSelect={() => onLiberarCarta(row)}>
            Liberar carta
          </DropdownMenuItem>
        )}
        {!blocked && <DropdownMenuItem onSelect={() => onOpenCartaForm(row)}>Carta</DropdownMenuItem>}
        {!blocked && (
          <DropdownMenuItem disabled={isEnviado} onSelect={() => onCompartilharCarta(row)}>
            <Share2 className="mr-2 h-3.5 w-3.5" /> Compartilhar
          </DropdownMenuItem>
        )}
        {!blocked && liberacaoAutomatica && <DropdownMenuItem disabled>Liberacao automatica</DropdownMenuItem>}
        {blocked && <DropdownMenuItem disabled>Este membro esta bloqueado</DropdownMenuItem>}
        {enableDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDeleteCarta(row)}
              disabled={deleting}
              className="text-rose-700 focus:text-rose-800"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {deleting ? "Excluindo..." : "Excluir"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
