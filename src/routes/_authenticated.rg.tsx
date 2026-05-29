import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, Component, ReactNode } from "react";
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
  AlertCircle,
  ArrowLeft,
  X
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
import { translate } from "@/lib/translations";

class ErrorBoundary extends Component<{ children: ReactNode, fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode, fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export const Route = createFileRoute("/_authenticated/rg")({
  component: () => (
    <ErrorBoundary fallback={
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h2 className="text-xl font-bold mb-4">Erro ao carregar o módulo RG</h2>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    }>
      <RGPage />
    </ErrorBoundary>
  ),
});


function RGPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
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

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Agent
      const { data: agentData } = await supabase.from("agents").select("*").eq("profile_id", user.id).maybeSingle();
      if (agentData) {
        setAgent(agentData);
        setBulletinHeader(prev => ({
          ...prev,
          municipio: agentData.municipality || "",
          agente: agentData.name || ""
        }));
      }

      // Session
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
        setBulletinHeader(prev => ({
          ...prev,
          quarteirao: session.block_number || ""
        }));
      }

      // Cycle/Week
      const { data: cycle } = await supabase.from("cycles").select("*").eq("status", "in_progress").maybeSingle();
      if (cycle) {
        setActiveCycle(cycle);
        const { data: week } = await supabase.from("weeks").select("*").eq("cycle_id", cycle.id).order("number", { ascending: true }).limit(1).maybeSingle();
        if (week) setActiveWeek(week);
      }

      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("sequence", { ascending: true })
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
    const residence = filteredProperties.filter(p => p.type?.toLowerCase() === 'residence' || p.type?.toLowerCase() === 'residential').length;
    const commerce = filteredProperties.filter(p => p.type?.toLowerCase() === 'commerce' || p.type?.toLowerCase() === 'commercial').length;
    const vacant_lot = filteredProperties.filter(p => p.type?.toLowerCase() === 'vacant_lot').length;
    const strategic_point = filteredProperties.filter(p => p.type?.toLowerCase() === 'strategic_point').length;
    const others = filteredProperties.filter(p => p.type?.toLowerCase() === 'others').length;
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
    setIsDirty(true);
    if (field === 'quarteirao' && value) {
      setBlockFilter(value);
    }
  };

  const handleResetForm = () => {
    setBulletinHeader({
      uf: "CE",
      municipio: agent?.municipality || "",
      localidade: "",
      sublocal: "",
      distrito: "",
      categoria: "URBANA",
      quarteirao: activeSession?.block_number || "",
      sequencia: "01",
      lado: "01",
      agente: agent?.name || ""
    });
    setSearchTerm("");
    setBlockFilter("all");
    setResetKey(prev => prev + 1);
    toast.info("Campos do formulário limpos");
  };

  const handleQuickAdd = async (data: any) => {
    try {
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
      toast.success("Imóvel adicionado!");
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

  const handleDeleteBlock = async () => {
    if (blockFilter === "all") return;
    
    try {
      setIsLoading(true);
      setIsDeleteDialogOpen(false);
      
      // Find the specific block record to delete it explicitly if possible
      const blockToDelete = properties.find(p => p.block_number === blockFilter);
      
      const { error: propError } = await supabase
        .from("properties")
        .delete()
        .eq("block_number", blockFilter);

      if (propError) throw propError;

      // Try to delete from blocks table by number (or ID if we found it)
      if (blockToDelete?.block_id) {
        await supabase
          .from("blocks")
          .delete()
          .eq("id", blockToDelete.block_id);
      } else {
        await supabase
          .from("blocks")
          .delete()
          .eq("number", blockFilter);
      }
      
      // If this was the active session block, we should update the session or just clear it locally
      if (activeSession && activeSession.block_number === blockFilter) {
        await supabase
          .from("field_work_sessions")
          .update({ block_number: "" })
          .eq("id", activeSession.id);
      }
      
      toast.success(`Quarteirão ${blockFilter} e seus imóveis foram excluídos.`);
      
      // Update local state
      setProperties(prev => prev.filter(p => p.block_number !== blockFilter));
      setBlockFilter("all");
      if (bulletinHeader.quarteirao === blockFilter) {
        setBulletinHeader(prev => ({ ...prev, quarteirao: "" }));
      }
    } catch (error: any) {
      toast.error("Erro ao excluir quarteirão: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };



  const handleSaveHeader = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // We update the agent information since these fields usually map to the agent's context
      const { error } = await supabase
        .from("agents")
        .update({
          municipality: bulletinHeader.municipio,
          name: bulletinHeader.agente
        })
        .eq("profile_id", user.id);

      if (error) throw error;
      
      setIsDirty(false);
      toast.success("Cabeçalho salvo com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao salvar cabeçalho: " + error.message);
    } finally {
      setIsLoading(false);
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

  const handleBack = () => {
    if (isDirty) {
      if (confirm("Deseja sair sem salvar as alterações do boletim?")) {
        navigate({ to: "/dashboard" });
      }
    } else {
      window.history.back();
    }
  };

  const handleClose = () => {
    if (isDirty) {
      if (confirm("Deseja sair sem salvar as alterações do boletim?")) {
        navigate({ to: "/dashboard" });
      }
    } else {
      navigate({ to: "/dashboard" });
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

  return (
    <div className="flex flex-col bg-slate-100 dark:bg-slate-950 min-h-screen pb-24 lg:pb-8">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-50 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 font-black text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all rounded-xl h-9"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          
          <div className="flex flex-col items-center">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white">
              Boletim Digital
            </h2>
            <div className="h-1 w-6 bg-emerald-500 rounded-full mt-1" />
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 font-black text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-red-500 transition-all rounded-xl h-9"
            onClick={handleClose}
          >
            <span className="hidden sm:inline">Fechar</span>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {/* Existing Content */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg">
            <ClipboardList className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">RG Digital</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reconhecimento Geográfico</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto min-w-[280px]">
          <div className="flex items-center gap-2 w-full">
            <Button 
              variant="outline" 
              className="flex-1 h-11 rounded-xl bg-white border-none shadow-sm font-black text-[10px] uppercase tracking-widest gap-2"
              onClick={handleExportPDF}
            >
              <Printer className="h-4 w-4 text-emerald-600" />
              PDF
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-11 rounded-xl bg-white border-none shadow-sm font-black text-[10px] uppercase tracking-widest gap-2"
              onClick={handleSaveHeader}
            >
              <Save className="h-4 w-4 text-blue-600" />
              Salvar
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-11 rounded-xl bg-white border-none shadow-sm font-black text-[10px] uppercase tracking-widest gap-2"
              onClick={() => navigate({ to: '/field-work-list' })}
            >
              <HistoryIcon className="h-4 w-4 text-slate-400" />
              Histórico
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <RGImportByPhoto onImportComplete={fetchInitialData} />
            <Button 
              variant="ghost" 
              className="w-full h-11 rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 bg-white/50"
              onClick={handleResetForm}
            >
              <Trash2 className="h-4 w-4" />
              Limpar Campos
            </Button>
          </div>
        </div>
      </div>

      {/* Official Form Style Container */}
      <div className="px-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        ) : (
          <Card className="border-none shadow-2xl rounded-sm overflow-hidden border border-slate-300">
            <RGBulletinHeader data={bulletinHeader} onChange={handleHeaderChange} />
            
            <div className="p-0 overflow-x-auto">
              <RGBulletinTable 
                properties={filteredProperties} 
                onEdit={handlePropertyClick}
                onDelete={handleDeleteProperty}
              />
            </div>
            
            <RGBulletinFooter stats={stats} />
          </Card>
        )}

        {/* Quick Add Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-1">
            <RGQuickAddForm 
              key={resetKey}
              onAdd={handleQuickAdd}
              lastSequence={filteredProperties.length > 0 ? (filteredProperties[filteredProperties.length - 1].sequence || filteredProperties.length) : 0}
              defaultStreet={filteredProperties.length > 0 ? filteredProperties[filteredProperties.length - 1].street_name || "" : activeSession?.street_name || ""}
              defaultSide={bulletinHeader.lado}
            />
          </div>
          
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Card className="border-none shadow-xl bg-white rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Filtrar Território</h3>
                <Filter className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Buscar por rua ou número..." 
                    className="pl-10 h-10 rounded-xl border-slate-100 bg-slate-50 font-bold"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={blockFilter} onValueChange={setBlockFilter}>
                    <SelectTrigger className="w-[150px] h-10 rounded-xl border-slate-100 bg-slate-50 font-bold">
                      <SelectValue placeholder="Quarteirão" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl">
                      <SelectItem value="all">Todos Qtrs</SelectItem>
                      {Array.from(new Set(properties.map(p => p.block_number))).filter(Boolean).map(block => (
                        <SelectItem key={block} value={block!}>Qtr {block}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {blockFilter !== "all" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 bg-slate-50 border border-slate-100"
                      onClick={() => setIsDeleteDialogOpen(true)}
                      title="Excluir este quarteirão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

              </div>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Residencial</p>
                <p className="text-2xl font-black text-blue-600">{stats.residence}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comercial</p>
                <p className="text-2xl font-black text-purple-600">{stats.commerce}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">T. Baldio</p>
                <p className="text-2xl font-black text-amber-600">{stats.vacant_lot}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">P. Estratégico</p>
                <p className="text-2xl font-black text-emerald-600">{stats.strategic_point}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-red-500" />
              Confirmar Exclusão
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-slate-600 font-bold leading-relaxed">
              Tem certeza que deseja excluir o <span className="text-red-600">Quarteirão {blockFilter}</span>? 
              Esta ação não pode ser desfeita e todos os {filteredProperties.length} imóveis vinculados serão removidos.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest border-slate-200"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black uppercase text-[10px] tracking-widest gap-2"
                onClick={handleDeleteBlock}
              >
                <Trash2 className="h-4 w-4" />
                Sim, Excluir e Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              onSave={handleSaveProperty} 
              onCancel={() => setIsFormOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

type PropertyFormProps = { initialData: Property | null, onSave: (p: Property) => void, onCancel: () => void };

function PropertyForm({ initialData, onSave, onCancel }: PropertyFormProps) {
  const [formData, setFormData] = useState<Partial<Property>>(initialData || {
    number: "",
    complement: "",
    type: "residence",
    street_name: "",
    side: "01",
    sequence: 1,
    inhabitants: 0,
    status: "active"
  });

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
        number: formData.number || "",
        complement: formData.complement || null,
        type: formData.type || "residence",
        street_name: formData.street_name || null,
        side: formData.side || null,
        sequence: formData.sequence || null,
        inhabitants: formData.inhabitants || 0,
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
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rua</Label>
          <Input 
            value={formData.street_name || ""} 
            onChange={(e) => setFormData({...formData, street_name: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lado</Label>
          <Input 
            value={formData.side || ""} 
            onChange={(e) => setFormData({...formData, side: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Número</Label>
          <Input 
            value={formData.number} 
            onChange={(e) => setFormData({...formData, number: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sequência</Label>
          <Input 
            type="number"
            value={formData.sequence || ""} 
            onChange={(e) => setFormData({...formData, sequence: parseInt(e.target.value)})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Complemento</Label>
          <Input 
            value={formData.complement || ""} 
            onChange={(e) => setFormData({...formData, complement: e.target.value})}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Habitantes</Label>
          <Input 
            type="number"
            value={formData.inhabitants || 0} 
            onChange={(e) => setFormData({...formData, inhabitants: parseInt(e.target.value)})}
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
            <SelectItem value="residence" className="rounded-xl font-bold">{translate("residence")}</SelectItem>
            <SelectItem value="commerce" className="rounded-xl font-bold">{translate("commerce")}</SelectItem>
            <SelectItem value="vacant_lot" className="rounded-xl font-bold">{translate("vacant_lot")}</SelectItem>
            <SelectItem value="strategic_point" className="rounded-xl font-bold">{translate("strategic_point")}</SelectItem>
            <SelectItem value="others" className="rounded-xl font-bold">{translate("others")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <Button 
          type="button" 
          variant="outline" 
          className="flex-1 h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          className="flex-[2] h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest gap-2"
        >
          <Save className="h-4 w-4" /> Salvar
        </Button>
      </div>
    </form>
  );
}
