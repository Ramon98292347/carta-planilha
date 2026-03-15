import { formatDateBr, parseTotvsFromChurchText } from "@/lib/churchFormatting";

type NotificationItem = { id: string; title: string; body: string; ts: number };
type ChurchRow = {
  totvs_id: string;
  parent_totvs_id?: string | null;
  church_name: string;
  class: string;
};
type LetterRow = {
  id: string;
  church_totvs_id: string;
  preacher_user_id?: string | null;
  signer_user_id?: string | null;
  signer_totvs_id?: string | null;
  preacher_name: string;
  minister_role: string;
  preach_date: string;
  church_origin: string;
  church_destination: string;
  created_at: string;
  status: string;
  preach_period?: string | null;
  preacher_phone?: string | null;
  phone?: string | null;
  email?: string | null;
  doc_id?: string | null;
  pdf_url?: string | null;
  url_carta?: string | null;
  released_by_name?: string | null;
  released_at?: string | null;
  sent_at?: string | null;
};
type MemberRow = {
  id: string;
  full_name: string;
  cpf?: string | null;
  phone: string;
  email?: string | null;
  minister_role?: string | null;
  default_totvs_id?: string | null;
  is_active: boolean;
  can_create_released_letter?: boolean;
  ordination_date?: string | null;
  baptism_date?: string | null;
  role: string;
};
type NotificationRow = {
  id: string;
  title: string;
  message?: string | null;
  created_at: string;
};

const mapLetterStatus = (status: string) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "ENVIADA") return "Carta enviada";
  if (normalized === "LIBERADA") return "Carta liberada";
  if (normalized === "BLOQUEADO") return "Bloqueado";
  return "Aguardando liberacao";
};

export const buildChurchByTotvs = (churches: ChurchRow[]) => {
  const churchByTotvs = new Map<string, ChurchRow>();
  churches.forEach((church) => {
    churchByTotvs.set(String(church.totvs_id || "").trim(), church);
  });
  return churchByTotvs;
};

export const filterLettersForPastorScope = (letters: LetterRow[], churches: ChurchRow[], activeTotvsId: string) => {
  if (!activeTotvsId) return letters;

  const pastorScope = new Set<string>([
    activeTotvsId,
    ...churches.map((church) => String(church.totvs_id || "").trim()).filter(Boolean),
  ]);

  return letters.filter((row) => {
    const churchTotvs = String(row.church_totvs_id || "").trim();
    const originTotvs = parseTotvsFromChurchText(String(row.church_origin || ""));
    return pastorScope.has(churchTotvs) || pastorScope.has(originTotvs);
  });
};

export const buildMemberLookups = (members: MemberRow[]) => {
  const memberById = new Map<string, MemberRow>();
  const memberByPhone = new Map<string, MemberRow>();

  members.forEach((member) => {
    const memberId = String(member.id || "").trim();
    if (memberId) memberById.set(memberId, member);

    const memberPhone = String(member.phone || "").replace(/\D/g, "");
    if (memberPhone && !memberByPhone.has(memberPhone)) {
      memberByPhone.set(memberPhone, member);
    }
  });

  return { memberById, memberByPhone };
};

