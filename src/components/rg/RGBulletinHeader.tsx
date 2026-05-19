import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RGBulletinHeaderProps {
  data: {
    uf: string;
    municipio: string;
    localidade: string;
    sublocal: string;
    distrito: string;
    categoria: string;
    quarteirao: string;
    sequencia: string;
    lado: string;
    agente: string;
  };
  onChange: (field: string, value: string) => void;
}

export function RGBulletinHeader({ data, onChange }: RGBulletinHeaderProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-tight">
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">UF</Label>
        <Input 
          value={data.uf} 
          onChange={(e) => onChange("uf", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Município</Label>
        <Input 
          value={data.municipio} 
          onChange={(e) => onChange("municipio", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Localidade</Label>
        <Input 
          value={data.localidade} 
          onChange={(e) => onChange("localidade", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Sublocal</Label>
        <Input 
          value={data.sublocal} 
          onChange={(e) => onChange("sublocal", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Distrito</Label>
        <Input 
          value={data.distrito} 
          onChange={(e) => onChange("distrito", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Categoria</Label>
        <Input 
          value={data.categoria} 
          onChange={(e) => onChange("categoria", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Quarteirão Nº</Label>
        <Input 
          value={data.quarteirao} 
          onChange={(e) => onChange("quarteirao", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Sequência</Label>
        <Input 
          value={data.sequencia} 
          onChange={(e) => onChange("sequencia", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Lado</Label>
        <Input 
          value={data.lado} 
          onChange={(e) => onChange("lado", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[9px] text-slate-500">Agente</Label>
        <Input 
          value={data.agente} 
          onChange={(e) => onChange("agente", e.target.value)}
          className="h-8 text-[11px] font-black border-slate-300 focus-visible:ring-slate-400 rounded-sm"
        />
      </div>
    </div>
  );
}
