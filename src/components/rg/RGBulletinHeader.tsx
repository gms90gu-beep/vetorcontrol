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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-slate-50 border-b border-slate-200">
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Estado (UF)</Label>
        <Input 
          value={data.uf} 
          onChange={(e) => onChange("uf", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Município</Label>
        <Input 
          value={data.municipio} 
          onChange={(e) => onChange("municipio", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Localidade</Label>
        <Input 
          value={data.localidade} 
          onChange={(e) => onChange("localidade", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sublocal</Label>
        <Input 
          value={data.sublocal} 
          onChange={(e) => onChange("sublocal", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Distrito</Label>
        <Input 
          value={data.distrito} 
          onChange={(e) => onChange("distrito", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Categoria</Label>
        <Input 
          value={data.categoria} 
          onChange={(e) => onChange("categoria", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Quarteirão Nº</Label>
        <Input 
          value={data.quarteirao} 
          onChange={(e) => onChange("quarteirao", e.target.value)}
          className="h-11 text-base font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm text-center"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sequência</Label>
        <Input 
          value={data.sequencia} 
          onChange={(e) => onChange("sequencia", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm text-center"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Lado</Label>
        <Input 
          value={data.lado} 
          onChange={(e) => onChange("lado", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm text-center"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Agente Responsável</Label>
        <Input 
          value={data.agente} 
          onChange={(e) => onChange("agente", e.target.value)}
          className="h-11 text-xs font-black border-slate-200 focus-visible:ring-slate-400 rounded-xl bg-white shadow-sm"
        />
      </div>
    </div>
  );
}
