import { useState, useMemo } from "react";
import { Search, MapPin, ChevronRight, Plus, Box, LayoutGrid } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface Block {
  id: string;
  number: string;
  subarea_id?: string;
  subareas?: {
    name: string;
  };
  total_properties?: number;
  status?: string;
}

interface RGBlockListProps {
  blocks: Block[];
  onSelect: (block: Block) => void;
  onNewBlock: () => void;
  isLoading: boolean;
}

export function RGBlockList({ blocks, onSelect, onNewBlock, isLoading }: RGBlockListProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredBlocks = useMemo(() => {
    return blocks.filter(b => 
      b.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.subareas?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [blocks, searchTerm]);

  const groupedBlocks = useMemo(() => {
    const groups: Record<string, Block[]> = {};
    filteredBlocks.forEach(b => {
      const subareaName = b.subareas?.name || "Sem Subárea";
      if (!groups[subareaName]) groups[subareaName] = [];
      groups[subareaName].push(b);
    });
    return groups;
  }, [filteredBlocks]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-12 w-12 border-4 border-slate-900 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando Quarteirões...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            placeholder="Buscar por número ou subárea..." 
            className="h-14 pl-12 rounded-2xl border-none bg-white shadow-xl font-bold text-slate-900 focus-visible:ring-emerald-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button 
          onClick={onNewBlock}
          className="w-full sm:w-auto h-14 rounded-2xl bg-slate-900 text-emerald-400 font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 gap-2 hover:bg-slate-800 transition-all"
        >
          <Plus className="h-5 w-5" />
          Novo Quarteirão
        </Button>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 gap-6">
          <div className="h-20 w-20 rounded-3xl bg-slate-50 flex items-center justify-center">
            <LayoutGrid className="h-10 w-10 text-slate-300" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black text-slate-900 uppercase">Nenhum quarteirão cadastrado ainda</h3>
            <p className="text-sm font-medium text-slate-400">Comece adicionando o primeiro quarteirão para o RG.</p>
          </div>
          <Button 
            onClick={onNewBlock}
            variant="outline"
            className="h-12 px-8 rounded-xl border-2 border-slate-100 font-black uppercase text-[10px] tracking-widest"
          >
            Adicionar Agora
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedBlocks).map(([subarea, subareaBlocks]) => (
            <div key={subarea} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <Box className="h-4 w-4 text-emerald-500" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{subarea}</h3>
                <div className="h-px flex-1 bg-slate-100" />
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-black rounded-lg border-none">
                  {subareaBlocks.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subareaBlocks.map((block) => (
                  <Card 
                    key={block.id}
                    className="group border-none shadow-md hover:shadow-2xl transition-all duration-300 rounded-[2rem] cursor-pointer bg-white overflow-hidden active:scale-95"
                    onClick={() => onSelect(block)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center text-emerald-400 shadow-xl group-hover:scale-110 transition-transform">
                            <span className="text-xl font-black">{block.number}</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quarteirão</p>
                            <h4 className="text-lg font-black text-slate-900 leading-none">{subarea}</h4>
                          </div>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <ChevronRight className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="mt-6 flex items-center gap-4 pt-4 border-t border-slate-50">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Imóveis</span>
                          <span className="text-sm font-black text-slate-900">{block.total_properties || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status</span>
                          <Badge className={cn(
                            "text-[8px] font-black uppercase tracking-tighter px-2 h-5",
                            block.status === 'finished' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {block.status === 'finished' ? 'Concluído' : 'Em Aberto'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
