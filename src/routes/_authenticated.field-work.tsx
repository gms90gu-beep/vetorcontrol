import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Search, 
  MapPin, 
  ChevronRight, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Users,
  Building2,
  Clock,
  ArrowRight,
  Info,
  Layers,
  CalendarDays
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/field-work")({
  component: FieldWorkPage,
});

function FieldWorkPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [cycles, setCycles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      // Fetch cycles
      const { data: cyclesData } = await supabase
        .from("cycles")
        .select("*")
        .eq("year", new Date().getFullYear())
        .order("number", { ascending: true });
      
      if (cyclesData) {
        setCycles(cyclesData);
        const activeCycle = cyclesData.find(c => c.status === "in_progress") || cyclesData[0];
        if (activeCycle) {
          setSelectedCycleId(activeCycle.id);
          fetchWeeks(activeCycle.id);
        }
      }

      // Fetch blocks
      const { data: blocksData } = await supabase
        .from("blocks")
        .select(`
          *,
          subareas (
            name
          )
        `)
        .order("number", { ascending: true });
      
      if (blocksData) setBlocks(blocksData);

    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWeeks(cycleId: string) {
    try {
      const { data: weeksData } = await supabase
        .from("weeks")
        .select("*")
        .eq("cycle_id", cycleId)
        .order("number", { ascending: true });
      
      if (weeksData) {
        setWeeks(weeksData);
        if (weeksData.length > 0) {
          setSelectedWeekId(weeksData[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching weeks:", error);
    }
  }

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const filteredBlocks = blocks.filter(b => 
    b.number.includes(searchQuery)
  );

  const handleStartWork = async () => {
    if (!selectedBlockId || !selectedCycleId || !selectedWeekId) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("field_work_sessions").insert({
        user_id: user.id,
        cycle_id: selectedCycleId,
        week_id: selectedWeekId,
        block_number: selectedBlock?.number || "",
        street_name: selectedBlock?.subareas?.name || "Rua",
        property_count: selectedBlock?.total_properties || 0,
        session_date: date.toISOString().split('T')[0],
        status: "in_progress"
      });

      if (error) throw error;

      toast.success("Trabalho iniciado com sucesso!");
      navigate({ to: `/field-work-list` });
    } catch (error: any) {
      toast.error("Erro ao iniciar trabalho: " + error.message);
    }
  };

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="bg-slate-900 -mx-4 -mt-4 p-8 rounded-b-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Building2 className="h-32 w-32 text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white mb-2 underline underline-offset-8 decoration-blue-500/30">Início de Trabalho</h2>
        <p className="text-slate-400 font-medium">Configure sua jornada diária</p>
      </div>

      <div className="space-y-6 px-1">
        {/* Cycle and Week Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Ciclo</label>
            <Select value={selectedCycleId} onValueChange={(val) => {
              setSelectedCycleId(val);
              fetchWeeks(val);
            }}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-md text-sm font-bold active:scale-95 transition-all">
                <Layers className="h-4 w-4 mr-2 text-blue-500" />
                <SelectValue placeholder="Ciclo" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                {cycles.map(c => (
                  <SelectItem key={c.id} value={c.id} className="rounded-xl font-bold">Ciclo {c.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Semana</label>
            <Select value={selectedWeekId} onValueChange={setSelectedWeekId}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-md text-sm font-bold active:scale-95 transition-all">
                <CalendarDays className="h-4 w-4 mr-2 text-blue-500" />
                <SelectValue placeholder="Semana" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                {weeks.map(w => (
                  <SelectItem key={w.id} value={w.id} className="rounded-xl font-bold">Semana {w.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date Selection */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Data da Atividade</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-16 rounded-2xl border-none bg-white shadow-md text-left font-bold text-lg justify-start px-5 active:scale-95 transition-all",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-3 h-6 w-6 text-blue-500" />
                {date ? format(date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-3xl overflow-hidden border-none shadow-2xl" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                locale={ptBR}
                className="bg-white"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Block Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Seleção do Quarteirão</label>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-bold rounded-lg border-none">
              {filteredBlocks.length} disponíveis
            </Badge>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <Input 
              placeholder="Buscar quarteirão pelo número..." 
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-md text-base font-bold focus-visible:ring-blue-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoading ? (
               <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
              </div>
            ) : filteredBlocks.map((block) => (
              <Card 
                key={block.id}
                className={cn(
                  "border-2 transition-all duration-300 rounded-3xl cursor-pointer active:scale-95",
                  selectedBlockId === block.id 
                    ? "border-blue-500 bg-blue-50 shadow-blue-100" 
                    : "border-transparent bg-white shadow-md hover:shadow-lg"
                )}
                onClick={() => setSelectedBlockId(block.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                        selectedBlockId === block.id ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                      )}>
                        <span className="text-xl font-black">{block.number}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-lg font-black tracking-tight text-slate-800">
                          {block.subareas?.name || "Sem Rua"}
                        </span>
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 text-slate-400" />
                          <span className="text-xs font-bold text-slate-500">{block.total_properties || 0} imóveis</span>
                        </div>
                      </div>
                    </div>
                    {selectedBlockId === block.id && (
                      <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Summary (Conditional) */}
        {selectedBlock && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            <Card className="border-none shadow-xl bg-slate-50 rounded-[2.5rem] overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Resumo do Quarteirão {selectedBlock.number}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 p-5">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Imóveis</p>
                  <p className="text-xl font-black text-slate-800">{selectedBlock.total_properties || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                  <p className={cn(
                    "text-xl font-black uppercase tracking-tighter",
                    selectedBlock.status === 'finished' ? 'text-emerald-500' : 'text-blue-500'
                  )}>
                    {selectedBlock.status === 'finished' ? 'Concluído' : selectedBlock.status === 'in_progress' ? 'Em Aberto' : 'Não Iniciado'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bairro/Subárea</p>
                  <p className="text-xl font-black text-slate-800">{selectedBlock.subareas?.name || "--"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ciclo Selecionado</p>
                  <p className="text-xl font-black text-blue-600">
                    {cycles.find(c => c.id === selectedCycleId)?.number || "--"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Start Button */}
        <Button 
          className={cn(
            "w-full h-20 rounded-[2.5rem] text-xl font-black shadow-2xl transition-all gap-3 active:scale-95 mt-4",
            selectedBlockId && selectedCycleId && selectedWeekId
              ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200" 
              : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
          )}
          onClick={handleStartWork}
        >
          Iniciar Trabalho
          <ArrowRight className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
