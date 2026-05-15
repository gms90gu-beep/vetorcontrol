import { createFileRoute } from "@tanstack/react-router";
import { 
  User, 
  MapPin, 
  Bell, 
  Shield, 
  Database, 
  Smartphone, 
  ChevronRight,
  LogOut,
  Info,
  Clock,
  Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Configurações</h2>
        <p className="text-muted-foreground font-medium">Perfil, sistema e sincronização</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Perfil do Agente</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary relative shadow-inner">
                <User className="h-10 w-10" />
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-500 border-4 border-background flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col">
                <h4 className="text-xl font-black tracking-tight">João Silva</h4>
                <p className="text-sm font-medium text-muted-foreground">ID: #42098 - Agente de Endemias</p>
                <div className="flex gap-2 mt-2">
                  <Badge className="bg-primary/10 text-primary border-none rounded-lg text-[10px] font-bold">Equipe A</Badge>
                  <Badge className="bg-blue-100 text-blue-700 border-none rounded-lg text-[10px] font-bold tracking-wider uppercase">Setor 04</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Preferências do Sistema</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-2">
            <SettingsItem icon={Globe} label="Modo Offline" description="Salvar dados localmente quando sem rede" hasSwitch defaultChecked />
            <Separator className="bg-accent/50 mx-4" />
            <SettingsItem icon={Bell} label="Notificações" description="Alertas de pendências e novos ciclos" hasSwitch defaultChecked />
            <Separator className="bg-accent/50 mx-4" />
            <SettingsItem icon={MapPin} label="Localização GPS" description="Alta precisão para registro de imóveis" hasSwitch defaultChecked />
            <Separator className="bg-accent/50 mx-4" />
            <SettingsItem icon={Smartphone} label="Sincronização Automática" description="Enviar dados ao retomar conexão" hasSwitch defaultChecked />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Banco de Dados e Cache</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-2">
            <SettingsItem icon={Database} label="Limpar Cache Local" description="Remove histórico de visitas offline" isAction />
            <Separator className="bg-accent/50 mx-4" />
            <SettingsItem icon={Clock} label="Histórico do Ciclo" description="Ver visitas de ciclos anteriores" isAction />
            <Separator className="bg-accent/50 mx-4" />
            <SettingsItem icon={Shield} label="Segurança" description="Configurar biometria e senha" isAction />
          </CardContent>
        </Card>
      </section>

      <div className="pt-4 px-2">
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-8">
          <Info className="h-4 w-4" />
          <span className="text-xs font-bold tracking-wider uppercase">Versão 1.2.4 (Prod)</span>
        </div>
      </div>
    </div>
  );
}

function SettingsItem({ icon: Icon, label, description, hasSwitch, defaultChecked, isAction }: any) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-accent/30 transition-colors cursor-pointer rounded-2xl group">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-accent/50 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-tight">{label}</span>
          <span className="text-xs font-medium text-muted-foreground">{description}</span>
        </div>
      </div>
      {hasSwitch ? (
        <Switch defaultChecked={defaultChecked} />
      ) : isAction ? (
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      ) : null}
    </div>
  );
}
