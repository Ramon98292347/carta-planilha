import { parseTotvsFromChurchText } from "@/lib/churchFormatting";

export type ScopedChurch = {
  totvs_id: string;
  parent_totvs_id?: string | null;
  church_name: string;
  class?: string | null;
};

export const normalizeChurchTotvs = (value: string | null | undefined) => String(value || "").trim();

export const buildChurchLabel = (church: Pick<ScopedChurch, "totvs_id" | "church_name">) =>
  `${church.totvs_id} - ${church.church_name}`;

export const findChurchByTotvs = <T extends ScopedChurch>(churches: T[], totvsId: string) => {
  const normalized = normalizeChurchTotvs(totvsId);
  if (!normalized) return null;
  return churches.find((church) => normalizeChurchTotvs(church.totvs_id) === normalized) || null;
};

export const buildChurchTotvsSet = <T extends Pick<ScopedChurch, "totvs_id">>(churches: T[]) =>
  new Set(churches.map((church) => normalizeChurchTotvs(church.totvs_id)).filter(Boolean));

export const resolveParentChurch = <T extends ScopedChurch>(params: {
  parentChurch: T | null;
  sourceChurches: T[];
  directParentTotvsId: string;
}) => {
  const { parentChurch, sourceChurches, directParentTotvsId } = params;
  return parentChurch || findChurchByTotvs(sourceChurches, directParentTotvsId);
};

export const resolveAllowedOriginChurches = <T extends ScopedChurch>(activeChurch: T | null, parentChurch: T | null) => {
  const list: T[] = [];
  if (activeChurch) list.push(activeChurch);
  if (parentChurch && normalizeChurchTotvs(parentChurch.totvs_id) !== normalizeChurchTotvs(activeChurch?.totvs_id)) {
    list.push(parentChurch);
  }
  return list;
};

export const resolveSelectedDestinationChurch = <T extends ScopedChurch>(churches: T[], destinationValue: string) => {
  const destinationTotvs = parseTotvsFromChurchText(destinationValue);
  return findChurchByTotvs(churches, destinationTotvs);
};

export const shouldUseParentOriginForDestination = (params: {
  selectedDestinationChurch: Pick<ScopedChurch, "totvs_id"> | null;
  activeChurch: Pick<ScopedChurch, "totvs_id"> | null;
  resolvedParentChurch: Pick<ScopedChurch, "totvs_id"> | null;
  parentScopeTotvs: Set<string>;
  activeScopeTotvs: Set<string>;
}) => {
  const { selectedDestinationChurch, activeChurch, resolvedParentChurch, parentScopeTotvs, activeScopeTotvs } = params;
  if (!selectedDestinationChurch || !activeChurch || !resolvedParentChurch) return false;
  const destinationTotvs = normalizeChurchTotvs(selectedDestinationChurch.totvs_id);
  return parentScopeTotvs.has(destinationTotvs) && !activeScopeTotvs.has(destinationTotvs);
};
