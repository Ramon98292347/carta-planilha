import { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type UserFormState = {
  cpf: string;
  full_name: string;
  role: "pastor" | "obreiro";
  default_totvs_id: string;
  phone: string;
  email: string;
  minister_role: string;
  password: string;
  birth_date: string;
  sacramental_date: string;
  is_active: boolean;
  can_create_released_letter: boolean;
};

type AdminUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userForm: UserFormState;
  setUserForm: Dispatch<SetStateAction<UserFormState>>;
  ministerialOptions: readonly string[];
  sacramentalDateLabel: string;
  userRole: string;
  saving: boolean;
  onSave: () => void;
};

export function AdminUserDialog({
  open,
  onOpenChange,
  userForm,
  setUserForm,
  ministerialOptions,
  sacramentalDateLabel,
  userRole,
  saving,
  onSave,
}: AdminUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar usuário</DialogTitle>
          <DialogDescription>
            O role define acesso. O cargo ministerial fica no campo separado para manter a regra do sistema limpa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>CPF</Label>
            <Input value={userForm.cpf} onChange={(e) => setUserForm((prev) => ({ ...prev, cpf: e.target.value }))} placeholder="00000000000" />
          </div>
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={userForm.full_name} onChange={(e) => setUserForm((prev) => ({ ...prev, full_name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={userForm.phone} onChange={(e) => setUserForm((prev) => ({ ...prev, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Cargo ministerial</Label>
            <Select value={userForm.minister_role} onValueChange={(value) => setUserForm((prev) => ({ ...prev, minister_role: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cargo" />
              </SelectTrigger>
              <SelectContent>
                {ministerialOptions.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Senha inicial</Label>
            <Input type="password" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Data de nascimento</Label>
            <Input type="date" value={userForm.birth_date} onChange={(e) => setUserForm((prev) => ({ ...prev, birth_date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{sacramentalDateLabel}</Label>
            <Input type="date" value={userForm.sacramental_date} onChange={(e) => setUserForm((prev) => ({ ...prev, sacramental_date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>TOTVS da igreja</Label>
            <Input value={userForm.default_totvs_id} onChange={(e) => setUserForm((prev) => ({ ...prev, default_totvs_id: e.target.value }))} />
          </div>
          {userRole === "admin" && (
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={userForm.role} onValueChange={(value: "pastor" | "obreiro") => setUserForm((prev) => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="obreiro">Obreiro</SelectItem>
                  <SelectItem value="pastor">Pastor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Status inicial</Label>
            <Select value={userForm.is_active ? "ativo" : "inativo"} onValueChange={(value) => setUserForm((prev) => ({ ...prev, is_active: value === "ativo" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Liberacao automatica</Label>
            <Select
              value={userForm.can_create_released_letter ? "on" : "off"}
              onValueChange={(value) => setUserForm((prev) => ({ ...prev, can_create_released_letter: value === "on" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a liberacao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">OFF</SelectItem>
                <SelectItem value="on">ON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar usuário"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
