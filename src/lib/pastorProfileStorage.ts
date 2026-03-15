import { onlyDigits } from "@/lib/cep";
import { normalizeMinisterialRoleLabel } from "@/lib/ministerialRole";

export type PastorProfileState = {
  nome: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  data_ordenacao: string;
  cargo_ministerial: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const readPastorProfileFromStorage = (): PastorProfileState => ({
  nome: (localStorage.getItem("user_name") || localStorage.getItem("pastor_name") || "").trim(),
  telefone: onlyDigits(localStorage.getItem("user_phone") || localStorage.getItem("pastor_phone") || ""),
  email: (localStorage.getItem("user_email") || "").trim(),
  data_nascimento: (localStorage.getItem("pastor_data_nascimento") || "").trim(),
  data_ordenacao: (localStorage.getItem("pastor_data_ordenacao") || "").trim(),
  cargo_ministerial: normalizeMinisterialRoleLabel(
    localStorage.getItem("minister_role") || localStorage.getItem("pastor_minister_role") || "Pastor",
    "Pastor",
  ),
  cep: (localStorage.getItem("pastor_cep") || "").trim(),
  endereco: (localStorage.getItem("pastor_endereco") || "").trim(),
  numero: (localStorage.getItem("pastor_numero") || "").trim(),
  complemento: (localStorage.getItem("pastor_complemento") || "").trim(),
  bairro: (localStorage.getItem("pastor_bairro") || "").trim(),
  cidade: (localStorage.getItem("pastor_cidade") || "").trim(),
  uf: (localStorage.getItem("pastor_uf") || "").trim(),
});

export const mapSavedProfileToPastorProfile = (input: Record<string, unknown>, fallback: PastorProfileState): PastorProfileState => ({
  ...fallback,
  nome: String(input.full_name || fallback.nome || "").trim(),
  telefone: onlyDigits(String(input.phone || fallback.telefone || "")),
  email: String(input.email || fallback.email || "").trim(),
  data_nascimento: String(input.birth_date || fallback.data_nascimento || "").trim(),
  data_ordenacao: String(input.ordination_date || fallback.data_ordenacao || "").trim(),
  cargo_ministerial: normalizeMinisterialRoleLabel(input.minister_role, fallback.cargo_ministerial),
  cep: String(input.cep || fallback.cep || "").trim(),
  endereco: String(input.address_street || fallback.endereco || "").trim(),
  numero: String(input.address_number || fallback.numero || "").trim(),
  complemento: String(input.address_complement || fallback.complemento || "").trim(),
  bairro: String(input.address_neighborhood || fallback.bairro || "").trim(),
  cidade: String(input.address_city || fallback.cidade || "").trim(),
  uf: String(input.address_state || fallback.uf || "").trim().toUpperCase(),
});

export const writePastorProfileToStorage = (profile: PastorProfileState) => {
  const ministerialRole = normalizeMinisterialRoleLabel(profile.cargo_ministerial, "Pastor");
  localStorage.setItem("user_name", profile.nome || "");
  localStorage.setItem("pastor_name", profile.nome || "");
  localStorage.setItem("user_phone", profile.telefone || "");
  localStorage.setItem("pastor_phone", profile.telefone || "");
  localStorage.setItem("user_email", profile.email || "");
  localStorage.setItem("minister_role", ministerialRole);
  localStorage.setItem("pastor_minister_role", ministerialRole);
  localStorage.setItem("pastor_data_nascimento", profile.data_nascimento || "");
  localStorage.setItem("pastor_data_ordenacao", profile.data_ordenacao || "");
  localStorage.setItem("pastor_cep", profile.cep || "");
  localStorage.setItem("pastor_endereco", profile.endereco || "");
  localStorage.setItem("pastor_numero", profile.numero || "");
  localStorage.setItem("pastor_complemento", profile.complemento || "");
  localStorage.setItem("pastor_bairro", profile.bairro || "");
  localStorage.setItem("pastor_cidade", profile.cidade || "");
  localStorage.setItem("pastor_uf", profile.uf || "");
};
