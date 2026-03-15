import { buildSendLetterPayload, getEnvioStatus } from "@/lib/dataTableLetters";
import { getDocId, getPhoneDigits, getStatusCartaOperacional, getStatusCartaVisual, isAutoReleaseEnabled, isBlockedRow } from "@/lib/dataTableHelpers";

type Row = Record<string, string>;
type WebhookResult = Record<string, any> | null | undefined;

interface ActionsContext {
  resolveRow: (row: Row) => Row;
  callLettersWebhook: (body: Record<string, string>) => Promise<Record<string, any> | null>;
  applyWebhookResultToRow: (row: Row, result: WebhookResult) => void;
  upsertObreiroAuthStatus: (row: Row, targetStatus: "BLOQUEADO" | "AUTORIZADO") => Promise<Record<string, any> | null>;
  upsertObreiroAutoRelease: (row: Row, enabled: boolean) => Promise<Record<string, any> | null>;
  applyRowOverride: (docId: string, partial: Record<string, string>) => void;
  applyPhoneOverride: (phone: string, partial: Record<string, string>) => void;
  persistAutoSentDocId: (docId: string) => void;
  onRefetchCache?: () => Promise<void> | void;
  onDeleteSuccess?: (row: Row) => void;
  setDeletingKey: (key: string | null) => void;
  deleteKey: (row: Row) => string;
  shareOnWhatsApp: (row: Row) => void;
  toast: {
    error: (message: string) => void;
    success: (message: string) => void;
  };
}

export async function liberarCartaAction(row: Row, ctx: ActionsContext) {
  const currentRow = ctx.resolveRow(row);
  const docId = getDocId(currentRow);
  if (isBlockedRow(currentRow)) {
    ctx.toast.error("Este membro esta bloqueado.");
    return;
  }
  if (isAutoReleaseEnabled(currentRow)) {
    ctx.toast.error("Liberacao automatica ativa para esta carta.");
    return;
  }
  if (getStatusCartaVisual(currentRow) === "LIBERADA") {
    ctx.toast.error("Carta ja liberada.");
    return;
  }
  if (!docId) {
    ctx.toast.error("Documento sem ID.");
    return;
  }
  try {
    const pastorName = (localStorage.getItem("pastor_name") || "Pastor").trim() || "Pastor";
    const sendResult = await ctx.callLettersWebhook(buildSendLetterPayload(currentRow, "manual", pastorName));
    ctx.applyWebhookResultToRow(currentRow, {
      ...sendResult,
      action: sendResult?.action || "send_letter",
      statusCarta: sendResult?.statusCarta || "LIBERADA",
      liberadoPor: sendResult?.liberadoPor || pastorName,
    });
    ctx.toast.success((sendResult?.message || "Carta liberada com sucesso").trim());
    await ctx.onRefetchCache?.();
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel liberar a carta.");
  }
}

export async function marcarEnvioAction(row: Row, ctx: ActionsContext, options?: { skipLiberacaoCheck?: boolean }) {
  const currentRow = ctx.resolveRow(row);
  const docId = getDocId(currentRow);
  if (isBlockedRow(currentRow)) {
    ctx.toast.error("Este membro esta bloqueado.");
    return;
  }
  if (!options?.skipLiberacaoCheck && !isAutoReleaseEnabled(currentRow) && getStatusCartaVisual(currentRow) !== "LIBERADA") {
    ctx.toast.error("Libere a carta antes de compartilhar.");
    return;
  }
  if (!docId) {
    ctx.toast.error("Documento sem ID.");
    return;
  }
  try {
    const result = await ctx.callLettersWebhook({
      action: "set_envio",
      docId,
      envio: "ENVIADO",
    });
    ctx.applyWebhookResultToRow(currentRow, {
      ...result,
      action: result?.action || "set_envio",
      envio: result?.envio || "ENVIADO",
    });
    ctx.toast.success((result?.message || "Carta Enviada Com Sucesso").trim());
    await ctx.onRefetchCache?.();
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel marcar envio.");
  }
}

export async function compartilharCartaAction(row: Row, ctx: ActionsContext) {
  const currentRow = ctx.resolveRow(row);
  if (isBlockedRow(currentRow)) {
    ctx.toast.error("Este membro esta bloqueado.");
    return;
  }
  ctx.shareOnWhatsApp(currentRow);
  await marcarEnvioAction(currentRow, ctx, { skipLiberacaoCheck: true });
}

export async function moverCartaEnviadaAction(row: Row, ctx: ActionsContext) {
  const currentRow = ctx.resolveRow(row);
  const docId = getDocId(currentRow);
  if (isBlockedRow(currentRow)) {
    ctx.toast.error("Este membro esta bloqueado.");
    return;
  }
  if (!isAutoReleaseEnabled(currentRow) && getStatusCartaVisual(currentRow) !== "LIBERADA") {
    ctx.toast.error("Libere a carta antes de mover.");
    return;
  }
  if (!docId) {
    ctx.toast.error("Documento sem ID.");
    return;
  }
  try {
    const result = await ctx.callLettersWebhook({
      action: "move_sent",
      docId,
    });
    ctx.applyWebhookResultToRow(currentRow, {
      ...result,
      action: result?.action || "move_sent",
      driveStatus: result?.driveStatus || "CARTA_ENVIADA",
    });
    await ctx.onRefetchCache?.();
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel mover a carta.");
  }
}

