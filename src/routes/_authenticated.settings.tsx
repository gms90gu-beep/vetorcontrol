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
  Globe,
  Camera,
  Mail,
  Phone,
  Briefcase,
  Trophy,
  History,
  TrendingUp,
  AlertCircle,
  Hash
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { Calendar as CalendarLucide } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [agent, setAgent] = useState<any>(null);
  const { allowWeekend, toggleWeekendOperation, userRole } = useOperationalDate();
  const [stats, setStats] = useState({
    worked: 1240,
    foci: 42,
    pending: 15,
    productivity: 94
  });

  useEffect(() => {
    fetchAgentProfile();
  }, []);

  async function fetchAgentProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();
    
    if (data) setAgent(data);
  }

  const handleUpdateAgent = async (field: keyof any, value: string) => {
    try {
      setAgent((prev: any) => ({ ...prev, [field]: value }));
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("agents")
        .update({ [field]: value } as any)
        .eq("profile_id", user.id);

      if (error) throw error;
      toast.success("Informação atualizada");
    } catch (error: any) {
      toast.error("Erro ao atualizar: " + error.message);
    }
  };

  const handleUpdatePhoto = () => {
    toast.info("Acessando câmera...");
    // Future: implement actual camera/gallery picker
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      {/* Premium Profile Header */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Perfil Profissional</h3>
        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white to-slate-50">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center gap-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-blue-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-500" />
                <Avatar className="h-32 w-32 rounded-[2.5rem] border-4 border-white shadow-2xl relative">
                  <AvatarImage src={agent?.photo_url} alt={agent?.name} className="object-cover" />
                  <AvatarFallback className="bg-slate-100 text-slate-400 font-black text-3xl">
                    {agent?.name?.substring(0, 2).toUpperCase() || "AG"}
                  </AvatarFallback>
                </Avatar>
                <button 
                  onClick={handleUpdatePhoto}
                  className="absolute -bottom-2 -right-2 bg-primary text-white h-10 w-10 rounded-2xl shadow-lg border-4 border-white flex items-center justify-center hover:scale-110 active:scale-90 transition-all"
                >
                  <Camera className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-1">
                <h4 className="text-2xl font-black tracking-tight text-slate-900">{agent?.name || "Agente"}</h4>
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-black tracking-widest uppercase border-slate-200 text-slate-500">
                    {agent?.registration_id || "ACE-0000"}
                  </Badge>
                  <Badge className="bg-blue-600 text-white border-none rounded-lg text-[10px] font-black tracking-widest uppercase">
                    {agent?.team || "Equipe A"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 w-full gap-4 pt-4">
                <ProfileMiniStat icon={Trophy} label="Eficiência" value={`${stats.productivity}%`} color="text-emerald-500" />
                <ProfileMiniStat icon={Briefcase} label="Visitas" value={stats.worked} color="text-blue-500" />
                <ProfileMiniStat icon={AlertCircle} label="Focos" value={stats.foci} color="text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Operational Details */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Detalhes Operacionais</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-2">
            <SettingsInputItem 
              icon={MapPin} 
              label="Município" 
              value={agent?.municipality || ""} 
              onChange={(val: string) => handleUpdateAgent("municipality", val)}
              placeholder="Digite o município"
            />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsInputItem 
              icon={Phone} 
              label="Telefone" 
              value={agent?.phone || ""} 
              onChange={(val: string) => handleUpdateAgent("phone", val)}
              placeholder="Digite o telefone"
            />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsInputItem 
              icon={Hash} 
              label="Número do ACE" 
              value={agent?.registration_id || ""} 
              onChange={(val: string) => handleUpdateAgent("registration_id", val)}
              placeholder="Digite o número do ACE"
            />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsItem icon={History} label="Histórico Operacional" description="Ver registro de atividades passadas" isAction />
          </CardContent>
        </Card>
      </section>

      {/* System Preferences */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Preferências do Sistema</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-2">
            <SettingsItem icon={Globe} label="Modo Offline" description="Salvar dados localmente quando sem rede" hasSwitch defaultChecked />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsItem icon={Bell} label="Notificações" description="Alertas de pendências e novos ciclos" hasSwitch defaultChecked />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsItem icon={Smartphone} label="Sincronização Automática" description="Enviar dados ao retomar conexão" hasSwitch defaultChecked />
            
            {/* Weekend operation setting removed as it is now always enabled */}
          </CardContent>
        </Card>
      </section>

      {/* Security & Maintenance */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Segurança e Manutenção</h3>
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-2">
            <SettingsItem icon={Shield} label="Privacidade" description="Gerenciar acesso e biometria" isAction />
            <Separator className="bg-slate-50 mx-4" />
            <SettingsItem icon={Database} label="Limpar Dados Locais" description="Libera espaço no dispositivo" isAction />
          </CardContent>
        </Card>
      </section>

      <div className="pt-4 px-2">
        <Button 
          variant="outline" 
          className="w-full h-14 rounded-2xl border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600 font-black uppercase tracking-widest text-[10px]"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Encerrar Sessão
        </Button>
        <div className="flex items-center justify-center gap-2 text-slate-300 mt-8">
          <Info className="h-4 w-4" />
          <span className="text-[10px] font-black tracking-widest uppercase">Versão 2.1.0 (Build 2026)</span>
        </div>
      </div>
    </div>
  );
}

function ProfileMiniStat({ icon: Icon, label, value, color }: any) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("p-2 rounded-xl bg-slate-50", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-lg font-black tracking-tighter text-slate-900">{value}</span>
      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function SettingsItem({ icon: Icon, label, description, hasSwitch, defaultChecked, checked, onCheckedChange, isAction }: any) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer rounded-2xl group">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-tight text-slate-900">{label}</span>
          <span className="text-xs font-medium text-slate-500">{description}</span>
        </div>
      </div>
      {hasSwitch ? (
        <Switch 
          defaultChecked={defaultChecked} 
          checked={checked} 
          onCheckedChange={onCheckedChange} 
        />
      ) : isAction ? (
        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
      ) : null}
    </div>
  );
}

function SettingsInputItem({ icon: Icon, label, value, onChange, placeholder }: any) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors rounded-2xl group">
      <div className="flex items-center gap-4 flex-1">
        <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col flex-1 max-w-[200px] sm:max-w-none">
          <span className="font-bold text-sm tracking-tight text-slate-900">{label}</span>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 border-slate-200 focus:border-primary focus:ring-primary text-xs font-medium p-0 bg-transparent border-none shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}
