import { AlertCircle, Bell, Building2, CheckCircle2, Download, EllipsisVertical, FileText, LogOut, Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type NotificationItem = {
  id: string;
  title: string;
  body?: string;
};

type ManagementHeaderProps = {
  churchName: string;
  userName: string;
  userRole: string;
  connectedHeader: boolean;
  installPromptAvailable: boolean;
  notifications: NotificationItem[];
  onInstall: () => void;
  onOpenUserDialog: () => void;
  onOpenChurchDialog: () => void;
  onOpenMyLetter: () => void;
  onOpenDivulgacao: () => void;
  onClearNotifications: () => void;
  onLogout: () => void;
};

export function ManagementHeader({
  churchName,
  userName,
  userRole,
  connectedHeader,
  installPromptAvailable,
  notifications,
  onInstall,
  onOpenUserDialog,
  onOpenChurchDialog,
  onOpenMyLetter,
  onOpenDivulgacao,
  onClearNotifications,
  onLogout,
}: ManagementHeaderProps) {
  return (
    <header className="border-b bg-card shadow-sm">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Painel de Gestão</h1>
            <p className="text-xs text-muted-foreground">Cartas, obreiros e notificações do banco novo</p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          <div className="flex items-center gap-2 sm:order-2 sm:ml-auto">
            <div className="rounded-md border px-2 py-1 text-xs text-muted-foreground" title={connectedHeader ? "Conectado" : "Sessão incompleta"}>
              <div>Igreja: {churchName || "—"}</div>
              <div>Usuário: {userName || "—"}</div>
            </div>
            <div className="flex h-full items-center" title={connectedHeader ? "Conectado" : "Sessão incompleta"}>
              {connectedHeader ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-muted-foreground" />}
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:order-1 sm:flex">
            {installPromptAvailable && (
              <Button type="button" variant="outline" onClick={onInstall} className="gap-1">
                <Download className="h-4 w-4" /> Instalar app
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onOpenUserDialog} className="gap-1">
              <UserPlus className="h-4 w-4" /> Cadastrar usuário
            </Button>
            <Button type="button" variant="outline" onClick={onOpenChurchDialog} className="gap-1">
              <Plus className="h-4 w-4" /> Cadastrar igreja
            </Button>
            {userRole === "pastor" && (
              <Button type="button" variant="outline" onClick={onOpenMyLetter} className="gap-1">
                <FileText className="h-4 w-4" /> Minha carta
              </Button>
            )}
            {userRole !== "obreiro" && (
              <Button type="button" variant="outline" onClick={onOpenDivulgacao}>
                Divulgacao
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onLogout} className="gap-1">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="relative h-10 w-10 p-0">
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem className="text-muted-foreground">Sem notificações</DropdownMenuItem>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-semibold">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.body || "Sem mensagem adicional"}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearNotifications} className="text-xs text-rose-700">
                  Marcar como lidas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-9 p-0">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {installPromptAvailable && (
                  <DropdownMenuItem onSelect={onInstall}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Instalar app
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={onOpenUserDialog}>
                  <UserPlus className="mr-2 h-3.5 w-3.5" /> Cadastrar usuário
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenChurchDialog}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Cadastrar igreja
                </DropdownMenuItem>
                {userRole === "pastor" && (
                  <DropdownMenuItem onSelect={onOpenMyLetter}>
                    <FileText className="mr-2 h-3.5 w-3.5" /> Minha carta
                  </DropdownMenuItem>
                )}
                {userRole !== "obreiro" && (
                  <DropdownMenuItem onSelect={onOpenDivulgacao}>
                    <Building2 className="mr-2 h-3.5 w-3.5" /> Divulgação
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="relative h-9 w-9 p-0">
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem className="text-muted-foreground">Sem notificações</DropdownMenuItem>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-semibold">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.body || "Sem mensagem adicional"}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearNotifications} className="text-xs text-rose-700">
                  Marcar como lidas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button type="button" variant="outline" onClick={onLogout} className="gap-1">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}


