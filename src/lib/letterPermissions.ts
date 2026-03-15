import { parseTotvsFromChurchText } from "@/lib/churchFormatting";
import { normalizeChurchTotvs } from "@/lib/churchScope";

type LetterLike = Record<string, string>;
type MemberLike = Record<string, string>;

export type PastorPermissionContext = {
  userRole: string;
  userId: string;
  activeTotvsId: string;
  activeScopeTotvs: Set<string>;
};

export const isPastorManagedOriginTotvs = (
  userRole: string,
  activeTotvsId: string,
  activeScopeTotvs: Set<string>,
  totvsId: string,
) => {
  if (userRole !== "pastor") return true;
  const normalized = normalizeChurchTotvs(totvsId);
  if (!normalized) return false;
  return normalized === normalizeChurchTotvs(activeTotvsId) || activeScopeTotvs.has(normalized);
};

export const isPastorManagedLetter = (context: PastorPermissionContext, row: LetterLike) => {
  const { userRole, userId, activeTotvsId, activeScopeTotvs } = context;
  if (userRole !== "pastor") return true;

  const signerUserId = String(row.signer_user_id || "").trim();
  if (signerUserId) return signerUserId === userId;

  const signerTotvsId = String(row.signer_totvs_id || "").trim();
  if (signerTotvsId) return isPastorManagedOriginTotvs(userRole, activeTotvsId, activeScopeTotvs, signerTotvsId);

  const originTotvs = parseTotvsFromChurchText(String(row.igreja_origem || ""));
  return isPastorManagedOriginTotvs(userRole, activeTotvsId, activeScopeTotvs, originTotvs);
};

export const isPastorManagedMember = (context: Pick<PastorPermissionContext, "userRole" | "activeTotvsId" | "activeScopeTotvs">, row: MemberLike) => {
  const { userRole, activeTotvsId, activeScopeTotvs } = context;
  if (userRole !== "pastor") return true;
  const workerTotvs = String(row.church_totvs_id || row.default_totvs_id || "").trim();
  return isPastorManagedOriginTotvs(userRole, activeTotvsId, activeScopeTotvs, workerTotvs);
};
