import { Bell, CalendarDays, EllipsisVertical, FileText, LogOut, TrendingUp, UserCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type ObreiroNotification = {
  id: string;
  title: string;
  body: string;
  ts: number;
};

type ObreiroStats = {
  total: number;
  aguardando: number;
  liberadas: number;
  automaticas: number;
  enviadas: number;
};

type ObreiroProfileSummary = {
  nome: string;
  status: string;
  status_carta: string;
  cargo_ministerial: string;
};

type ObreiroOverviewProps = {
  profile: ObreiroProfileSummary;
  churchName: string;
  pastorName: string;
  stats: ObreiroStats;
  blocked: boolean;
  notifications: ObreiroNotification[];
  onClearNotifications: () => void;
  onLogout: () => void;
  onOpenLetterDialog: () => void;
};

export function ObreiroOverview({
  profile,
  churchName,
  pastorName,
  stats,
  blocked,
  notifications,
  onClearNotifications,
  onLogout,
  onOpenLetterDialog,
}: ObreiroOverviewProps) {
  return (
    <>
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground sm:text-xl">Area do Obreiro</h1>
              <p className="text-xs text-muted-foreground">Dashboard, cartas e cadastro</p>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-9 p-0 sm:hidden">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onOpenLetterDialog} disabled={blocked}>
                  <FileText className="mr-2 h-3.5 w-3.5" /> Nova carta
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Sair
                </DropdownMenuItem>
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
                <DropdownMenuLabel>Notificacoes</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem className="text-muted-foreground">Sem notificacoes</DropdownMenuItem>
                ) : (
                  notifications.slice(0, 8).map((item) => (
                    <DropdownMenuItem key={item.id} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-semibold">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.body}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearNotifications} className="text-xs text-rose-700">
                  Limpar notificacoes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" onClick={onLogout} className="hidden gap-1 sm:inline-flex">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <Card className={blocked ? "border-rose-300 bg-rose-50 shadow-sm" : "border-emerald-300 bg-emerald-50 shadow-sm"}>
        <CardHeader>
          <CardTitle className="text-xl">{profile.nome || "Obreiro"}</CardTitle>
          <CardDescription>
            Igreja: {churchName || "-"} | Pastor: {pastorName || "-"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={blocked ? "border-rose-300 bg-rose-100 text-rose-700" : "border-emerald-300 bg-emerald-100 text-emerald-700"}>
              {profile.status || "AUTORIZADO"}
            </Badge>
            {profile.cargo_ministerial && (
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                {profile.cargo_ministerial}
              </Badge>
            )}
            {String(profile.status_carta || "").trim().toUpperCase() === "LIBERADA" && (
              <Badge variant="outline" className="border-sky-300 bg-sky-100 text-sky-700">
                Liberacao automatica
              </Badge>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>Total de cartas: <strong>{stats.total}</strong></div>
            <div>Aguardando: <strong>{stats.aguardando}</strong></div>
            <div>Liberadas: <strong>{stats.liberadas + stats.automaticas}</strong></div>
            <div>Enviadas: <strong>{stats.enviadas}</strong></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="hidden bg-emerald-600 text-white hover:bg-emerald-700 sm:inline-flex" onClick={onOpenLetterDialog} disabled={blocked}>
              Nova carta
            </Button>
            {blocked && <span className="text-sm text-rose-700">Seu acesso esta bloqueado. Procure o pastor.</span>}
            {!blocked && !profile.cargo_ministerial.trim() && (
              <span className="text-sm text-amber-700">Preencha seu cargo ministerial no cadastro para gerar carta.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[
          { label: "Cartas", value: stats.total, icon: FileText, cls: "metric-card-1" },
          { label: "Aguardando", value: stats.aguardando, icon: CalendarDays, cls: "metric-card-2" },
          { label: "Liberacao automatica", value: stats.automaticas, icon: TrendingUp, cls: "metric-card-3" },
          { label: "Cadastro", value: profile.nome ? 1 : 0, icon: UserCircle2, cls: "metric-card-4" },
        ].map((item) => (
          <div key={item.label} className={`${item.cls} rounded-lg p-4 shadow-sm`}>
            <div className="mb-1 flex items-center gap-2 opacity-90">
              <item.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <p className="text-2xl font-display font-bold">{item.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
