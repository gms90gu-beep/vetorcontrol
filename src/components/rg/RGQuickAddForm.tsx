import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type PropertyType = "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";

interface RGQuickAddFormProps {
  onAdd: (data: {
    number: string;
    complement: string;
    type: PropertyType;
    inhabitants: number;
    street_name: string;
    side: string;
    sequence: number;
  }) => void;
  lastSequence: number;
  defaultStreet: string;
  defaultSide: string;
}

export function RGQuickAddForm({ onAdd, lastSequence, defaultStreet, defaultSide }: RGQuickAddFormProps) {
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [type, setType] = useState<PropertyType>("residence");
  const [inhabitants, setInhabitants] = useState<number>(0);
  const [street, setStreet] = useState(defaultStreet);
  const [side, setSide] = useState(defaultSide);
  const [sequence, setSequence] = useState(lastSequence + 1);

  useEffect(() => {
    setStreet(defaultStreet);
    setSide(defaultSide);
    setSequence(lastSequence + 1);
  }, [defaultStreet, defaultSide, lastSequence]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number) return;

    onAdd({
      number,
      complement,
      type,
      inhabitants,
      street_name: street,
      side,
      sequence
    });

    // Reset fields but keep street/side and increment sequence
    setNumber("");
    setComplement("");
    setInhabitants(0);
    setSequence(prev => prev + 1);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900 p-4 rounded-xl shadow-2xl flex flex-col gap-4 text-white">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Rápido: Adicionar Imóvel</h3>
        <span className="text-[10px] font-black text-slate-500 uppercase">Seq: {sequence}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Rua</Label>
          <Input 
            value={street} 
            onChange={(e) => setStreet(e.target.value)}
            className="h-9 bg-slate-800 border-none text-[11px] font-bold focus-visible:ring-emerald-500"
            placeholder="Nome da Rua"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Lado</Label>
          <Input 
            value={side} 
            onChange={(e) => setSide(e.target.value)}
            className="h-9 bg-slate-800 border-none text-[11px] font-black focus-visible:ring-emerald-500 text-center"
            placeholder="Lado"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-1 space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Nº</Label>
          <Input 
            value={number} 
            onChange={(e) => setNumber(e.target.value)}
            className="h-10 bg-slate-800 border-none text-base font-black focus-visible:ring-emerald-500 text-center"
            placeholder="0"
            inputMode="numeric"
          />
        </div>
        <div className="col-span-1 space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Comp.</Label>
          <Input 
            value={complement} 
            onChange={(e) => setComplement(e.target.value)}
            className="h-10 bg-slate-800 border-none text-[11px] font-bold focus-visible:ring-emerald-500"
            placeholder="A, B..."
          />
        </div>
        <div className="col-span-1 space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Tipo</Label>
          <Select value={type} onValueChange={(v: PropertyType) => setType(v)}>
            <SelectTrigger className="h-10 bg-slate-800 border-none text-[11px] font-black focus:ring-emerald-500">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white font-bold">
              <SelectItem value="residence">R</SelectItem>
              <SelectItem value="commerce">C</SelectItem>
              <SelectItem value="vacant_lot">TB</SelectItem>
              <SelectItem value="strategic_point">PE</SelectItem>
              <SelectItem value="others">O</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1 space-y-1">
          <Label className="text-[8px] font-black uppercase text-slate-400">Hab.</Label>
          <Input 
            type="number"
            value={inhabitants} 
            onChange={(e) => setInhabitants(parseInt(e.target.value) || 0)}
            className="h-10 bg-slate-800 border-none text-base font-black focus-visible:ring-emerald-500 text-center"
            placeholder="0"
          />
        </div>
      </div>

      <Button 
        type="submit"
        disabled={!number}
        className={cn(
          "w-full h-12 rounded-lg font-black uppercase tracking-widest text-[11px] gap-2 transition-all",
          number ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-slate-800 text-slate-500"
        )}
      >
        <Plus className="h-5 w-5" />
        Adicionar Imóvel
      </Button>
    </form>
  );
}
