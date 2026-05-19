import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Search, 
  MapPin, 
  ChevronRight, 
  History as HistoryIcon,
  FileText,
  Target,
  Printer,
  Share2,
  Filter,
  Save,
  Trash2,
  LayoutDashboard,
  ClipboardList,
  ArrowLeft
} from "lucide-react";
import { generateRGPDF } from "@/lib/pdf-generator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOrientation } from "@/hooks/useOrientation";
import { RGBulletinHeader } from "@/components/rg/RGBulletinHeader";
import { RGBulletinTable, type Property } from "@/components/rg/RGBulletinTable";
import { RGBulletinFooter } from "@/components/rg/RGBulletinFooter";
import { RGQuickAddForm } from "@/components/rg/RGQuickAddForm";
import { RGImportByPhoto } from "@/components/rg/RGImportByPhoto";
import { RGPropertyForm } from "@/components/rg/RGPropertyForm";
import { RGBlockList, type Block } from "@/components/rg/RGBlockList";

export const Route = createFileRoute("/_authenticated/rg")({
  component: RGPage,
});

function RGPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [bulletinHeader, setBulletinHeader] = useState({
    uf: "CE",
    municipio: "",
    localidade: "",
    sublocal: "",
    distrito: "",
    categoria: "URBANA",
    quarteirao: "",
    sequencia: "01",
    lado: "01",
    agente: ""
  });

  const navigate = useNavigate();
  const isLandscape = useOrientation();

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: agentData } = await supabase.from("agents").select("*").eq("profile_id", user.id).maybeSingle();
      if (agentData) {
        setAgent(agentData);
        setBulletinHeader(prev => ({
          ...prev,
          municipio: agentData.municipality || "",
          agente: agentData.name || ""
        }));
      }

      const { data: blocksData } = await supabase
        .from("blocks")
        .select(`
          *,
          subareas (
            name
          )
        `)
        .order("number", { ascending: true });
      
      if (blocksData) {
        setBlocks(blocksData as Block[]);
      }

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
      }

      const { data: cycle } = await supabase.from("cycles").select("*").eq("status", "in_progress").maybeSingle();
      if (cycle) {
        setActiveCycle(cycle);
        const { data: week } = await supabase.from("weeks").select("*").eq("cycle_id", cycle.id).order("number", { ascending: true }).limit(1).maybeSingle();
        if (week) setActiveWeek(week);
      }

      await fetchProperties();
    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("sequence", { ascending: true })
      .order("street_name", { ascending: true })
      .order("number", { ascending: true });

    if (error) throw error;
    setProperties(data as Property[]);
  };

  const handleBlockSelect = (block: Block) => {
    setSelectedBlock(block);
    setBlockFilter(block.number);
    setBulletinHeader(prev => ({
      ...prev,
      quarteirao: block.number,
      localidade: block.subareas?.name || prev.localidade
    }));
    setCurrentStep(1);
  };

  const handleNewBlock = () => {
    setSelectedBlock({ id: 'new', number: '' } as Block);
    setBulletinHeader(prev => ({
      ...prev,
      quarteirao: '',
      localidade: ''
    }));
    setBlockFilter('all');
    setCurrentStep(1);
  };

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
    const residence = filteredProperties.filter(p => p.type === 'residence').length;
    const commerce = filteredProperties.filter(p => p.type === 'commerce').length;
    const vacant_lot = filteredProperties.filter(p => p.type === 'vacant_lot').length;
    const strategic_point = filteredProperties.filter(p => p.type === 'strategic_point').length;
    const others = filteredProperties.filter(p => p.type === 'others').length;
    const total = filteredProperties.length;
    const inhabitants = filteredProperties.reduce((sum, p) => sum + (p.inhabitants || 0), 0);
    
    return {
      residence,
      commerce,
      vacant_lot,
      strategic_point,
      others,
      total,
      inhabitants
    };
  }, [filteredProperties]);

  const handleHeaderChange = (field: string, value: string) => {
    setBulletinHeader(prev => ({ ...prev, [field]: value }));
    if (field === 'quarteirao' && value) {
      setBlockFilter(value);
    }
  };

  const handleQuickAdd = async (data: any) => {
    try {
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const propertyToSave = {
        ...data,
        block_number: bulletinHeader.quarteirao,
        user_id: user.id,
        status: "active"
      };

      const { data: saved, error } = await supabase
        .from("properties")
        .insert(propertyToSave)
        .select()
        .single();

      if (error) throw error;
      
      setProperties(prev => [...prev, saved as Property]);
      toast.success("Imóvel adicionado com sucesso!", {
        description: `Seq: ${saved.sequence} - Nº ${saved.number}`,
        duration: 2000,
      });
    } catch (error: any) {
      toast.error("Erro ao adicionar: " + error.message);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    try {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
      setProperties(prev => prev.filter(p => p.id !== id));
      toast.success("Imóvel removido");
    } catch (error: any) {
      toast.error("Erro ao remover: " + error.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.loading("Gerando boletim oficial...");
      
      const agentInfo = {
        municipality: bulletinHeader.municipio,
        name: bulletinHeader.agente,
        registrationId: agent?.registration_id || "MAT-0000",
        cycle: activeCycle?.number || "01/26",
        week: activeWeek?.number?.toString() || "1",
        block: bulletinHeader.quarteirao,
        street: filteredProperties[0]?.street_name || ""
      };

      const metadata = {
        total: stats.total,
        residences: stats.residence,
        commerce: stats.commerce,
        lots: stats.vacant_lot,
        strategicPoints: stats.strategic_point,
        others: stats.others,
        inhabitants: stats.inhabitants
      };

      const doc = await generateRGPDF(
        filteredProperties,
        agentInfo,
        metadata,
        { type: blockFilter === 'all' ? 'total' : 'block', value: blockFilter }
      );

      doc.save(`RG_BOLETIM_${bulletinHeader.municipio.toUpperCase()}_QTR_${bulletinHeader.quarteirao}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      
      toast.dismiss();
      toast.success("PDF gerado com sucesso!");
    } catch (error: any) {
      toast.dismiss();
      toast.error("Erro ao gerar PDF: " + error.message);
    }
  };

  const handlePropertyClick = (property: Property) => {
    setEditingProperty(property);
    setIsFormOpen(true);
  };

  const handleSaveProperty = (savedProperty: Property) => {
    if (editingProperty) {
      setProperties(properties.map(p => p.id === savedProperty.id ? savedProperty : p));
    } else {
      setProperties([...properties, savedProperty]);
    }
    setIsFormOpen(false);
    setEditingProperty(null);
  };

  if (!selectedBlock) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 pb-24 lg:pb-8">
        <div className="px-4 lg:px-6 py-8 space-y-8 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="h-14 w-14 rounded-[1.5rem] bg-slate-900 flex items-center justify-center shadow-xl">
                 <LayoutDashboard className="h-7 w-7 text-emerald-400" />
               </div>
               <div>
                 <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase leading-none mb-1">Meus Quarteirões</h1>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selecione um quarteirão para o RG</p>
               </div>
            </div>
          </div>
          <RGBlockList 
            blocks={blocks} 
            onSelect={handleBlockSelect} 
            onNewBlock={handleNewBlock} 
            isLoading={isLoading} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24 lg:pb-8 animate-in fade-in duration-500">
      {/* Mobile Header with Back Button */}
      <div className="lg:hidden sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-full bg-slate-50 text-slate-900"
            onClick={() => setSelectedBlock(null)}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
              currentStep >= 1 ? "bg-slate-900 text-emerald-400" : "bg-slate-100 text-slate-400"
            )}>1</div>
            <div className="h-0.5 w-4 bg-slate-100" />
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
              currentStep >= 2 ? "bg-slate-900 text-emerald-400" : "bg-slate-100 text-slate-400"
            )}>2</div>
            <div className="h-0.5 w-4 bg-slate-100" />
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
              currentStep >= 3 ? "bg-slate-900 text-emerald-400" : "bg-slate-100 text-slate-400"
            )}>3</div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">QTR {bulletinHeader.quarteirao}</p>
          <p className="text-xs font-black text-slate-900 uppercase">
            {currentStep === 1 && "Cabeçalho"}
            {currentStep === 2 && "Imóveis"}
            {currentStep === 3 && "Fechamento"}
          </p>
        </div>
      </div>

      {/* Header Buttons - Desktop only */}
      <div className="hidden lg:flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 pt-6 mb-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-12 w-12 rounded-2xl bg-white border border-slate-100 shadow-sm text-slate-900 hover:bg-slate-50 transition-all"
            onClick={() => setSelectedBlock(null)}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl">
              <ClipboardList className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase">RG: QTR {bulletinHeader.quarteirao}</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{bulletinHeader.localidade || "Boletim de Reconhecimento Geográfico"}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="h-11 px-6 rounded-xl bg-white border-2 border-slate-100 shadow-sm font-black text-[11px] uppercase tracking-widest gap-2 hover:bg-slate-50 transition-all"
            onClick={handleExportPDF}
          >
            <Printer className="h-4 w-4 text-emerald-600" />
            PDF Oficial
          </Button>
          <RGImportByPhoto onImportComplete={fetchInitialData} />
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Step 1: Header / Territory Info */}
        <div className={cn("space-y-4", currentStep !== 1 && "hidden lg:block")}>
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-lg font-black text-slate-900 uppercase">1. Dados do Quarteirão</h2>
            <Target className="h-5 w-5 text-emerald-500" />
          </div>
          
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <RGBulletinHeader data={bulletinHeader} onChange={handleHeaderChange} />
            
            <div className="p-4 lg:p-6 bg-slate-50/50 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Logradouro Principal</Label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                    <Input 
                      placeholder="Nome da rua para auto-preenchimento..."
                      className="h-12 pl-11 rounded-2xl border-none bg-white shadow-sm font-bold text-slate-900"
                      value={bulletinHeader.localidade}
                      onChange={(e) => handleHeaderChange("localidade", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-end lg:hidden">
                  <Button 
                    className="w-full h-14 rounded-2xl bg-slate-900 text-emerald-400 font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 gap-2"
                    onClick={() => setCurrentStep(2)}
                  >
                    Iniciar Cadastro
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Step 2: Properties Registry */}
        <div className={cn("space-y-4", currentStep !== 2 && "hidden lg:block")}>
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-lg font-black text-slate-900 uppercase">2. Cadastro de Imóveis</h2>
            <div className="flex items-center gap-2">
              <RGImportByPhoto onImportComplete={fetchInitialData} className="h-10 w-10 p-0 rounded-full" showText={false} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 sticky top-6 self-start">
              <RGQuickAddForm 
                onAdd={handleQuickAdd}
                lastSequence={filteredProperties.length > 0 ? (filteredProperties[filteredProperties.length - 1].sequence || filteredProperties.length) : 0}
                defaultStreet={filteredProperties.length > 0 ? filteredProperties[filteredProperties.length - 1].street_name || "" : activeSession?.street_name || ""}
                defaultSide={bulletinHeader.lado}
              />
              
              <div className="mt-4 hidden lg:block">
                <Card className="border-none shadow-lg bg-white rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrar</h3>
                    <Filter className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="Buscar rua/número..." 
                        className="pl-10 h-10 rounded-xl border-slate-100 bg-slate-50 font-bold"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </div>
            
            <div className="lg:col-span-8 space-y-4">
              <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-white min-h-[400px]">
                <div className="p-0 overflow-x-auto scrollbar-hide">
                  <RGBulletinTable 
                    properties={filteredProperties} 
                    onEdit={handlePropertyClick}
                    onDelete={handleDeleteProperty}
                  />
                </div>
              </Card>

              <div className="lg:hidden flex gap-3 mt-4">
                <Button 
                  variant="outline"
                  className="flex-1 h-14 rounded-2xl border-2 border-slate-200 font-black text-[11px] uppercase tracking-widest"
                  onClick={() => setCurrentStep(1)}
                >
                  Voltar
                </Button>
                <Button 
                  className="flex-1 h-14 rounded-2xl bg-slate-900 text-emerald-400 font-black uppercase tracking-widest shadow-xl"
                  onClick={() => setCurrentStep(3)}
                >
                  Finalizar
                  <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Closing / Review */}
        <div className={cn("space-y-6", currentStep !== 3 && "hidden lg:block")}>
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-lg font-black text-slate-900 uppercase">3. Fechamento e Resumo</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 flex flex-col items-center text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Residencial</p>
              <p className="text-3xl font-black text-blue-600 leading-none">{stats.residence}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 flex flex-col items-center text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Comercial</p>
              <p className="text-3xl font-black text-purple-600 leading-none">{stats.commerce}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 flex flex-col items-center text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">T. Baldio</p>
              <p className="text-3xl font-black text-amber-600 leading-none">{stats.vacant_lot}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 flex flex-col items-center text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">P. Estratégico</p>
              <p className="text-3xl font-black text-emerald-600 leading-none">{stats.strategic_point}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-50 flex flex-col items-center text-center col-span-2 md:col-span-1 lg:col-span-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
              <p className="text-3xl font-black text-slate-900 leading-none">{stats.total}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-2xl rounded-[2.5rem] bg-slate-900 text-white p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <Printer className="h-7 w-7 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Gerar Boletim</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Documento Oficial PDF</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm mb-8 leading-relaxed font-medium">
                O boletim será gerado seguindo o modelo oficial do Ministério da Saúde com todos os {stats.total} imóveis registrados no quarteirão {bulletinHeader.quarteirao}.
              </p>
              <Button 
                className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all text-sm gap-2"
                onClick={handleExportPDF}
              >
                <Printer className="h-5 w-5" />
                Gerar PDF para Impressão
              </Button>
            </Card>

            <div className="space-y-4">
              <Button 
                variant="outline"
                className="w-full h-16 rounded-2xl border-2 border-slate-200 bg-white font-black text-[12px] uppercase tracking-widest gap-2"
                onClick={() => setCurrentStep(2)}
              >
                Revisar Imóveis
              </Button>
              <Button 
                variant="outline"
                className="w-full h-16 rounded-2xl border-2 border-slate-200 bg-white font-black text-[12px] uppercase tracking-widest gap-2"
                onClick={() => navigate({ to: '/field-work-list' })}
              >
                <HistoryIcon className="h-5 w-5 text-slate-400" />
                Ir para o Histórico
              </Button>
              <Button 
                className="w-full h-16 rounded-2xl bg-slate-200 text-slate-600 font-black text-[12px] uppercase tracking-widest gap-2"
                onClick={() => {
                  toast.success("Rascunho salvo automaticamente!");
                  navigate({ to: '/dashboard' });
                }}
              >
                Sair e Salvar Rascunho
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button (Mobile Only) */}
      {currentStep === 2 && (
        <div className="lg:hidden fixed bottom-6 right-6 z-50">
          <Button 
            className="h-16 w-16 rounded-full bg-slate-900 text-emerald-400 shadow-2xl flex items-center justify-center p-0 border-4 border-white"
            onClick={() => {
              const quickFormElement = document.getElementById('quick-add-form');
              if (quickFormElement) {
                quickFormElement.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            <Plus className="h-8 w-8" />
          </Button>
        </div>
      )}

      {/* Footer Stats - Final Review Step Only */}
      <div className="hidden lg:block">
        <RGBulletinFooter stats={stats} />
      </div>

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
            <RGPropertyForm 
              initialData={editingProperty} 
              onSave={handleSaveProperty} 
              onCancel={() => setIsFormOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
