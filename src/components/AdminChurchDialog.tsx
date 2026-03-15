import { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ChurchFormState = {
  totvs_id: string;
  church_name: string;
  class: "estadual" | "setorial" | "central" | "regional" | "local";
  parent_totvs_id: string;
  contact_email: string;
  contact_phone: string;
  address_city: string;
  address_state: string;
  is_active: boolean;
};

type AdminChurchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchForm: ChurchFormState;
  setChurchForm: Dispatch<SetStateAction<ChurchFormState>>;
  saving: boolean;
  onSave: () => void;
};

export function AdminChurchDialog({
  open,
  onOpenChange,
  churchForm,
  setChurchForm,
  saving,
  onSave,
}: AdminChurchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>Cadastrar igreja</DialogTitle>
          <DialogDescription>
            Aqui a gente grava a igreja na hierarquia nova. O parent TOTVS define em qual nível ela entra.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>TOTVS</Label>
            <Input value={churchForm.totvs_id} onChange={(e) => setChurchForm((prev) => ({ ...prev, totvs_id: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Nome da igreja</Label>
            <Input value={churchForm.church_name} onChange={(e) => setChurchForm((prev) => ({ ...prev, church_name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Classe</Label>
            <Select value={churchForm.class} onValueChange={(value: ChurchFormState["class"]) => setChurchForm((prev) => ({ ...prev, class: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a classe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estadual">Estadual</SelectItem>
                <SelectItem value="setorial">Setorial</SelectItem>
                <SelectItem value="central">Central</SelectItem>
                <SelectItem value="regional">Regional</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Parent TOTVS</Label>
            <Input value={churchForm.parent_totvs_id} onChange={(e) => setChurchForm((prev) => ({ ...prev, parent_totvs_id: e.target.value }))} disabled={churchForm.class === "estadual"} />
          </div>
          <div className="space-y-2">
            <Label>Email de contato</Label>
            <Input value={churchForm.contact_email} onChange={(e) => setChurchForm((prev) => ({ ...prev, contact_email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Telefone de contato</Label>
            <Input value={churchForm.contact_phone} onChange={(e) => setChurchForm((prev) => ({ ...prev, contact_phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={churchForm.address_city} onChange={(e) => setChurchForm((prev) => ({ ...prev, address_city: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>UF</Label>
            <Input value={churchForm.address_state} onChange={(e) => setChurchForm((prev) => ({ ...prev, address_state: e.target.value }))} maxLength={2} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={churchForm.is_active ? "ativo" : "inativo"} onValueChange={(value) => setChurchForm((prev) => ({ ...prev, is_active: value === "ativo" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativa</SelectItem>
                <SelectItem value="inativo">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Salvando..." : "Salvar igreja"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
