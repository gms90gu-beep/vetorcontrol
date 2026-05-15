import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
  Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/field-work")({
  component: FieldWorkPage,
});

const BLOCKS = [
  { id: "1", number: "3", street: "Rua das Flores", properties: 45, pending: 12, lastVisit: "10/05/2026" },
  { id: "2", number: "7", street: "Rua Central", properties: 32, pending: 5, lastVisit: "12/05/2026" },
  { id: "3", number: "12", street: "Av. Brasil", properties: 58, pending: 20, lastVisit: "08/05/2026" },
  { id: "4", number: "15", street: "Rua das Palmeiras", properties: 28, pending: 3, lastVisit: "14/05/2026" },
];

function FieldWorkPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const selectedBlock = BLOCKS.find(b => b.id === selectedBlockId);

  const filteredBlocks = BLOCKS.filter(b => 
    b.number.includes(searchQuery) || 
    b.street.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartWork = () => {
    if (!selectedBlockId) {
      toast.error("Por favor, selecione um quarteirão");
      return;
    }
    
    toast.success("Trabalho iniciado com sucesso!");
    // In a real app, we would save the session to Supabase here
    navigate({ to: `/dashboard` }); // Redirect to properties list (which we'll refine next)
  };

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="bg-slate-900 -mx-4 -mt-4 p-8 rounded-b-[3rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Building2 className="h-32 w-32 text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white mb-2">Início de Trabalho</h2>
        <p className="text-slate-400 font-medium">Configure sua jornada diária</p>
      </div>

      <div className="space-y-6 px-1">
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
              placeholder="Buscar quarteirão ou rua..." 
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-md text-base font-bold focus-visible:ring-blue-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredBlocks.map((block) => (
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
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-colors",
                        selectedBlockId === block.id ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                      )}>
                        <span className="text-xl font-black">{block.number}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-lg font-black tracking-tight text-slate-800">{block.street}</span>
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 text-slate-400" />
                          <span className="text-xs font-bold text-slate-500">{block.properties} imóveis</span>
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
                  <p className="text-xl font-black text-slate-800">{selectedBlock.properties}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes</p>
                  <p className="text-xl font-black text-red-500">{selectedBlock.pending}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última Visita</p>
                  <p className="text-xl font-black text-slate-800">{selectedBlock.lastVisit}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ciclo Atual</p>
                  <p className="text-xl font-black text-blue-600">03/2026</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Start Button */}
        <Button 
          className={cn(
            "w-full h-20 rounded-[2.5rem] text-xl font-black shadow-2xl transition-all gap-3 active:scale-95 mt-4",
            selectedBlockId 
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

