import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { onlyDigits } from "@/lib/cep";

type PastorProfileState = {
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

type PastorProfileCardProps = {
  profile: PastorProfileState;
  ministerialOptions: readonly string[];
  lookingUpCep: boolean;
  saving: boolean;
  onChange: (field: keyof PastorProfileState, value: string) => void;
  onCepChange: (value: string) => void;
  onSave: () => void;
};

export function PastorProfileCard({
  profile,
  ministerialOptions,
  lookingUpCep,
  saving,
  onChange,
  onCepChange,
  onSave,
}: PastorProfileCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meu cadastro</CardTitle>
        <CardDescription>
          Atualize seus dados pessoais e ministeriais. Esse espaço fica disponível para o pastor editar o próprio cadastro, igual ao obreiro.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome completo</Label>
          <Input value={profile.nome} onChange={(e) => onChange("nome", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={profile.telefone} onChange={(e) => onChange("telefone", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} onChange={(e) => onChange("email", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Cargo ministerial</Label>
          <Select value={profile.cargo_ministerial} onValueChange={(value) => onChange("cargo_ministerial", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o cargo" />
            </SelectTrigger>
            <SelectContent>
              {ministerialOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Data de nascimento</Label>
          <Input type="date" value={profile.data_nascimento} onChange={(e) => onChange("data_nascimento", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Data da separação</Label>
          <Input type="date" value={profile.data_ordenacao} onChange={(e) => onChange("data_ordenacao", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>CEP</Label>
          <Input value={profile.cep} onChange={(e) => onCepChange(e.target.value)} placeholder="00000-000" />
          {lookingUpCep && <p className="text-xs text-muted-foreground">Buscando CEP...</p>}
          {!lookingUpCep && !profile.endereco && onlyDigits(profile.cep).length === 8 ? (
            <p className="text-xs text-muted-foreground">Se o CEP nao localizar, preencha o endereco manualmente abaixo.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Endereço</Label>
          <Input value={profile.endereco} onChange={(e) => onChange("endereco", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Número</Label>
          <Input value={profile.numero} onChange={(e) => onChange("numero", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Complemento</Label>
          <Input value={profile.complemento} onChange={(e) => onChange("complemento", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Bairro</Label>
          <Input value={profile.bairro} onChange={(e) => onChange("bairro", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Cidade</Label>
          <Input value={profile.cidade} onChange={(e) => onChange("cidade", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>UF</Label>
          <Input value={profile.uf} onChange={(e) => onChange("uf", e.target.value.toUpperCase())} maxLength={2} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={onSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar cadastro"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