export const mapLettersToCartas = (
  letters: LetterRow[],
  churchByTotvs: Map<string, ChurchRow>,
  memberById: Map<string, MemberRow>,
  memberByPhone: Map<string, MemberRow>,
) =>
  letters.map((row) => {
    const rawStatus = String(row.status || "").trim().toUpperCase();
    const phone = String(row.preacher_phone || row.phone || "").trim();
    const churchMeta = churchByTotvs.get(String(row.church_totvs_id || "").trim());
    const linkedMember =
      memberById.get(String(row.preacher_user_id || "").trim()) ||
      memberByPhone.get(String(phone || "").replace(/\D/g, "")) ||
      null;
    const autoReleaseEnabled = Boolean(linkedMember?.can_create_released_letter);

    return {
      id: String(row.id || "").trim(),
      doc_id: String(row.doc_id || "").trim(),
      raw_status: rawStatus,
      church_totvs_id: String(row.church_totvs_id || "").trim(),
      preacher_user_id: String(row.preacher_user_id || "").trim(),
      signer_user_id: String(row.signer_user_id || "").trim(),
      signer_totvs_id: String(row.signer_totvs_id || "").trim(),
      linked_user_id: String(linkedMember?.id || "").trim(),
      linked_user_nome: String(linkedMember?.full_name || "").trim(),
      linked_user_telefone: String(linkedMember?.phone || "").trim(),
      linked_user_email: String(linkedMember?.email || "").trim(),
      linked_user_cargo: String(linkedMember?.minister_role || "").trim(),
      linked_user_role: String(linkedMember?.role || "").trim(),
      linked_user_default_totvs_id: String(linkedMember?.default_totvs_id || "").trim(),
      linked_user_status: linkedMember ? (linkedMember.is_active ? "AUTORIZADO" : "BLOQUEADO") : "",
      linked_user_status_carta: linkedMember ? (linkedMember.can_create_released_letter ? "LIBERADA" : "GERADA") : "",
      linked_user_auto_release: linkedMember?.can_create_released_letter ? "1" : "0",
      nome: String(row.preacher_name || "-").trim() || "-",
      telefone: phone || "-",
      email: String(row.email || "-").trim() || "-",
      data_emissao: formatDateBr(row.created_at),
      data_pregacao: formatDateBr(row.preach_date),
      data_ordenacao: "-",
      igreja_origem: String(row.church_origin || "-").trim() || "-",
      igreja_destino: String(row.church_destination || "-").trim() || "-",
      cargo: String(row.minister_role || "-").trim() || "-",
      funcao: String(row.minister_role || "-").trim() || "-",
      regiao: String(churchMeta?.class || "-").trim() || "-",
      status: mapLetterStatus(rawStatus),
      obreiro_auth_status_carta: autoReleaseEnabled ? "LIBERADA" : "GERADA",
      status_carta: rawStatus === "LIBERADA" || rawStatus === "ENVIADA" ? "LIBERADA" : rawStatus === "BLOQUEADO" ? "GERADA" : "GERADA",
      status_usuario: rawStatus === "BLOQUEADO" ? "BLOQUEADO" : "",
      envio: rawStatus === "ENVIADA" ? "ENVIADO" : "",
      drive_status: rawStatus === "ENVIADA" ? "CARTA_ENVIADA" : "",
      data_liberacao: formatDateBr(row.released_at),
      liberado_por: String(row.released_by_name || "-").trim() || "-",
      data_envio: formatDateBr(row.sent_at),
      url_pdf: String(row.pdf_url || row.url_carta || "").trim(),
      pdf_url: String(row.pdf_url || "").trim(),
      doc_url: String(row.url_carta || "").trim(),
    };
  });

export const mapMembersToObreiros = (members: MemberRow[], churchByTotvs: Map<string, ChurchRow>) =>
  members
    .filter((row) => String(row.role || "").trim().toLowerCase() === "obreiro")
    .map((row) => {
      const church = churchByTotvs.get(String(row.default_totvs_id || "").trim());
      const autoReleaseEnabled = Boolean(row.can_create_released_letter);

      return {
        id: String(row.id || "").trim(),
        cpf: String(row.cpf || "").trim(),
        nome: String(row.full_name || "-").trim() || "-",
        cargo: String(row.minister_role || "-").trim() || "-",
        igreja: String(church?.church_name || row.default_totvs_id || "-").trim() || "-",
        campo: String(church?.class || "-").trim() || "-",
        status: row.is_active ? "AUTORIZADO" : "BLOQUEADO",
        status_usuario: row.is_active ? "" : "BLOQUEADO",
        status_carta: autoReleaseEnabled ? "LIBERADA" : "GERADA",
        obreiro_auth_status_carta: autoReleaseEnabled ? "LIBERADA" : "GERADA",
        can_create_released_letter: autoReleaseEnabled ? "1" : "0",
        data_ordenacao: formatDateBr(row.ordination_date),
        data_batismo: formatDateBr(row.baptism_date),
        telefone: String(row.phone || "-").trim() || "-",
        email: String(row.email || "-").trim() || "-",
        funcao: String(row.minister_role || "-").trim() || "-",
        regiao: String(church?.class || "-").trim() || "-",
        church_totvs_id: String(row.default_totvs_id || "").trim(),
        default_totvs_id: String(row.default_totvs_id || "").trim(),
      };
    });

export const mapNotifications = (notificationsRows: NotificationRow[]): NotificationItem[] =>
  notificationsRows.map((row) => ({
    id: String(row.id || "").trim(),
    title: String(row.title || "Notificacao").trim() || "Notificacao",
    body: String(row.message || "").trim(),
    ts: new Date(String(row.created_at || "")).getTime() || Date.now(),
  }));
