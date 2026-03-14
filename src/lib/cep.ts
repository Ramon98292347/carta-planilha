export type CepLookupResult = {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

export const onlyDigits = (value: string) => String(value || "").replace(/\D/g, "");

export const formatCep = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export async function lookupCep(value: string): Promise<CepLookupResult | null> {
  const cep = onlyDigits(value);
  if (cep.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) throw new Error("Nao foi possivel consultar o CEP.");

  const payload = (await response.json().catch(() => null)) as
    | {
        erro?: boolean;
        cep?: string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      }
    | null;

  if (!payload || payload.erro) return null;

  return {
    cep: formatCep(payload.cep || cep),
    street: String(payload.logradouro || "").trim(),
    neighborhood: String(payload.bairro || "").trim(),
    city: String(payload.localidade || "").trim(),
    state: String(payload.uf || "").trim().toUpperCase(),
  };
}
