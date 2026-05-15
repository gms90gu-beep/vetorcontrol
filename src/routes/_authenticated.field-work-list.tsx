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
  LayoutDashboard
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

export const Route = createFileRoute("/_authenticated/field-work-list")({
  component: FieldWorkListPage,
});

function FieldWorkListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
        .single();
      
      if (session) {
        setActiveSession(session);
        // Fetch real properties for this block
        const { data: props } = await supabase
          .from("properties")
          .select("*")
          .eq("block_number", session.block_number)
          .order("number", { ascending: true });
        
        if (props) setProperties(props);
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
    const matchesSearch = p.number.includes(searchQuery) || (p.street_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    if (filter === "all") return matchesSearch;
    if (filter === "completed") return matchesSearch && (p.status === "visited" || p.status === "closed" || p.status === "refused" || p.status === "abandoned");
    if (filter === "pending") return matchesSearch && (!p.status || p.status === "not_visited");
    return matchesSearch;
  });

  const workedCount = properties.filter(p => p.status !== "not_visited" && p.status).length;
  const progressPercent = properties.length > 0 ? Math.round((workedCount / properties.length) * 100) : 0;

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/field-work' })} className="rounded-full active:scale-95">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Lista de Imóveis</h2>
          <p className="text-sm font-medium text-slate-500">
            {activeSession ? `Quarteirão ${activeSession.block_number} • ${activeSession.street_name}` : "Carregando..."}
          </p>
        </div>
      </div>

      {/* Block Progress Summary */}
      <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2.5rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Target className="h-24 w-24" />
        </div>
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Progresso do Quarteirão</p>
              <h3 className="text-3xl font-black tracking-tighter">{progressPercent}%</h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Trabalhados</p>
              <h3 className="text-xl font-black">{workedCount}/{properties.length}</h3>
            </div>
          </div>
          <Progress value={progressPercent} className="h-2 bg-white/10" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="relative group">
          <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <Input 
            placeholder="Buscar imóvel pelo número..." 
            className="pl-12 h-14 rounded-2xl border-none bg-white shadow-lg text-base font-bold focus-visible:ring-blue-500/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" className="w-full" onValueChange={setFilter}>
          <TabsList className="w-full h-12 bg-slate-100 rounded-2xl p-1">
            <TabsTrigger value="all" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">Todos</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">Pendentes</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">Concluídos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
          </div>
        ) : filteredProperties.length > 0 ? (
          filteredProperties.map((prop) => (
            <Card 
              key={prop.id} 
              className="border-none shadow-md hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer rounded-[2rem] overflow-hidden group bg-white border border-slate-50"
              onClick={() => navigate({ to: '/property/$propertyId', params: { propertyId: prop.id } })}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors shadow-inner">
                      {getTypeIcon(prop.type)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black tracking-tighter text-slate-800">{prop.number}</span>
                        {getStatusBadge(prop.status)}
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-700 transition-colors">
                        {prop.street_name || activeSession?.street_name}
                      </span>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Building className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Nenhum imóvel</h3>
            <p className="text-sm text-slate-500 uppercase tracking-widest text-[10px] font-bold">Cadastre imóveis no módulo RG</p>
          </div>
        )}
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
