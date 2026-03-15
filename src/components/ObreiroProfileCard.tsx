import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ObreiroProfile = {
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

type ObreiroProfileCardProps = {
  profile: ObreiroProfile;
  ministerialOptions: readonly string[];
  lookingUpCep: boolean;
  saving: boolean;
  onChange: (field: keyof ObreiroProfile, value: string) => void;
  onSave: () => void;
};

export function ObreiroProfileCard({
  profile,
  ministerialOptions,
  lookingUpCep,
  saving,
  onChange,
  onSave,
}: ObreiroProfileCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Meu cadastro</CardTitle>
        <CardDescription>Atualize seus dados. O telefone continua sendo sua identificacao de acesso.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" value={profile.nome} onChange={(e) => onChange("nome", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" value={profile.telefone} onChange={(e) => onChange("telefone", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile.email} onChange={(e) => onChange("email", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="data_nascimento">Data de nascimento</Label>
          <Input id="data_nascimento" type="date" value={profile.data_nascimento} onChange={(e) => onChange("data_nascimento", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="data_ordenacao">Data da ordenacao</Label>
          <Input id="data_ordenacao" type="date" value={profile.data_ordenacao} onChange={(e) => onChange("data_ordenacao", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cargo_ministerial">Cargo ministerial</Label>
          <Select value={profile.cargo_ministerial} onValueChange={(value) => onChange("cargo_ministerial", value)}>
            <SelectTrigger id="cargo_ministerial">
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
          <Label htmlFor="cep">CEP</Label>
          <Input id="cep" value={profile.cep} onChange={(e) => onChange("cep", e.target.value)} placeholder="00000-000" />
          {lookingUpCep && <p className="text-xs text-muted-foreground">Buscando endereco pelo CEP...</p>}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="endereco">Endereco</Label>
          <Input id="endereco" value={profile.endereco} onChange={(e) => onChange("endereco", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero">Numero</Label>
          <Input id="numero" value={profile.numero} onChange={(e) => onChange("numero", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="complemento">Complemento</Label>
          <Input id="complemento" value={profile.complemento} onChange={(e) => onChange("complemento", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bairro">Bairro</Label>
          <Input id="bairro" value={profile.bairro} onChange={(e) => onChange("bairro", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" value={profile.cidade} onChange={(e) => onChange("cidade", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uf">UF</Label>
          <Input id="uf" value={profile.uf} onChange={(e) => onChange("uf", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button type="button" onClick={onSave} disabled={saving} className="gap-1 bg-sky-600 text-white hover:bg-sky-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar cadastro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
