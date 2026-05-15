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
  LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  const [view, setView] = useState<"list" | "map">("list");
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

      // Fetch active session to know current block/street
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
        p.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.street_name?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      
      const matchesBlock = blockFilter === "all" || p.block_number === blockFilter;
      
      return matchesSearch && matchesBlock;
    });
  }, [properties, searchTerm, blockFilter]);

  const uniqueBlocks = useMemo(() => {
    const blocks = new Set(properties.map(p => p.block_number).filter(Boolean));
    return Array.from(blocks).sort();
  }, [properties]);

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
      blockProgress: currentBlockProps.length > 0 ? Math.min(100, Math.round((currentBlockProps.length / 50) * 100)) : 0 // Mock 50 as target
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
    <div className="flex flex-col gap-4 animate-in fade-in duration-700 pb-24">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary uppercase">RG — Registro Geográfico</h2>
        <p className="text-muted-foreground font-medium">Gestão territorial e cadastro de imóveis</p>
      </div>

      {/* Stats and Controls */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-none shadow-lg bg-white rounded-[2rem]">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Imóveis</span>
            <span className="text-3xl font-black text-slate-800">{properties.length}</span>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button 
            className="flex-1 rounded-[2rem] bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 font-black gap-2 h-auto py-3 active:scale-95 transition-all"
            onClick={() => {
              setEditingProperty(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="h-5 w-5" /> Adicionar
          </Button>
          <div className="flex gap-2 h-12">
            <Button 
              variant={view === "list" ? "default" : "secondary"} 
              size="icon" 
              onClick={() => setView("list")}
              className="flex-1 rounded-2xl active:scale-95 transition-all"
            >
              <List className="h-5 w-5" />
            </Button>
            <Button 
              variant={view === "map" ? "default" : "secondary"} 
              size="icon" 
              onClick={() => setView("map")}
              className="flex-1 rounded-2xl active:scale-95 transition-all"
            >
              <MapIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative group">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Buscar por número ou rua..." 
            className="pl-12 h-12 rounded-2xl border-none bg-white shadow-lg text-sm font-bold focus-visible:ring-primary/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <Badge 
            variant={blockFilter === "all" ? "default" : "secondary"}
            className="rounded-full px-4 py-1.5 cursor-pointer whitespace-nowrap font-bold border-none"
            onClick={() => setBlockFilter("all")}
          >
            Todos Quarteirões
          </Badge>
          {uniqueBlocks.map(block => (
            <Badge 
              key={block}
              variant={blockFilter === block ? "default" : "secondary"}
              className="rounded-full px-4 py-1.5 cursor-pointer whitespace-nowrap font-bold border-none"
              onClick={() => setBlockFilter(block!)}
            >
              Q-{block}
            </Badge>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {view === "list" ? (
          <div className="grid grid-cols-1 gap-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Carregando imóveis...</p>
              </div>
            ) : filteredProperties.length > 0 ? (
              filteredProperties.map(property => (
                <PropertyCard 
                  key={property.id} 
                  property={property} 
                  onEdit={() => handleEdit(property)}
                  onDelete={() => handleDelete(property.id)}
                />
              ))
            ) : (
              <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Nenhum imóvel encontrado</h3>
                <p className="text-sm text-slate-500">Tente ajustar sua busca ou filtros</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative h-[60vh] rounded-[2.5rem] overflow-hidden shadow-2xl bg-slate-100 border-4 border-white">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=1000')] bg-cover bg-center opacity-40 mix-blend-overlay" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2rem] shadow-2xl border border-white text-center max-w-[80%]">
                <MapPin className="h-10 w-10 text-primary mx-auto mb-3" />
                <h3 className="text-lg font-black uppercase tracking-tight mb-1">Visualização de Mapa</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                  Mostrando {filteredProperties.length} imóveis distribuídos no território
                </p>
              </div>
            </div>
            
            {/* Mock markers based on data */}
            {filteredProperties.slice(0, 10).map((p, i) => (
              <div 
                key={p.id}
                className="absolute"
                style={{ 
                  left: `${20 + (i * 15) % 60}%`, 
                  top: `${20 + (i * 20) % 60}%` 
                }}
              >
                <div className={cn(
                  "h-4 w-4 rounded-full border-2 border-white shadow-xl animate-bounce",
                  p.status === 'active' ? 'bg-emerald-500' : p.status === 'pending' ? 'bg-yellow-500' : 'bg-slate-400'
                )} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Property Form Drawer */}
      <Drawer open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DrawerContent className="rounded-t-[3rem] h-[95vh]">
          <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full mt-3 mb-2" />
          <DrawerHeader className="px-6">
            <DrawerTitle className="text-2xl font-black uppercase tracking-tighter text-slate-800">
              {editingProperty ? "Editar Imóvel" : "Adicionar Imóvel"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-6 pb-24">
            <PropertyForm 
              initialData={editingProperty} 
              onSave={handleSaveProperty} 
              onCancel={() => setIsFormOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function PropertyCard({ property, onEdit, onDelete }: { property: Property, onEdit: () => void, onDelete: () => void }) {
  const typeIcons: any = {
    residence: Home,
    commerce: Building,
    vacant_lot: TreePine,
    strategic_point: Flag,
    others: HelpCircle
  };
  
  const typeLabels: any = {
    residence: "Residência",
    commerce: "Comércio",
    vacant_lot: "T. Baldio",
    strategic_point: "P. Estratégico",
    others: "Outro"
  };

  const Icon = typeIcons[property.type] || HelpCircle;

  return (
    <Card className="border-none shadow-md bg-white rounded-[2rem] overflow-hidden group hover:shadow-xl transition-all duration-300 border border-slate-50">
      <CardContent className="p-0">
        <div className="flex items-center p-4 gap-4">
          <div className={cn(
            "h-14 w-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg",
            property.status === 'active' ? 'bg-emerald-500' : property.status === 'pending' ? 'bg-yellow-500' : 'bg-slate-400'
          )}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h4 className="text-lg font-black tracking-tight text-slate-800 truncate">
                Nº {property.number} {property.complement ? `- ${property.complement}` : ""}
              </h4>
              <Badge variant={property.status === 'active' ? 'default' : property.status === 'pending' ? 'secondary' : 'outline'} className="text-[8px] font-black uppercase px-2 py-0 h-4 border-none">
                {property.status === 'active' ? 'Ativo' : property.status === 'pending' ? 'Pendente' : 'Desativado'}
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest truncate">
              {property.street_name || "Rua não informada"} • Q-{property.block_number || "--"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">
                {typeLabels[property.type]}
              </span>
              {property.is_abandoned && (
                <Badge variant="destructive" className="text-[8px] px-1 h-3 font-bold uppercase tracking-tighter">Abandonado</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-100 text-slate-400" onClick={onEdit}>
              <Edit className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-red-50 text-red-400" onClick={onDelete}>
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PropertyForm({ initialData, onSave, onCancel }: { initialData: Property | null, onSave: (p: Property) => void, onCancel: () => void }) {
  const [formData, setFormData] = useState<Partial<Property>>(initialData || {
    number: "",
    complement: "",
    type: "residence",
    street_name: "",
    neighborhood: "",
    block_number: "",
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

  const handleCaptureGPS = () => {
    setIsCapturing(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData({
            ...formData,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setIsCapturing(false);
          toast.success("Coordenadas capturadas!");
        },
        (error) => {
          setIsCapturing(false);
          toast.error("Erro ao capturar localização: " + error.message);
        }
      );
    } else {
      setIsCapturing(false);
      toast.error("Geolocalização não suportada");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number) {
      toast.error("O número do imóvel é obrigatório");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const propertyToSave = {
        number: formData.number!,
        complement: formData.complement || null,
        type: formData.type || "residence",
        street_name: formData.street_name || null,
        neighborhood: formData.neighborhood || null,
        block_number: formData.block_number || null,
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
      toast.success(initialData ? "Imóvel atualizado!" : "Imóvel cadastrado!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identificação Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <Home className="h-5 w-5 text-primary" />
          <h3 className="font-black uppercase tracking-tight text-slate-800">Identificação</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Número</Label>
            <Input 
              value={formData.number} 
              onChange={(e) => setFormData({...formData, number: e.target.value})}
              placeholder="Ex: 142"
              className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Complemento</Label>
            <Input 
              value={formData.complement || ""} 
              onChange={(e) => setFormData({...formData, complement: e.target.value})}
              placeholder="Ex: Fundos"
              className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tipo de Imóvel</Label>
          <Select 
            value={formData.type} 
            onValueChange={(val: any) => setFormData({...formData, type: val})}
          >
            <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="residence">Residência</SelectItem>
              <SelectItem value="commerce">Comércio</SelectItem>
              <SelectItem value="vacant_lot">Terreno Baldio</SelectItem>
              <SelectItem value="strategic_point">Ponto Estratégico</SelectItem>
              <SelectItem value="others">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Localização Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-black uppercase tracking-tight text-slate-800">Localização</h3>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Rua</Label>
          <Input 
            value={formData.street_name || ""} 
            onChange={(e) => setFormData({...formData, street_name: e.target.value})}
            placeholder="Ex: Rua das Palmeiras"
            className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Bairro</Label>
            <Input 
              value={formData.neighborhood || ""} 
              onChange={(e) => setFormData({...formData, neighborhood: e.target.value})}
              placeholder="Ex: Centro"
              className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Quarteirão</Label>
            <Input 
              value={formData.block_number || ""} 
              onChange={(e) => setFormData({...formData, block_number: e.target.value})}
              placeholder="Ex: 042"
              className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Referência</Label>
          <Input 
            value={formData.reference || ""} 
            onChange={(e) => setFormData({...formData, reference: e.target.value})}
            placeholder="Ex: Próximo ao mercado"
            className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
          />
        </div>

        <div className="space-y-2 pt-2">
          <Button 
            type="button" 
            variant="outline" 
            className={cn(
              "w-full h-12 rounded-2xl font-black gap-2 transition-all active:scale-95",
              formData.latitude ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-slate-200"
            )}
            onClick={handleCaptureGPS}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Crosshair className="h-5 w-5" />
            )}
            {formData.latitude ? "Localização Capturada" : "Capturar Coordenadas GPS"}
          </Button>
          {formData.latitude && (
            <p className="text-[8px] font-bold text-center text-slate-400 uppercase tracking-widest">
              LAT: {formData.latitude.toFixed(6)} | LON: {formData.longitude?.toFixed(6)}
            </p>
          )}
        </div>
      </div>

      {/* Info Adicional Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <Plus className="h-5 w-5 text-primary" />
          <h3 className="font-black uppercase tracking-tight text-slate-800">Informações Adicionais</h3>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Quantidade de Depósitos</Label>
          <Input 
            type="number"
            value={formData.container_count ?? 0} 
            onChange={(e) => setFormData({...formData, container_count: parseInt(e.target.value) || 0})}
            className="rounded-2xl h-12 bg-slate-50 border-none shadow-inner font-bold"
          />
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem] shadow-inner">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">Imóvel Abandonado?</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Terreno ou casa sem morador</span>
            </div>
            <Switch 
              checked={formData.is_abandoned ?? false} 
              onCheckedChange={(val) => setFormData({...formData, is_abandoned: val})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem] shadow-inner">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">Fechado Frequentemente?</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Dificuldade de acesso recorrente</span>
            </div>
            <Switch 
              checked={formData.is_frequently_closed ?? false} 
              onCheckedChange={(val) => setFormData({...formData, is_frequently_closed: val})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem] shadow-inner">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">Possui Foco Anterior?</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Histórico de focos no local</span>
            </div>
            <Switch 
              checked={formData.had_previous_focus ?? false} 
              onCheckedChange={(val) => setFormData({...formData, had_previous_focus: val})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Observações</Label>
          <Textarea 
            value={formData.observations || ""} 
            onChange={(e) => setFormData({...formData, observations: e.target.value})}
            placeholder="Informações relevantes sobre o imóvel..."
            className="rounded-2xl bg-slate-50 border-none shadow-inner font-bold min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Status do Imóvel</Label>
          <Select 
            value={formData.status ?? "active"} 
            onValueChange={(val: any) => setFormData({...formData, status: val})}
          >
            <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none shadow-inner font-bold">
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="deactivated">Desativado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4">
        <Button 
          type="button" 
          variant="ghost" 
          className="h-16 rounded-[2rem] font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-all"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          className="h-16 rounded-[2rem] font-black uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all gap-2"
        >
          <Save className="h-6 w-6" /> Salvar
        </Button>
      </div>
    </form>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
