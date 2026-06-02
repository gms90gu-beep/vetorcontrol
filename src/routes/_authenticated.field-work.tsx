import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
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
  CalendarDays,
  Plus,
  ChevronDown
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
import { useOperationalDate } from "@/hooks/useOperationalDate";
import { translate } from "@/lib/translations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/field-work")({
  beforeLoad: blockManagersGuard,
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
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const navigate = useNavigate();
  const { allowWeekend } = useOperationalDate();

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

      // Fetch blocks that have properties and are available
      const { data: blocksData } = await supabase
        .from("blocks")
        .select(`*`)

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

    // Weekends are now operational days
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: agent } = await supabase.from("agents").select("work_status").eq("profile_id", user.id).maybeSingle();
      if (agent?.work_status === 'work_completed') {
         // Reset status if starting new session
         await supabase.from("agents").update({ work_status: 'in_work' }).eq("profile_id", user.id);
      }

      const { error } = await supabase.from("field_work_sessions").insert({
        user_id: user.id,
        cycle_id: selectedCycleId,
        week_id: selectedWeekId,
        block_number: selectedBlock?.number || "",
        street_name: "Logradouro",

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
                disabled={undefined}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Seleção do Quarteirão</label>
          </div>

          <Dialog open={isBlockModalOpen} onOpenChange={setIsBlockModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-20 rounded-[2rem] border-none bg-white shadow-lg flex items-center justify-between px-6 active:scale-95 transition-all group",
                  selectedBlockId ? "ring-2 ring-blue-500/20" : ""
                )}
              >
                <div className="flex items-center gap-4 text-left">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                    selectedBlockId ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    {selectedBlockId ? (
                      <span className="text-xl font-black">{selectedBlock?.number}</span>
                    ) : (
                      <MapPin className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-base font-black tracking-tight",
                      selectedBlockId ? "text-slate-800" : "text-slate-400"
                    )}>
                      {selectedBlockId ? `Quarteirão ${selectedBlock?.number}` : "Selecione o quarteirão..."}
                    </span>
                    {selectedBlockId && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedBlock?.total_properties || 0} imóveis</span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] bg-slate-950 border-none shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="p-8 pb-4">
                <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">Quarteirões Disponíveis</DialogTitle>
                <div className="relative mt-4 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                  <Input 
                    placeholder="Buscar quarteirão..." 
                    className="pl-12 h-14 rounded-2xl border-none bg-white/5 text-white placeholder:text-slate-600 font-bold focus-visible:ring-blue-500/20"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] px-4 pb-8">
                <div className="grid grid-cols-1 gap-2 p-4">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Carregando...</p>
                    </div>
                  ) : filteredBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-4">
                      <p className="text-slate-500 font-bold">Nenhum quarteirão encontrado</p>
                    </div>
                  ) : filteredBlocks.map((block) => (
                    <button
                      key={block.id}
                      className={cn(
                        "w-full p-4 rounded-2xl flex items-center justify-between transition-all active:scale-[0.98] text-left",
                        selectedBlockId === block.id 
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      )}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        setIsBlockModalOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center font-black text-lg shadow-inner",
                          selectedBlockId === block.id ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                        )}>
                          {block.number}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-sm uppercase tracking-tight">Quarteirão {block.number}</span>

                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            selectedBlockId === block.id ? "text-white/60" : "text-slate-500"
                          )}>
                            {block.total_properties || 0} imóveis
                          </span>
                        </div>
                      </div>
                      {selectedBlockId === block.id && <CheckCircle2 className="h-5 w-5 text-white" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
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
                    {selectedBlock.status === 'finished' ? 'Concluído' : selectedBlock.status === 'in_progress' ? 'Em Aberto' : translate(selectedBlock.status)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo do Quarteirão</p>
                  <p className="text-xl font-black text-slate-800">Nº {selectedBlock.number}</p>

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
        <div className="pt-4 pb-8">
          <Button 
            className={cn(
              "w-full h-24 rounded-[3rem] text-2xl font-black shadow-2xl transition-all gap-4 active:scale-95 border-4",
              selectedBlockId && selectedCycleId && selectedWeekId
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 border-emerald-400 text-white" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border-slate-300"
            )}
            onClick={handleStartWork}
          >
            INICIAR JORNADA
            <ArrowRight className="h-8 w-8" />
          </Button>
          {(!selectedBlockId || !selectedCycleId || !selectedWeekId) && (
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 animate-pulse">
              Selecione ciclo, semana e quarteirão para liberar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
