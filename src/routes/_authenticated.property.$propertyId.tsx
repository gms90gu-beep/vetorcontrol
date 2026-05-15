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
  Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusButton, ToggleButton } from "@/components/PropertyVisitButtons";

export const Route = createFileRoute("/_authenticated/property/$propertyId")({
  component: PropertyVisitPage,
});

function PropertyVisitPage() {
  const { propertyId } = useParams({ from: "/_authenticated/property/$propertyId" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("visited");
  const [activity, setActivity] = useState<string>("routine");
  const [property, setProperty] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [currentVisitId, setCurrentVisitId] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [routineData, setRoutineData] = useState({ treatment: false, treatmentAmount: 0, elimination: false, eliminationAmount: 0, guidance: false, notes: "" });
  const [surveyData, setSurveyData] = useState({ hasFocus: false, sampleCollected: false });
  const [pendingData, setPendingData] = useState({ isRecovered: false, notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [propertyId]);

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
            .select("id, status, activity_type")
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

            // Load deposits
            const { data: existingDeposits } = await supabase
              .from("visit_deposits")
              .select("*")
              .eq("visit_id", existingVisit.id);
            
            if (existingDeposits) {
              setDeposits(existingDeposits.map(d => ({
                id: d.id,
                type: d.type_code,
                description: d.description,
                quantity: d.quantity,
                positive: d.is_positive,
                treated: d.is_treated,
                eliminated: d.is_eliminated
              })));
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
            visit_date: new Date().toISOString()
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
            activity_type: (activityMap[activity] || "routine") as any 
          })
          .eq("id", visitId);
      }

      // Sync deposits
      // First clear old ones to keep it simple for this session
      await supabase.from("visit_deposits").delete().eq("visit_id", visitId);

      if (deposits.length > 0) {
        const depositsToSave = deposits.map(d => ({
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

  const addDeposit = () => {
    const newId = Date.now();
    setDeposits([...deposits, { 
      id: newId, 
      type: "A1", 
      description: "Caixa d'água", 
      quantity: 1, 
      positive: false, 
      treated: false, 
      eliminated: false 
    }]);
  };

  const removeDeposit = (id: number) => {
    setDeposits(deposits.filter(d => d.id !== id));
  };

  const updateDeposit = (id: number, field: string, value: any) => {
    setDeposits(deposits.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/field-work-list" })} className="rounded-2xl bg-accent/50 active:scale-95 transition-all">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black tracking-tighter text-primary">
            Imóvel {property?.number || "..."}
          </h2>
          <p className="text-sm font-medium text-muted-foreground">
            {property?.street_name || "..."}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-3 block">Situação do Imóvel</Label>
          <div className="grid grid-cols-2 gap-3">
            <StatusButton 
              active={status === "visited"} 
              onClick={() => handleStatusChange("visited")}
              disabled={isUpdatingStatus}
              icon={CheckCircle2} 
              label="Visitado" 
              color="text-emerald-600 bg-emerald-50"
              activeColor="bg-emerald-600 text-white"
            />
            <StatusButton 
              active={status === "closed"} 
              onClick={() => handleStatusChange("closed")}
              disabled={isUpdatingStatus}
              icon={Clock} 
              label="Fechado" 
              color="text-yellow-600 bg-yellow-50"
              activeColor="bg-yellow-600 text-white"
            />
            <StatusButton 
              active={status === "refused"} 
              onClick={() => handleStatusChange("refused")}
              disabled={isUpdatingStatus}
              icon={XCircle} 
              label="Recusado" 
              color="text-red-600 bg-red-50"
              activeColor="bg-red-600 text-white"
            />
            <StatusButton 
              active={status === "abandoned"} 
              onClick={() => handleStatusChange("abandoned")}
              disabled={isUpdatingStatus}
              icon={AlertCircle} 
              label="Abandonado" 
              color="text-gray-600 bg-gray-50"
              activeColor="bg-gray-600 text-white"
            />
          </div>
        </section>

        <section>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-3 block">Tipo de Atividade</Label>
          <Tabs value={activity} onValueChange={setActivity} className="w-full">
            <TabsList className="w-full h-14 bg-accent/30 rounded-2xl p-1 gap-1">
              <TabsTrigger value="routine" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all h-full">Rotina</TabsTrigger>
              <TabsTrigger value="survey" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all h-full">L. Índice</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all h-full">Pendência</TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Depósitos e Focos</Label>
            <Button variant="ghost" size="sm" onClick={addDeposit} className="h-10 text-primary font-black gap-2 rounded-xl hover:bg-primary/5 transition-all">
              <Plus className="h-5 w-5" /> ADICIONAR
            </Button>
          </div>
          
          <div className="space-y-3">
            {deposits.length === 0 && (
              <div className="py-8 px-4 rounded-[2.5rem] border-2 border-dashed border-slate-100 text-center">
                <p className="text-xs font-medium text-slate-400">Nenhum depósito registrado.</p>
              </div>
            )}
            {deposits.map((deposit) => (
              <Card key={deposit.id} className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center font-black text-primary text-lg">
                        {deposit.type}
                      </div>
                      <span className="font-black text-sm text-slate-700 tracking-tight">{deposit.description}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeDeposit(deposit.id)} className="text-red-400 rounded-full hover:bg-red-50 hover:text-red-600 transition-all h-10 w-10">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <ToggleButton 
                      active={deposit.positive} 
                      onClick={() => updateDeposit(deposit.id, 'positive', !deposit.positive)} 
                      label="Foco" 
                      color="bg-red-50 text-red-600"
                      activeColor="bg-red-600 text-white shadow-lg shadow-red-200"
                    />
                    <ToggleButton 
                      active={deposit.treated} 
                      onClick={() => updateDeposit(deposit.id, 'treated', !deposit.treated)} 
                      label="Tratado" 
                      color="bg-blue-50 text-blue-600"
                      activeColor="bg-blue-600 text-white shadow-lg shadow-blue-200"
                    />
                    <ToggleButton 
                      active={deposit.eliminated} 
                      onClick={() => updateDeposit(deposit.id, 'eliminated', !deposit.eliminated)} 
                      label="Eliminado" 
                      color="bg-emerald-50 text-emerald-600"
                      activeColor="bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

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
