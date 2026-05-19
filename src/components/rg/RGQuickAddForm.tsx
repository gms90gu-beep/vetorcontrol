import { useState, useEffect, useRef } from "react";
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
import { Plus, Target } from "lucide-react";
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
  const numberInputRef = useRef<HTMLInputElement>(null);

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
    
    // Auto-focus the number input for the next property
    setTimeout(() => {
      numberInputRef.current?.focus();
    }, 100);
  };

  return (
    <form 
      id="quick-add-form"
      onSubmit={handleSubmit} 
      className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl flex flex-col gap-5 text-white border-4 border-slate-800"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Target className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400">Rápido: Adicionar Imóvel</h3>
        </div>
        <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
          <span className="text-[10px] font-black text-slate-400 uppercase">Seq: {sequence}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Rua/Logradouro</Label>
          <Input 
            value={street} 
            onChange={(e) => setStreet(e.target.value)}
            className="h-12 bg-slate-800 border-none text-[12px] font-bold focus-visible:ring-emerald-500 rounded-2xl"
            placeholder="Nome da Rua"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Lado</Label>
          <Input 
            value={side} 
            onChange={(e) => setSide(e.target.value)}
            className="h-12 bg-slate-800 border-none text-[12px] font-black focus-visible:ring-emerald-500 text-center rounded-2xl"
            placeholder="Lado"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Número</Label>
          <Input 
            ref={numberInputRef}
            value={number} 
            onChange={(e) => setNumber(e.target.value)}
            className="h-14 bg-slate-800 border-none text-2xl font-black focus-visible:ring-emerald-500 text-center rounded-2xl"
            placeholder="0"
            inputMode="numeric"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Comp.</Label>
          <Input 
            value={complement} 
            onChange={(e) => setComplement(e.target.value)}
            className="h-14 bg-slate-800 border-none text-lg font-bold focus-visible:ring-emerald-500 text-center rounded-2xl uppercase"
            placeholder="A, B..."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Tipo Imóvel</Label>
          <Select value={type} onValueChange={(v: PropertyType) => setType(v)}>
            <SelectTrigger className="h-14 bg-slate-800 border-none text-xs font-black focus:ring-emerald-500 rounded-2xl uppercase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white font-bold rounded-2xl">
              <SelectItem value="residence">Residencial</SelectItem>
              <SelectItem value="commerce">Comercial</SelectItem>
              <SelectItem value="vacant_lot">Terreno Baldio</SelectItem>
              <SelectItem value="strategic_point">Ponto Estratégico</SelectItem>
              <SelectItem value="others">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Habitantes</Label>
          <Input 
            type="number"
            value={inhabitants} 
            onChange={(e) => setInhabitants(parseInt(e.target.value) || 0)}
            className="h-14 bg-slate-800 border-none text-2xl font-black focus-visible:ring-emerald-500 text-center rounded-2xl"
            placeholder="0"
            inputMode="numeric"
          />
        </div>
      </div>

      <Button 
        type="submit"
        disabled={!number}
        className={cn(
          "w-full h-16 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 transition-all mt-2",
          number ? "bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-xl shadow-emerald-500/20" : "bg-slate-800 text-slate-600"
        )}
      >
        <Plus className="h-6 w-6" />
        Salvar Imóvel
      </Button>
    </form>
  );
}