export async function toggleBloqueioUsuarioAction(row: Row, ctx: ActionsContext) {
  const currentRow = ctx.resolveRow(row);
  const docId = getDocId(currentRow);
  const phone = getPhoneDigits(currentRow);
  const targetStatus = isBlockedRow(currentRow) ? "AUTORIZADO" : "BLOQUEADO";

  try {
    const saved = await ctx.upsertObreiroAuthStatus(currentRow, targetStatus);
    const nextStatus = String(saved?.status || targetStatus).trim().toUpperCase() || targetStatus;

    if (docId) {
      ctx.applyRowOverride(docId, {
        obreiro_auth_status: nextStatus,
        "Status Usuario": nextStatus,
        statusUsuario: nextStatus,
        status_usuario: nextStatus,
        status: nextStatus,
        __force_blocked: targetStatus === "BLOQUEADO" ? "1" : "0",
      });
    }

    if (phone) {
      ctx.applyPhoneOverride(phone, {
        obreiro_auth_status: nextStatus,
        "Status Usuario": nextStatus,
        statusUsuario: nextStatus,
        status_usuario: nextStatus,
        status: nextStatus,
        __force_blocked: targetStatus === "BLOQUEADO" ? "1" : "0",
      });
    }

    ctx.toast.success(targetStatus === "BLOQUEADO" ? "Usuario bloqueado com sucesso" : "Usuario desbloqueado com sucesso");
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel atualizar status do usuario.");
  }
}

export async function toggleLiberacaoAutomaticaAction(row: Row, ctx: ActionsContext) {
  const currentRow = ctx.resolveRow(row);
  const docId = getDocId(currentRow);
  const phone = getPhoneDigits(currentRow);

  if (!docId && !phone) {
    ctx.toast.error("Registro sem identificador para atualizar liberacao automatica.");
    return;
  }

  const next = !isAutoReleaseEnabled(currentRow);
  try {
    const saved = await ctx.upsertObreiroAutoRelease(currentRow, next);
    const nextStatusCarta = String(saved?.status_carta || (next ? "LIBERADA" : "GERADA")).trim().toUpperCase() || (next ? "LIBERADA" : "GERADA");

    if (docId) {
      ctx.applyRowOverride(docId, {
        obreiro_auth_status_carta: nextStatusCarta,
      });
    }

    if (phone) {
      ctx.applyPhoneOverride(phone, {
        obreiro_auth_status_carta: nextStatusCarta,
      });
    }

    ctx.toast.success(next ? "Liberacao automatica ativada" : "Liberacao automatica desativada");
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel atualizar liberacao automatica.");
  }
}

export async function deleteCartaAction(row: Row, ctx: ActionsContext) {
  const docId = getDocId(ctx.resolveRow(row));

  if (!docId) {
    ctx.toast.error("Nao foi possivel excluir. Tente novamente.");
    return;
  }

  const confirmDelete = window.confirm("Tem certeza que deseja excluir esta carta?");
  if (!confirmDelete) return;

  const rowKey = ctx.deleteKey(row);
  ctx.setDeletingKey(rowKey);

  try {
    const result = await ctx.callLettersWebhook({
      action: "delete",
      docId,
    });

    ctx.toast.success((result?.message || "Carta exclu?da com sucesso").trim());
    ctx.onDeleteSuccess?.(row);
    await ctx.onRefetchCache?.();
  } catch (err: any) {
    ctx.toast.error(err?.message || "Nao foi possivel excluir. Tente novamente.");
  } finally {
    ctx.setDeletingKey(null);
  }
}

export function scheduleAutoSendForRows(
  rows: Row[],
  ctx: Pick<
    ActionsContext,
    "callLettersWebhook" | "applyWebhookResultToRow" | "persistAutoSentDocId" | "onRefetchCache" | "toast"
  > & {
    autoSentDocIds: Set<string>;
    seenDocIds: Set<string>;
    autoSendTimers: Record<string, number>;
  },
) {
  rows.forEach((row) => {
    const docId = getDocId(row);
    if (!docId) return;

    if (getEnvioStatus(row) === "ENVIADO") {
      ctx.persistAutoSentDocId(docId);
    }

    const isNewRow = !ctx.seenDocIds.has(docId);
    if (!isNewRow) return;

    ctx.seenDocIds.add(docId);

    const blocked = isBlockedRow(row);
    const statusCartaOperacional = getStatusCartaOperacional(row);
    const envio = getEnvioStatus(row);

    if (blocked) return;
    if (!isAutoReleaseEnabled(row)) return;
    if (statusCartaOperacional !== "LIBERADA") return;
    if (envio === "ENVIADO") return;
    if (ctx.autoSentDocIds.has(docId)) return;
    if (ctx.autoSendTimers[docId]) return;

    ctx.autoSendTimers[docId] = window.setTimeout(async () => {
      try {
        const result = await ctx.callLettersWebhook(buildSendLetterPayload(row, "automatico", "LIBERACAO_AUTOMATICA"));
        ctx.persistAutoSentDocId(docId);
        ctx.applyWebhookResultToRow(row, {
          ...result,
          action: result?.action || "send_letter",
          statusCarta: result?.statusCarta || "LIBERADA",
        });
        ctx.toast.success(String(result?.message || "Carta enviada automaticamente").trim());
        await ctx.onRefetchCache?.();
      } catch (err: any) {
        ctx.toast.error(err?.message || "Nao foi possivel enviar carta automaticamente.");
      } finally {
        delete ctx.autoSendTimers[docId];
      }
    }, 30000);
  });
}
