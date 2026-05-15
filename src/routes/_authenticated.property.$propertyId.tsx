import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Save,
  Droplet,
  Trash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/property/$propertyId")({
  component: PropertyVisitPage,
});

function PropertyVisitPage() {
  const { propertyId } = useParams({ from: "/_authenticated/property/$propertyId" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<any>("visited");
  const [activity, setActivity] = useState<any>("routine");
  const [property, setProperty] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [propertyId]);

  async function fetchData() {
    try {
      // Get property details
      const { data: propData } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .single();
      
      if (propData) setProperty(propData);

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
          .single();
        
        if (session) setActiveSession(session);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }

  const handleSave = async () => {
    if (!activeSession) {
      toast.error("Nenhuma sessão de trabalho ativa encontrada.");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Create the visit
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert({
          property_id: propertyId,
          agent_id: user.id,
          cycle_id: activeSession.cycle_id,
          week_id: activeSession.week_id,
          status: status,
          activity_type: activity === "routine" ? "routine" : activity === "survey" ? "infestation_survey" : "pending",
          visit_date: new Date().toISOString()
        })
        .select()
        .single();

      if (visitError) throw visitError;

      // 2. Save deposits if any
      if (deposits.length > 0) {
        const depositsToSave = deposits.map(d => ({
          visit_id: visit.id,
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

      toast.success("Visita registrada com sucesso!");
      navigate({ to: "/field-work-list" });
    } catch (error: any) {
      toast.error("Erro ao salvar visita: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const addDeposit = () => {
    const newId = deposits.length + 1;
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
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

      <div className="space-y-4">
        <section>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-2 block">Situação do Imóvel</Label>
          <div className="grid grid-cols-2 gap-2">
            <StatusButton 
              active={status === "visited"} 
              onClick={() => setStatus("visited")}
              icon={CheckCircle2} 
              label="Visitado" 
              color="bg-emerald-50 text-emerald-600 border-emerald-200"
              activeColor="bg-emerald-600 text-white border-emerald-600"
            />
            <StatusButton 
              active={status === "closed"} 
              onClick={() => setStatus("closed")}
              icon={Clock} 
              label="Fechado" 
              color="bg-yellow-50 text-yellow-600 border-yellow-200"
              activeColor="bg-yellow-600 text-white border-yellow-600"
            />
            <StatusButton 
              active={status === "refused"} 
              onClick={() => setStatus("refused")}
              icon={XCircle} 
              label="Recusado" 
              color="bg-red-50 text-red-600 border-red-200"
              activeColor="bg-red-600 text-white border-red-600"
            />
            <StatusButton 
              active={status === "abandoned"} 
              onClick={() => setStatus("abandoned")}
              icon={AlertCircle} 
              label="Abandonado" 
              color="bg-gray-50 text-gray-600 border-gray-200"
              activeColor="bg-gray-600 text-white border-gray-600"
            />
          </div>
        </section>

        <section>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-2 block">Tipo de Atividade</Label>
          <Tabs value={activity} onValueChange={setActivity} className="w-full">
            <TabsList className="w-full h-12 bg-accent/30 rounded-2xl p-1">
              <TabsTrigger value="routine" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background transition-all">Rotina</TabsTrigger>
              <TabsTrigger value="survey" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background transition-all">L. Índice</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background transition-all">Pendência</TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between ml-1">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Depósitos e Focos</Label>
            <Button variant="ghost" size="sm" onClick={addDeposit} className="h-8 text-primary font-bold gap-1 rounded-xl hover:bg-primary/10 transition-all">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          
          <div className="space-y-3">
            {deposits.map((deposit) => (
              <Card key={deposit.id} className="border-none shadow-lg rounded-[2rem] overflow-hidden bg-white">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary">
                        {deposit.type}
                      </div>
                      <span className="font-bold text-sm">{deposit.description}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeDeposit(deposit.id)} className="text-red-500 rounded-full hover:bg-red-50 transition-all">
                      <Trash2 className="h-4 w-4" />
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
          className="w-full h-16 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/30 active:scale-95 transition-all gap-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="h-6 w-6" /> Finalizar Visita
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusButton({ active, onClick, icon: Icon, label, color, activeColor }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 p-4 h-24 rounded-[2rem] border-2 transition-all active:scale-95 ${active ? activeColor : color}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function ToggleButton({ active, onClick, label, color, activeColor }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center p-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${active ? activeColor : color}`}
    >
      {label}
    </button>
  );
}
