import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Search, 
  MapPin, 
  Navigation, 
  ChevronRight, 
  Home,
  Building,
  TreePine,
  Flag,
  HelpCircle,
  ClipboardList,
  FileText,
  Target,
  LayoutDashboard,
  Save,
  Crosshair,
  History as HistoryIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { OperationalHeader } from "@/components/OperationalHeader";
import { RGDigitalBulletinTable } from "@/components/RGDigitalBulletinTable";

export const Route = createFileRoute("/_authenticated/rg")({
  component: RGPage,
});

type Property = {
  id: string;
  number: string;
  complement: string | null;
  type: "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";
  street_name: string | null;
  neighborhood: string | null;
  block_number: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  container_count: number | null;
  observations: string | null;
  is_abandoned: boolean | null;
  is_frequently_closed: boolean | null;
  had_previous_focus: boolean | null;
  status: "active" | "pending" | "deactivated" | null;
  user_id: string | null;
  block_id?: string | null;
  street_id?: string | null;
};

function RGPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: session } = await supabase
        .from("field_work_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (session) {
        setActiveSession(session);
        setBlockFilter(session.block_number || "all");
      }

      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("street_name", { ascending: true })
        .order("number", { ascending: true });

      if (error) throw error;
      setProperties(data as Property[]);
    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredProperties = useMemo(() => {
    return properties.filter(p => {
      const matchesSearch = 
        (p.number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.street_name?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      
      const matchesBlock = blockFilter === "all" || p.block_number === blockFilter;
      
      return matchesSearch && matchesBlock;
    });
  }, [properties, searchTerm, blockFilter]);

  const stats = useMemo(() => {
    const currentBlockProps = properties.filter(p => p.block_number === activeSession?.block_number);
    const residences = properties.filter(p => p.type === 'residence').length;
    const commerce = properties.filter(p => p.type === 'commerce').length;
    const lots = properties.filter(p => p.type === 'vacant_lot').length;
    const others = properties.filter(p => p.type === 'others' || p.type === 'strategic_point').length;
    
    return {
      total: properties.length,
      residences,
      commerce,
      lots,
      others,
      blockTotal: currentBlockProps.length,
      blockProgress: currentBlockProps.length > 0 ? Math.min(100, Math.round((currentBlockProps.length / 50) * 100)) : 0
    };
  }, [properties, activeSession]);

  const handlePropertyClick = (property: Property) => {
    setEditingProperty(property);
    setIsFormOpen(true);
  };

  const handleSaveProperty = (savedProperty: Property) => {
    if (editingProperty) {
      setProperties(properties.map(p => p.id === savedProperty.id ? savedProperty : p));
    } else {
      setProperties([savedProperty, ...properties]);
    }
    setIsFormOpen(false);
    setEditingProperty(null);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-[1.25rem] bg-slate-900 flex items-center justify-center shadow-xl">
            <ClipboardList className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Boletim RG</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {activeSession ? `Quarteirão ${activeSession.block_number} • ${activeSession.street_name}` : "Reconhecimento Geográfico"}
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={() => navigate({ to: '/field-work-list' })}
          className="rounded-2xl border-none bg-white shadow-md hover:shadow-lg transition-all font-black text-[10px] uppercase tracking-widest gap-2 h-12"
        >
          <Target className="h-4 w-4 text-emerald-500" />
          Continuar RG
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Target className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Quarteirão {activeSession?.block_number}</p>
                <h3 className="text-2xl font-black tracking-tighter">{stats.blockProgress}%</h3>
              </div>
              <p className="text-[10px] font-bold text-slate-400">{stats.blockTotal}/50</p>
            </div>
            <Progress value={stats.blockProgress} className="h-1.5 bg-white/10" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-emerald-600 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <LayoutDashboard className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200 mb-1">Total Cadastro</p>
                <h3 className="text-2xl font-black tracking-tighter">{stats.total}</h3>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="border-white/20 text-white font-black text-[8px]">{stats.residences} R</Badge>
                <Badge variant="outline" className="border-white/20 text-white font-black text-[8px]">{stats.commerce} C</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <Input 
              placeholder="Buscar imóvel..." 
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-lg text-base font-bold focus-visible:ring-emerald-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            className="h-14 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest gap-2"
            onClick={() => {
              setEditingProperty(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="h-5 w-5" /> Adicionar
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acessando Território...</p>
          </div>
        ) : (
          <RGDigitalBulletinTable 
            properties={filteredProperties} 
            onPropertyClick={handlePropertyClick}
          />
        )}
      </div>

      {/* Property Modal */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="bg-slate-900 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <HistoryIcon className="h-24 w-24" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tighter">
                {editingProperty ? `Imóvel ${editingProperty.number}` : "Novo Imóvel"}
              </DialogTitle>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
                {editingProperty ? "Atualizar Cadastro" : "Cadastro de Território"}
              </p>
            </DialogHeader>
          </div>
          
          <ScrollArea className="max-h-[60vh] p-6">
            <PropertyForm 
              initialData={editingProperty} 
              activeSession={activeSession}
              onSave={handleSaveProperty} 
              onCancel={() => setIsFormOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Operational Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 z-50 shadow-[0_-10px_40px_rgba(15,23,42,0.3)] md:rounded-t-[3rem] safe-area-bottom">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <div className="flex flex-col min-w-[60px]">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Cadastrados</span>
              <span className="text-sm font-black text-white">{stats.total}</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-4 min-w-[60px]">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Residências</span>
              <span className="text-sm font-black text-emerald-400">{stats.residences}</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-4 min-w-[60px]">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Comércios</span>
              <span className="text-sm font-black text-blue-400">{stats.commerce}</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-4 min-w-[60px]">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Terrenos</span>
              <span className="text-sm font-black text-amber-400">{stats.lots}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyForm({ initialData, activeSession, onSave, onCancel }: { initialData: Property | null, activeSession: any, onSave: (p: Property) => void, onCancel: () => void }) {
  const [formData, setFormData] = useState<Partial<Property>>(initialData || {
    number: "",
    complement: "",
    type: "residence",
    street_name: activeSession?.street_name || "",
    neighborhood: "",
    block_number: activeSession?.block_number || "",
    reference: "",
    latitude: null,
    longitude: null,
    container_count: 0,
    observations: "",
    is_abandoned: false,
    is_frequently_closed: false,
    had_previous_focus: false,
    status: "active"
  });

  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (!initialData) {
      handleCaptureGPS();
    }
  }, []);

  const handleCaptureGPS = () => {
    setIsCapturing(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }));
          setIsCapturing(false);
          toast.success("GPS capturado automaticamente");
        },
        (error) => {
          setIsCapturing(false);
          toast.error("Erro GPS: " + error.message);
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number) {
      toast.error("Número obrigatório");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const propertyToSave = {
        number: formData.number!,
        complement: formData.complement || null,
        type: formData.type || "residence",
        street_name: formData.street_name || activeSession?.street_name || null,
        neighborhood: formData.neighborhood || null,
        block_number: formData.block_number || activeSession?.block_number || null,
        reference: formData.reference || null,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        container_count: formData.container_count || 0,
        observations: formData.observations || null,
        is_abandoned: formData.is_abandoned ?? false,
        is_frequently_closed: formData.is_frequently_closed ?? false,
        had_previous_focus: formData.had_previous_focus ?? false,
        status: formData.status || "active",
        user_id: user.id,
        id: initialData?.id || undefined
      };

      const { data, error } = await supabase
        .from("properties")
        .upsert(propertyToSave)
        .select()
        .single();

      if (error) throw error;
      
      onSave(data as Property);
      toast.success(initialData ? "Atualizado!" : "Cadastrado!");
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Número</Label>
          <Input 
            value={formData.number} 
            onChange={(e) => setFormData({...formData, number: e.target.value})}
            placeholder="Ex: 123"
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Complemento</Label>
          <Input 
            value={formData.complement || ""} 
            onChange={(e) => setFormData({...formData, complement: e.target.value})}
            placeholder="Ex: Fundos"
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de Imóvel</Label>
        <Select 
          value={formData.type} 
          onValueChange={(val: any) => setFormData({...formData, type: val})}
        >
          <SelectTrigger className="rounded-xl border-slate-100 bg-slate-50 font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-none shadow-2xl">
            <SelectItem value="residence" className="rounded-xl font-bold">Residência</SelectItem>
            <SelectItem value="commerce" className="rounded-xl font-bold">Comércio</SelectItem>
            <SelectItem value="vacant_lot" className="rounded-xl font-bold">Terreno Baldio</SelectItem>
            <SelectItem value="strategic_point" className="rounded-xl font-bold">Ponto Estratégico</SelectItem>
            <SelectItem value="others" className="rounded-xl font-bold">Outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quarteirão</Label>
          <Input 
            value={formData.block_number || ""} 
            onChange={(e) => setFormData({...formData, block_number: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rua/Logradouro</Label>
          <Input 
            value={formData.street_name || ""} 
            onChange={(e) => setFormData({...formData, street_name: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
            formData.latitude ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"
          )}>
            <Navigation className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Coordenadas GPS</span>
            <span className="text-xs font-bold text-slate-800">
              {formData.latitude ? `${formData.latitude.toFixed(4)}, ${formData.longitude?.toFixed(4)}` : "Não capturado"}
            </span>
          </div>
        </div>
        <Button 
          type="button"
          variant="ghost" 
          size="icon" 
          onClick={handleCaptureGPS}
          disabled={isCapturing}
          className="rounded-xl text-blue-500 hover:bg-blue-50"
        >
          <Crosshair className={cn("h-5 w-5", isCapturing && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800">Imóvel Abandonado?</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Sem moradores ou fechado</span>
          </div>
          <Switch 
            checked={formData.is_abandoned || false} 
            onCheckedChange={(val) => setFormData({...formData, is_abandoned: val})}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800">Fechado Frequentemente?</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Dificuldade de acesso</span>
          </div>
          <Switch 
            checked={formData.is_frequently_closed || false} 
            onCheckedChange={(val) => setFormData({...formData, is_frequently_closed: val})}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Observações</Label>
        <Textarea 
          value={formData.observations || ""} 
          onChange={(e) => setFormData({...formData, observations: e.target.value})}
          placeholder="Ex: Cão bravo, portão lateral..."
          className="rounded-xl border-slate-100 bg-slate-50 font-bold min-h-[80px]"
        />
      </div>

      <Button type="submit" className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all gap-2">
        <Save className="h-5 w-5" />
        {initialData ? "Salvar Alterações" : "Concluir Cadastro"}
      </Button>
    </form>
  );
}
