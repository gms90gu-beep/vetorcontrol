import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Save,
  Activity,
  Droplets,
  Bug,
  ShieldCheck,
  FileText,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusButton, ToggleButton } from "@/components/PropertyVisitButtons";
import { cn } from "@/lib/utils";

const DEPOSIT_TYPES = [
  { code: "A1", name: "Caixa d'água" },
  { code: "A2", name: "Tambor/Barril" },
  { code: "B", name: "Vasos/Pratos" },
  { code: "C", name: "Pneus" },
  { code: "D1", name: "Lixo" },
  { code: "D2", name: "Entulho" },
  { code: "E", name: "Depósitos naturais" }
];

export const Route = createFileRoute("/_authenticated/property/$propertyId")({
  component: PropertyVisitPage,
});

function BooleanButton({ value, onChange, label }: { value: boolean, onChange: (v: boolean) => void, label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Button 
          type="button"
          variant={value === true ? "default" : "outline"}
          onClick={() => onChange(true)}
          className={`h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${value === true ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200' : 'border-slate-200'}`}
        >
          SIM
        </Button>
        <Button 
          type="button"
          variant={value === false ? "default" : "outline"}
          onClick={() => onChange(false)}
          className={`h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${value === false ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200' : 'border-slate-200'}`}
        >
          NÃO
        </Button>
      </div>
    </div>
  );
}

