import { isPastorManagedLetter, isPastorManagedMember, type PastorPermissionContext } from "@/lib/letterPermissions";

export type LetterTarget = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cargo: string;
  church_totvs_id?: string;
};

export type RowActionItem = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

type BuildPastorCartaRowActionsArgs = {
  row: Record<string, string>;
  userRole: string;
  pastorPermissionContext: PastorPermissionContext;
  resolveObreiroFromCarta: (row: Record<string, string>) => Record<string, string> | null;
  isLetterBlocked: (row: Record<string, string>, linkedUser?: Record<string, string> | null) => boolean;
  isRowBlocked: (row: Record<string, string>) => boolean;
  isAutoReleaseEnabled: (row: Record<string, string>) => boolean;
  handleManageLetter: (row: Record<string, string>, action: "release" | "share" | "delete") => Promise<void>;
  handleToggleUserBlock: (row: Record<string, string>) => Promise<void>;
  handleToggleAutoRelease: (row: Record<string, string>) => Promise<void>;
  openLetterDialogForTarget: (target: LetterTarget) => void;
  shareLetterOnWhatsApp: (row: Record<string, string>) => boolean;
  connect: (sheetId?: string, worksheetName?: string, options?: { silent?: boolean }) => Promise<void>;
  toast: ToastApi;
};

export const buildPastorCartaRowActions = ({
  row,
  userRole,
  pastorPermissionContext,
  resolveObreiroFromCarta,
  isLetterBlocked,
  isRowBlocked,
  isAutoReleaseEnabled,
  handleManageLetter,
  handleToggleUserBlock,
  handleToggleAutoRelease,
  openLetterDialogForTarget,
  shareLetterOnWhatsApp,
  connect,
  toast,
}: BuildPastorCartaRowActionsArgs): RowActionItem[] => {
  const obreiro = resolveObreiroFromCarta(row);
  const rawStatus = String(row.raw_status || "").trim().toUpperCase();
  const blocked = isLetterBlocked(row, obreiro);
  const isEnviado = rawStatus === "ENVIADA";
  const managedByCurrentPastor = isPastorManagedLetter(pastorPermissionContext, row);
  const canLiberar = !blocked && managedByCurrentPastor && rawStatus === "AGUARDANDO_LIBERACAO";
  const canCompartilhar = !blocked && (rawStatus === "LIBERADA" || rawStatus === "ENVIADA");

  const actions: RowActionItem[] = [];

  actions.push(
    {
      label: canLiberar ? "Liberar carta" : "Detalhes da carta",
      onClick: async () => {
        if (!canLiberar) return;
        try {
          await handleManageLetter(row, "release");
          toast.success("Carta liberada com sucesso.");
          await connect("", "", { silent: true });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Falha ao liberar carta.");
        }
      },
      disabled: !canLiberar,
    },
    ...(userRole === "pastor"
      ? [
          {
            label: "Carta",
            onClick: () =>
              openLetterDialogForTarget({
                id: obreiro?.id || String(row.preacher_user_id || "").trim(),
                nome: obreiro?.nome || row.nome || "",
                telefone: obreiro?.telefone || row.telefone || "",
                email: obreiro?.email || row.email || "",
                cargo: obreiro?.cargo || row.cargo || "",
                church_totvs_id: row.church_totvs_id || obreiro?.church_totvs_id || obreiro?.default_totvs_id || "",
              }),
            disabled: Boolean(obreiro && isRowBlocked(obreiro)),
          },
        ]
      : []),
  );

  if (obreiro) {
    const managedMember = isPastorManagedMember(pastorPermissionContext, obreiro);
    actions.push(
      {
        label: isRowBlocked(obreiro) ? "Desbloquear usuario" : "Bloquear usuario",
        onClick: () => handleToggleUserBlock(obreiro),
        disabled: !managedByCurrentPastor || !managedMember,
      },
      {
        label: `Liberacao automatica: ${isAutoReleaseEnabled(obreiro) ? "ON" : "OFF"}`,
        onClick: () => handleToggleAutoRelease(obreiro),
        disabled: isRowBlocked(obreiro) || !managedByCurrentPastor || !managedMember,
      },
    );
  } else {
    actions.push({
      label: "Obreiro nao vinculado",
      onClick: () => {},
      disabled: true,
    });
  }

  actions.push(
    {
      label: "Compartilhar",
      onClick: async () => {
        const opened = shareLetterOnWhatsApp(row);
        if (!opened) return;
        try {
          await handleManageLetter(row, "share");
          await connect("", "", { silent: true });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Falha ao marcar carta como enviada.");
        }
      },
      disabled: !canCompartilhar || isEnviado,
    },
    {
      label: "Excluir",
      onClick: async () => {
        try {
          await handleManageLetter(row, "delete");
          toast.success("Carta excluida com sucesso.");
          await connect("", "", { silent: true });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Falha ao excluir carta.");
        }
      },
      destructive: true,
      disabled: rawStatus === "EXCLUIDA",
    },
  );

  return actions;
};
