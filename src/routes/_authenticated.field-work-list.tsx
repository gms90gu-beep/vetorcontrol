import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Search, 
  MapPin, 
  ChevronRight, 
  Filter,
  Home,
  Store,
  Warehouse,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Building,
  TrendingUp,
  Target,
  FileText,
  ClipboardList,
  Layers,
  LayoutDashboard,
  History as HistoryIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { DigitalBulletinTable } from "@/components/DigitalBulletinTable";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/field-work-list")({
  component: FieldWorkListPage,
});

function FieldWorkListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [indexSurvey, setIndexSurvey] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessionAndProperties();
  }, []);

  async function fetchSessionAndProperties() {
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
        // Fetch properties with latest visit for this block and cycle
        const { data: props, error } = await supabase
          .from("properties")
          .select(`
            *,
            visits!left (
              id,
              status,
              activity_type,
              has_focus,
              treatment_applied,
              visit_date,
              visit_deposits (
                id,
                is_positive,
                is_treated
              )
            )
          `)
          .eq("block_number", session.block_number)
          .eq("visits.cycle_id", session.cycle_id as string)
          .order("number", { ascending: true });
        
        if (props) {
          // Normalize the properties to have direct access to latest visit data
          const normalizedProps = props.map(p => {
            const latestVisit = p.visits && p.visits.length > 0 
              ? p.visits.sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())[0]
              : null;
            
            return {
              ...p,
              status: latestVisit?.status || "not_visited",
              has_focus: latestVisit?.has_focus || latestVisit?.visit_deposits?.some((d: any) => d.is_positive) || false,
              treatment_applied: latestVisit?.treatment_applied || latestVisit?.visit_deposits?.some((d: any) => d.is_treated) || false,
              is_pending: latestVisit?.activity_type === 'pending' || latestVisit?.status === 'closed' || latestVisit?.status === 'refused',
              latest_visit: latestVisit
            };
          });
          setProperties(normalizedProps);
        }
      }
    } catch (error) {
      console.error("Error fetching session:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "visited":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="w-3 h-3 mr-1" /> Visitado</Badge>;
      case "closed":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><XCircle className="w-3 h-3 mr-1" /> Fechado</Badge>;
      case "refused":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><AlertCircle className="w-3 h-3 mr-1" /> Recusado</Badge>;
      default:
        return <Badge variant="outline" className="border-dashed text-muted-foreground rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Não Visitado</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "residence": return <Home className="w-5 h-5 text-blue-500" />;
      case "commerce": return <Store className="w-5 h-5 text-purple-500" />;
      case "vacant_lot": return <MapPin className="w-5 h-5 text-amber-600" />;
      case "strategic_point": return <Warehouse className="w-5 h-5 text-emerald-600" />;
      default: return <Home className="w-5 h-5" />;
    }
  };

  const filteredProperties = properties.filter(p => {
    const matchesSearch = (p.number || "").includes(searchQuery) || (p.street_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    if (filter === "all") return matchesSearch;
    if (filter === "completed") return matchesSearch && (p.status === "visited" || p.status === "closed" || p.status === "refused" || p.status === "abandoned");
    if (filter === "pending") return matchesSearch && (p.status === "not_visited" || p.status === "closed" || p.status === "refused");
    if (filter === "focus") return matchesSearch && p.has_focus;
    if (filter === "survey") return matchesSearch && p.latest_visit?.activity_type === 'infestation_survey';
    return matchesSearch;
  });

  const generatePDF = () => {
    const doc = new jsPDF();
    const tableData = properties.map(p => [
      p.number,
      p.type,
      p.status === "visited" ? "Visitado" : p.status === "closed" ? "Fechado" : p.status === "refused" ? "Recusado" : "Pendente",
      p.treatment_applied ? "Sim" : "Não",
      p.has_focus ? "Sim" : "Não",
      p.is_pending ? "Sim" : "Não",
      p.observation || ""
    ]);

    doc.setFontSize(18);
    doc.text("Boletim Diário de Trabalho", 14, 22);
    doc.setFontSize(11);
    doc.text(`Agente: ${activeSession?.user_id || "Agente"}`, 14, 30);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 14, 35);
    doc.text(`Quarteirão: ${activeSession?.block_number}`, 14, 40);

    autoTable(doc, {
      startY: 45,
      head: [['Nº', 'Tipo', 'Situação', 'Trat.', 'Foco', 'Pend.', 'Obs.']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`boletim-${activeSession?.block_number}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("PDF gerado com sucesso!");
  };

  const workedCount = properties.filter(p => p.status !== "not_visited" && p.status).length;
  const closedCount = properties.filter(p => p.status === "closed").length;
  const refusedCount = properties.filter(p => p.status === "refused").length;
  const focusCount = properties.filter(p => p.has_focus).length;
  const progressPercent = properties.length > 0 ? Math.round((workedCount / properties.length) * 100) : 0;

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/field-work' })} className="rounded-full active:scale-95 bg-white shadow-sm">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-500" />
              Boletim Digital
            </h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Quarteirão {activeSession?.block_number} • {activeSession?.street_name}
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={generatePDF}
          className="rounded-2xl border-none bg-white shadow-md hover:shadow-lg transition-all font-black text-[10px] uppercase tracking-widest gap-2 h-12"
        >
          <FileText className="h-4 w-4 text-red-500" />
          Gerar PDF
        </Button>
      </div>

      {/* Progress Bars Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Target className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Quarteirão</p>
                <h3 className="text-2xl font-black tracking-tighter">{progressPercent}%</h3>
              </div>
              <p className="text-[10px] font-bold text-slate-400">{workedCount}/{properties.length}</p>
            </div>
            <Progress value={progressPercent} className="h-1.5 bg-white/10" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-blue-600 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Layers className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-200 mb-1">Rua/Logradouro</p>
                <h3 className="text-2xl font-black tracking-tighter">64%</h3>
              </div>
              <p className="text-[10px] font-bold text-blue-200">18/28</p>
            </div>
            <Progress value={64} className="h-1.5 bg-white/10" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-indigo-600 text-white rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <LayoutDashboard className="h-16 w-16" />
          </div>
          <CardContent className="p-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-200 mb-1">Ciclo Atual</p>
                <h3 className="text-2xl font-black tracking-tighter">42%</h3>
              </div>
              <p className="text-[10px] font-bold text-indigo-200">842/2000</p>
            </div>
            <Progress value={42} className="h-1.5 bg-white/10" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <Input 
              placeholder="Buscar imóvel..." 
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-lg text-base font-bold focus-visible:ring-blue-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className={cn(
              "h-14 w-14 rounded-2xl border-none shadow-lg transition-all",
              indexSurvey ? "bg-amber-500 text-white" : "bg-white text-slate-400"
            )}
            onClick={() => setIndexSurvey(!indexSurvey)}
          >
            <TrendingUp className="h-6 w-6" />
          </Button>
        </div>

        <Tabs defaultValue="all" className="w-full" onValueChange={setFilter}>
          <TabsList className="w-full h-14 bg-white/50 backdrop-blur-sm shadow-inner border border-slate-100 rounded-[1.5rem] p-1.5 overflow-x-auto overflow-y-hidden no-scrollbar">
            <TabsTrigger value="all" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full">Todos</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Pendências</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Visitados</TabsTrigger>
            <TabsTrigger value="focus" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Focos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Boletim...</p>
          </div>
        ) : filteredProperties.length > 0 ? (
          <DigitalBulletinTable 
            properties={filteredProperties} 
            indexSurvey={indexSurvey}
            onPropertyClick={(prop) => {
              setSelectedProperty(prop);
              setIsModalOpen(true);
            }}
            onStatusUpdate={() => {}} 
          />
        ) : (
          <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Building className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Nenhum imóvel encontrado</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Verifique os filtros ou busque outro número</p>
          </div>
        )}
      </div>

      {/* Property Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="bg-slate-900 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <HistoryIcon className="h-24 w-24" />
            </div>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center font-black text-xl">
                  {selectedProperty?.number}
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tighter">Detalhes do Imóvel</DialogTitle>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Histórico e Operação</p>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <ScrollArea className="max-h-[60vh] p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Imóvel</p>
                  <p className="font-bold text-slate-800 uppercase text-xs">{selectedProperty?.type || "Residência"}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Atual</p>
                  <p className="font-bold text-slate-800 uppercase text-xs">{selectedProperty?.status || "Pendente"}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <HistoryIcon className="h-3 w-3 text-blue-500" /> Histórico de Visitas
                </h4>
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-50 bg-slate-50/30">
                      <div className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Ciclo 0{i}/2026</p>
                          <span className="text-[9px] font-bold text-slate-400">12/0{i}/2026</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Visita realizada sem focos. Imóvel tratado com Larvicida.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
            <div className="flex gap-3 w-full">
              <Button 
                className="flex-1 h-12 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-900 text-white"
                onClick={() => {
                  setIsModalOpen(false);
                  navigate({ to: `/property/${selectedProperty.id}` });
                }}
              >
                Abrir Operação
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 h-12 rounded-xl font-black text-[10px] uppercase tracking-widest border-slate-200"
                onClick={() => setIsModalOpen(false)}
              >
                Fechar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Operational Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 z-50 shadow-[0_-10px_40px_rgba(15,23,42,0.3)] md:rounded-t-[3rem] safe-area-bottom animate-in slide-in-from-bottom-full duration-700">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Trabalhados</span>
              <span className="text-sm font-black text-white">{workedCount}</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-4">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Fechados</span>
              <span className="text-sm font-black text-yellow-400">{closedCount}</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-4">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Focos</span>
              <span className="text-sm font-black text-red-400">{focusCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cobertura</span>
              <span className="text-sm font-black text-blue-400">{progressPercent}%</span>
            </div>
            <Button 
              className="h-12 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
              onClick={() => navigate({ to: '/field-work' })}
            >
              Novo Registro
            </Button>
          </div>
        </div>
      </div>

      <Button 
        className="fixed bottom-24 right-6 h-16 w-16 rounded-[2rem] shadow-2xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 p-0 active:scale-90 transition-all z-40"
        onClick={() => navigate({ to: '/rg' })}
      >
        <Plus className="h-8 w-8 text-white" />
      </Button>
    </div>
  );
}