function PropertyVisitPage() {
  const { propertyId } = useParams({ from: "/_authenticated/property/$propertyId" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("visited");
  const [activity, setActivity] = useState<string>("routine");
  const [property, setProperty] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentVisitId, setCurrentVisitId] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [routineData, setRoutineData] = useState({ 
    treatment: false, 
    treatmentAmount: 0, 
    larvicideUnit: "gramas",
    treatedDeposits: 0,
    elimination: false, 
    eliminationAmount: 0, 
    guidance: false, 
    notes: "" 
  });
  const [surveyData, setSurveyData] = useState({ hasFocus: false, sampleCollected: false });
  const [pendingData, setPendingData] = useState({ isRecovered: false, notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyStats, setDailyStats] = useState({ worked: 0, treated: 0, larvicide: 0 });

  useEffect(() => {
    fetchData();
    fetchDailyStats();
  }, [propertyId]);

  async function fetchDailyStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: visits } = await supabase
        .from("visits")
        .select("status, treatment_amount, treated_deposits")
        .eq("agent_id", user.id)
        .gte("visit_date", today.toISOString());

      if (visits) {
        const stats = visits.reduce((acc, v) => ({
          worked: acc.worked + 1,
          treated: acc.treated + (v.treated_deposits || 0),
          larvicide: acc.larvicide + (Number(v.treatment_amount) || 0)
        }), { worked: 0, treated: 0, larvicide: 0 });
        setDailyStats(stats);
      }
    } catch (e) { console.error(e); }
  }

  async function fetchData() {
    if (!propertyId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      // Get property details
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId as string)
        .maybeSingle();
      
      if (propError) throw propError;
      if (!propData) {
        setError("Imóvel não encontrado.");
        return;
      }
      setProperty(propData);

      // Get current active session
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
          
          // Check for existing visit for this property in the current cycle
          const { data: existingVisit } = await supabase
            .from("visits")
            .select("id, status, activity_type, has_focus, sample_collected, treatment_applied, treatment_amount, larvicide_unit, treated_deposits, elimination_done, elimination_amount, notes, guidance_given, is_recovered")
            .eq("property_id", propertyId as string)
            .eq("agent_id", user.id)
            .eq("cycle_id", session.cycle_id as string)
            .order("visit_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (existingVisit) {
            setCurrentVisitId(existingVisit.id);
            setStatus(existingVisit.status);
            
            const activityMap: Record<string, string> = {
              "routine": "routine",
              "infestation_survey": "survey",
              "pending": "pending"
            };
            setActivity(activityMap[existingVisit.activity_type] || "routine");
            
            setRoutineData({
              treatment: existingVisit.treatment_applied || false,
              treatmentAmount: Number(existingVisit.treatment_amount) || 0,
              larvicideUnit: existingVisit.larvicide_unit || "gramas",
              treatedDeposits: existingVisit.treated_deposits || 0,
              elimination: existingVisit.elimination_done || false,
              eliminationAmount: existingVisit.elimination_amount || 0,
              guidance: existingVisit.guidance_given || false,
              notes: existingVisit.notes || ""
            });
            
            setSurveyData({
              hasFocus: existingVisit.has_focus || false,
              sampleCollected: existingVisit.sample_collected || false
            });
            
            setPendingData({
              isRecovered: existingVisit.is_recovered || false,
              notes: existingVisit.notes || ""
            });

            // Load deposits
            const { data: existingDeposits } = await supabase
              .from("visit_deposits")
              .select("*")
              .eq("visit_id", existingVisit.id);
            
            if (existingDeposits) {
              const dbDeposits = existingDeposits.map(d => ({
                id: d.id,
                type: d.type_code,
                description: d.description,
                quantity: d.quantity,
                positive: d.is_positive,
                treated: d.is_treated,
                eliminated: d.is_eliminated,
                selected: true
              }));
              
              // Merge with DEPOSIT_TYPES to ensure all are shown
              const merged = DEPOSIT_TYPES.map((type, index) => {
                const existing = dbDeposits.find(d => d.type === type.code);
                if (existing) return existing;
                return {
                  id: `new-${index}`,
                  type: type.code,
                  description: type.name,
                  quantity: 0,
                  positive: false,
                  treated: false,
                  eliminated: false,
                  selected: false
                };
              });
              
              setDeposits(merged);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      setError("Falha ao carregar dados do imóvel.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!activeSession || isUpdatingStatus || !propertyId) {
      if (!activeSession) toast.error("Inicie uma jornada de trabalho primeiro.");
      return;
    }
    
    const previousStatus = status;
    setStatus(newStatus);
    setIsUpdatingStatus(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const activityMap: Record<string, string> = {
        "routine": "routine",
        "survey": "infestation_survey",
        "pending": "pending"
      };

      if (currentVisitId) {
        const { error: updateError } = await supabase
          .from("visits")
          .update({ 
            status: newStatus as any,
            visit_date: new Date().toISOString()
          })
          .eq("id", currentVisitId);
        
        if (updateError) throw updateError;
      } else {
        const { data: newVisit, error: insertError } = await supabase
          .from("visits")
          .insert({
            property_id: propertyId as string,
            agent_id: user.id,
            cycle_id: activeSession.cycle_id as string,
            week_id: activeSession.week_id as string,
            status: newStatus as any,
            activity_type: (activityMap[activity] || "routine") as any,
            visit_date: new Date().toISOString()
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        setCurrentVisitId(newVisit.id);
      }
      
      toast.success("Status atualizado", {
        description: `Imóvel marcado como ${newStatus === 'visited' ? 'Visitado' : newStatus === 'closed' ? 'Fechado' : newStatus === 'refused' ? 'Recusado' : 'Abandonado'}`,
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      setStatus(previousStatus);
      toast.error("Não foi possível atualizar o status do imóvel.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSave = async () => {
    if (!activeSession || !propertyId) {
      toast.error("Inicie uma jornada de trabalho primeiro.");
      return;
    }

    if (status === 'visited' && activity === 'routine' && routineData.treatment) {
      if (routineData.treatmentAmount <= 0) {
        toast.error("Informe a quantidade de larvicida utilizada.");
        return;
      }
      if (routineData.treatedDeposits <= 0) {
        toast.error("Informe a quantidade de depósitos tratados.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let visitId = currentVisitId;

      const activityMap: Record<string, string> = {
        "routine": "routine",
        "survey": "infestation_survey",
        "pending": "pending"
      };

      if (!visitId) {
        const { data: visit, error: visitError } = await supabase
          .from("visits")
          .insert({
            property_id: propertyId as string,
            agent_id: user.id,
            cycle_id: activeSession.cycle_id as string,
            week_id: activeSession.week_id as string,
            status: status as any,
            activity_type: (activityMap[activity] || "routine") as any,
            visit_date: new Date().toISOString(),
            has_focus: (status === 'visited' && activity === 'survey') ? surveyData.hasFocus : false,
            sample_collected: (status === 'visited' && activity === 'survey') ? surveyData.sampleCollected : false,
            treatment_applied: (status === 'visited' && activity === 'routine') ? routineData.treatment : false,
            treatment_amount: (status === 'visited' && activity === 'routine') ? routineData.treatmentAmount : 0,
            larvicide_unit: (status === 'visited' && activity === 'routine') ? routineData.larvicideUnit : null,
            treated_deposits: (status === 'visited' && activity === 'routine') ? routineData.treatedDeposits : 0,
            elimination_done: (status === 'visited' && activity === 'routine') ? routineData.elimination : false,
            elimination_amount: (status === 'visited' && activity === 'routine') ? routineData.eliminationAmount : 0,
            guidance_given: (status === 'visited' && activity === 'routine') ? routineData.guidance : false,
            is_recovered: (status === 'visited' && activity === 'pending') ? pendingData.isRecovered : false,
            notes: status === 'visited' ? (activity === 'routine' ? routineData.notes : activity === 'pending' ? pendingData.notes : "") : ""
          })
          .select()
          .single();

        if (visitError) throw visitError;
        visitId = visit.id;
      } else {
        // Update activity type in case it changed
        await supabase
          .from("visits")
          .update({ 
            activity_type: (activityMap[activity] || "routine") as any,
            has_focus: (status === 'visited' && activity === 'survey') ? surveyData.hasFocus : false,
            sample_collected: (status === 'visited' && activity === 'survey') ? surveyData.sampleCollected : false,
            treatment_applied: (status === 'visited' && activity === 'routine') ? routineData.treatment : false,
            treatment_amount: (status === 'visited' && activity === 'routine') ? routineData.treatmentAmount : 0,
            larvicide_unit: (status === 'visited' && activity === 'routine') ? routineData.larvicideUnit : null,
            treated_deposits: (status === 'visited' && activity === 'routine') ? routineData.treatedDeposits : 0,
            elimination_done: (status === 'visited' && activity === 'routine') ? routineData.elimination : false,
            elimination_amount: (status === 'visited' && activity === 'routine') ? routineData.eliminationAmount : 0,
            guidance_given: (status === 'visited' && activity === 'routine') ? routineData.guidance : false,
            is_recovered: (status === 'visited' && activity === 'pending') ? pendingData.isRecovered : false,
            notes: status === 'visited' ? (activity === 'routine' ? routineData.notes : activity === 'pending' ? pendingData.notes : "") : ""
          })
          .eq("id", visitId);
      }

      // Sync deposits
      // First clear old ones
      await supabase.from("visit_deposits").delete().eq("visit_id", visitId);

      const selectedDeposits = deposits.filter(d => d.selected);

      if (selectedDeposits.length > 0 && status === 'visited' && activity === 'survey') {
        const depositsToSave = selectedDeposits.map(d => ({
          visit_id: visitId as string,
          type_code: d.type,
          description: d.description,
          quantity: d.quantity,
          is_positive: d.positive,
          is_treated: d.treated,
          is_eliminated: d.eliminated
        }));

        const { error: depositsError } = await supabase
          .from("visit_deposits")
          .insert(depositsToSave);
        
        if (depositsError) throw depositsError;
      }

      toast.success("Visita finalizada com sucesso!");
      navigate({ to: "/field-work-list" });
    } catch (error: any) {
      toast.error("Erro ao salvar visita: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };


  useEffect(() => {
    if (activity === "survey" && deposits.length === 0) {
      const initialDeposits = DEPOSIT_TYPES.map((type, index) => ({
        id: `init-${index}`,
        type: type.code,
        description: type.name,
        quantity: 0,
        positive: false,
        treated: false,
        eliminated: false,
        selected: false
      }));
      setDeposits(initialDeposits);
    }
  }, [activity, deposits.length]);

  const updateDeposit = (id: number, field: string, value: any) => {
    setDeposits(deposits.map(d => {
      if (d.id === id) {
        const updated = { ...d, [field]: value };
        // Auto-select if quantity > 0 or any action is checked
        if (field === 'quantity' && Number(value) > 0) updated.selected = true;
        if (['positive', 'treated', 'eliminated'].includes(field) && value === true) updated.selected = true;
        return updated;
      }
      return d;
    }));
  };

  const surveySummary = deposits.reduce((acc, d) => {
    if (!d.selected) return acc;
    return {
      found: acc.found + (Number(d.quantity) || 0),
      positive: acc.positive + (d.positive ? 1 : 0),
      treated: acc.treated + (d.treated ? 1 : 0),
      eliminated: acc.eliminated + (d.eliminated ? 1 : 0)
    };
  }, { found: 0, positive: 0, treated: 0, eliminated: 0 });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-500">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sincronizando imóvel...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-6">
        <div className="h-20 w-20 bg-red-50 rounded-[2rem] flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-black tracking-tighter text-slate-800">{error}</h3>
          <p className="text-sm text-slate-500 font-medium">Não foi possível carregar as informações.</p>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <Button variant="outline" onClick={() => navigate({ to: "/field-work-list" })} className="flex-1 h-12 rounded-2xl font-bold uppercase tracking-widest text-[10px]">
            Voltar
          </Button>
          <Button onClick={fetchData} className="flex-1 h-12 rounded-2xl font-bold uppercase tracking-widest text-[10px]">
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  const [nextProperty, setNextProperty] = useState<any>(null);

  useEffect(() => {
    if (property && activeSession) {
      fetchNextProperty();
    }
  }, [property, activeSession]);

  async function fetchNextProperty() {
    try {
      const { data: nextProp } = await supabase
        .from("properties")
        .select("id, number")
        .eq("block_id", property.block_id)
        .gt("number", property.number)
        .order("number", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      setNextProperty(nextProp);
    } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 max-w-lg mx-auto relative">
      {/* Header Operational */}
      <div className="flex flex-col gap-4 bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/field-work-list" })} className="rounded-2xl bg-slate-50 active:scale-95 transition-all">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação do Imóvel</span>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900">
              IMÓVEL {property?.number || "..."}
            </h2>
          </div>
          <Badge variant="outline" className="border-emerald-500/20 text-emerald-600 bg-emerald-50 font-bold uppercase tracking-tight py-1">
            ATIVO
          </Badge>
        </div>

        <div className="flex flex-col items-center gap-1 text-center py-2 border-y border-slate-50">
          <p className="text-lg font-black text-slate-800 tracking-tight">
            {property?.street_name || "..."}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 rounded-lg font-bold">Quarteirão {activeSession?.block_number || "--"}</Badge>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última visita: {property?.last_visit ? new Date(property.last_visit).toLocaleDateString() : 'Nunca'}</span>
          </div>
        </div>
      </div>

      {/* Cards Operacionais */}
      <div className="grid grid-cols-3 gap-3 px-1">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-1 group active:scale-95 transition-all">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Trabalhados</p>
          <p className="text-xl font-black text-slate-900">{dailyStats.worked}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-1 group active:scale-95 transition-all">
          <div className="h-10 w-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <Droplets className="h-5 w-5" />
          </div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Tratados</p>
          <p className="text-xl font-black text-slate-900">{dailyStats.treated}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-1 group active:scale-95 transition-all">
          <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
            <Bug className="h-5 w-5" />
          </div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Larvicida</p>
          <p className="text-xl font-black text-slate-900">{dailyStats.larvicide}</p>
        </div>
      </div>

      <div className="space-y-6">
        <section className="bg-white p-6 rounded-[2.5rem] shadow-lg shadow-slate-200/40 border border-slate-100">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-4 block text-center">Situação do Imóvel</Label>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => handleStatusChange("visited")}
              disabled={isUpdatingStatus}
              className={cn(
                "flex-1 min-w-[100px] h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2",
                status === "visited" ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200" : "bg-white text-emerald-600 border-emerald-50 shadow-sm"
              )}
            >
              <CheckCircle2 className="h-4 w-4" /> Visitado
            </button>
            <button
              onClick={() => handleStatusChange("closed")}
              disabled={isUpdatingStatus}
              className={cn(
                "flex-1 min-w-[100px] h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2",
                status === "closed" ? "bg-yellow-500 text-white border-yellow-500 shadow-lg shadow-yellow-100" : "bg-white text-yellow-600 border-yellow-50 shadow-sm"
              )}
            >
              <Clock className="h-4 w-4" /> Fechado
            </button>
            <button
              onClick={() => handleStatusChange("refused")}
              disabled={isUpdatingStatus}
              className={cn(
                "flex-1 min-w-[100px] h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2",
                status === "refused" ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-100" : "bg-white text-red-600 border-red-50 shadow-sm"
              )}
            >
              <XCircle className="h-4 w-4" /> Recusado
            </button>
            <button
              onClick={() => handleStatusChange("abandoned")}
              disabled={isUpdatingStatus}
              className={cn(
                "flex-1 min-w-[100px] h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2",
                status === "abandoned" ? "bg-slate-500 text-white border-slate-500 shadow-lg shadow-slate-100" : "bg-white text-slate-600 border-slate-50 shadow-sm"
              )}
            >
              <AlertCircle className="h-4 w-4" /> Abandonado
            </button>
          </div>
        </section>

        <section className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-4 block text-center">Ações Operacionais</Label>
          <Tabs value={activity} onValueChange={setActivity} className="w-full">
            <TabsList className="w-full h-14 bg-white/5 rounded-2xl p-1 gap-1 border border-white/5">
              <TabsTrigger value="routine" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all h-full text-white/60">Rotina</TabsTrigger>
              <TabsTrigger value="survey" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all h-full text-white/60">L. Índice</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all h-full text-white/60">Pendência</TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        {status === "visited" && (
          <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
            {activity === "routine" && (
              <section className="space-y-6">
                <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
                      <Activity className="h-4 w-4" /> Ações Realizadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <BooleanButton 
                      label="Tratamento realizado?" 
                      value={routineData.treatment} 
                      onChange={(v) => setRoutineData({...routineData, treatment: v})} 
                    />
                    {routineData.treatment && (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quantidade de larvicida utilizado</Label>
                          <Input 
                            type="number" 
                            min="0"
                            value={routineData.treatmentAmount} 
                            onChange={(e) => setRoutineData({...routineData, treatmentAmount: Math.max(0, Number(e.target.value))})}
                            className="h-14 rounded-2xl border-slate-200 font-bold text-lg focus:ring-primary bg-slate-50/50"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Unidade</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {["gramas", "ml", "tabletes", "sachês"].map((unit) => (
                              <Button
                                key={unit}
                                type="button"
                                variant={routineData.larvicideUnit === unit ? "default" : "outline"}
                                onClick={() => setRoutineData({...routineData, larvicideUnit: unit})}
                                className={`h-10 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${
                                  routineData.larvicideUnit === unit 
                                    ? 'bg-primary shadow-md shadow-primary/20' 
                                    : 'border-slate-200 text-slate-500'
                                }`}
                              >
                                {unit}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quantidade de depósitos tratados</Label>
                          <Input 
                            type="number" 
                            min="0"
                            value={routineData.treatedDeposits} 
                            onChange={(e) => setRoutineData({...routineData, treatedDeposits: Math.max(0, Math.floor(Number(e.target.value)))})}
                            className="h-14 rounded-2xl border-slate-200 font-bold text-lg focus:ring-primary bg-slate-50/50"
                          />
                        </div>
                      </div>
                    )}
                    
                    <BooleanButton 
                      label="Eliminação realizada?" 
                      value={routineData.elimination} 
                      onChange={(v) => setRoutineData({...routineData, elimination: v})} 
                    />
                    {routineData.elimination && (
                      <div className="space-y-2 animate-in fade-in zoom-in-95 duration-300">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quantidade eliminada</Label>
                        <Input 
                          type="number" 
                          value={routineData.eliminationAmount} 
                          onChange={(e) => setRoutineData({...routineData, eliminationAmount: Number(e.target.value)})}
                          className="h-14 rounded-2xl border-slate-200 font-bold text-lg focus:ring-primary bg-slate-50/50"
                        />
                      </div>
                    )}

                    <BooleanButton 
                      label="Orientação realizada?" 
                      value={routineData.guidance} 
                      onChange={(v) => setRoutineData({...routineData, guidance: v})} 
                    />

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Observação</Label>
                      <Textarea 
                        placeholder="Descreva observações importantes..."
                        value={routineData.notes}
                        onChange={(e) => setRoutineData({...routineData, notes: e.target.value})}
                        className="min-h-[100px] rounded-2xl border-slate-200 focus:ring-primary p-4 resize-none bg-slate-50/50"
                      />
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {activity === "survey" && (
              <section className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] bg-white overflow-hidden">
                    <CardContent className="p-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Encontrados</p>
                      <p className="text-3xl font-black text-primary">{surveySummary.found}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] bg-white overflow-hidden">
                    <CardContent className="p-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Positivos</p>
                      <p className="text-3xl font-black text-red-500">{surveySummary.positive}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
                      <Bug className="h-4 w-4" /> Checklist de Depósitos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50 border-y border-slate-100">
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Qtd</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Foco</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Trat</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Elim</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {deposits.map((deposit) => (
                            <tr key={deposit.id} className={`transition-colors ${deposit.selected ? 'bg-primary/5' : ''}`}>
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox" 
                                    checked={deposit.selected}
                                    onChange={(e) => updateDeposit(deposit.id, 'selected', e.target.checked)}
                                    className="h-5 w-5 rounded-lg border-2 border-slate-200 text-primary focus:ring-primary transition-all cursor-pointer"
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-primary">{deposit.type}</span>
                                    <span className="text-[10px] font-medium text-slate-500 truncate max-w-[80px]">{deposit.description}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <Input 
                                  type="number" 
                                  value={deposit.quantity}
                                  disabled={!deposit.selected}
                                  onChange={(e) => updateDeposit(deposit.id, 'quantity', Number(e.target.value))}
                                  className="h-10 w-16 rounded-xl border-slate-200 font-bold text-center bg-white"
                                />
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => updateDeposit(deposit.id, 'positive', !deposit.positive)}
                                  disabled={!deposit.selected}
                                  className={`h-8 w-8 rounded-lg flex items-center justify-center mx-auto transition-all ${
                                    deposit.positive ? 'bg-red-500 text-white shadow-lg shadow-red-100' : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {deposit.positive && <CheckCircle2 className="h-4 w-4" />}
                                </button>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => updateDeposit(deposit.id, 'treated', !deposit.treated)}
                                  disabled={!deposit.selected}
                                  className={`h-8 w-8 rounded-lg flex items-center justify-center mx-auto transition-all ${
                                    deposit.treated ? 'bg-blue-500 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {deposit.treated && <Droplets className="h-4 w-4" />}
                                </button>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => updateDeposit(deposit.id, 'eliminated', !deposit.eliminated)}
                                  disabled={!deposit.selected}
                                  className={`h-8 w-8 rounded-lg flex items-center justify-center mx-auto transition-all ${
                                    deposit.eliminated ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {deposit.eliminated && <Trash2 className="h-4 w-4" />}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
                      <FileText className="h-4 w-4" /> Informações Adicionais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <BooleanButton 
                      label="Teve foco?" 
                      value={surveyData.hasFocus} 
                      onChange={(v) => setSurveyData({...surveyData, hasFocus: v})} 
                    />
                    <BooleanButton 
                      label="Coleta realizada?" 
                      value={surveyData.sampleCollected} 
                      onChange={(v) => setSurveyData({...surveyData, sampleCollected: v})} 
                    />
                  </CardContent>
                </Card>
              </section>
            )}

            {activity === "pending" && (
              <section className="space-y-6">
                <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
                      <ShieldCheck className="h-4 w-4" /> Pendência
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <BooleanButton 
                      label="Imóvel recuperado?" 
                      value={pendingData.isRecovered} 
                      onChange={(v) => setPendingData({...pendingData, isRecovered: v})} 
                    />
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Observação</Label>
                      <Textarea 
                        placeholder="Detalhes sobre a pendência..."
                        value={pendingData.notes}
                        onChange={(e) => setPendingData({...pendingData, notes: e.target.value})}
                        className="min-h-[100px] rounded-2xl border-slate-200 focus:ring-primary p-4 resize-none bg-slate-50/50"
                      />
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        )}

        <Button 
          className="w-full h-16 rounded-[2.5rem] text-lg font-black shadow-2xl shadow-primary/30 active:scale-95 transition-all gap-3 bg-primary hover:bg-primary/90"
          onClick={handleSave}
          disabled={isSaving || isUpdatingStatus}
        >
          {isSaving ? (
            <div className="h-6 w-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="h-6 w-6" /> FINALIZAR VISITA
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
