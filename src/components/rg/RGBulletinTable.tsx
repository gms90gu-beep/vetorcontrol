import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Align with database Row type for properties
export type Property = {
  id: string;
  number: string;
  complement: string | null;
  type: "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";
  street_name: string | null;
  side: string | null;
  sequence: number | null;
  inhabitants: number | null;
  [key: string]: any; // Allow other fields from the database row
};

interface RGBulletinTableProps {
  properties: Property[];
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
}

export function RGBulletinTable({ properties, onEdit, onDelete }: RGBulletinTableProps) {
  const getTypeCode = (type: string) => {
    switch (type) {
      case "residence": return "R";
      case "commerce": return "C";
      case "vacant_lot": return "TB";
      case "strategic_point": return "PE";
      default: return "O";
    }
  };

  const getFullTypeName = (type: string) => {
    switch (type) {
      case "residence": return "Residencial";
      case "commerce": return "Comercial";
      case "vacant_lot": return "Terreno Baldio";
      case "strategic_point": return "Ponto Estratégico";
      default: return "Outros";
    }
  };

  return (
    <div className="w-full">
      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3 p-4">
        {properties.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100">
            <p className="font-black uppercase text-[10px] tracking-widest">Nenhum imóvel registrado</p>
          </div>
        ) : (
          properties.map((prop, index) => (
            <div 
              key={prop.id || index}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between group active:scale-[0.98] transition-all"
              onClick={() => onEdit(prop)}
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 leading-none">SEQ</span>
                  <span className="text-lg font-black text-slate-900 leading-none">{prop.sequence || index + 1}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-lg font-black text-slate-900">Nº {prop.number}</span>
                    {prop.complement && (
                      <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">{prop.complement}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      prop.type === 'residence' && "bg-blue-50 text-blue-600",
                      prop.type === 'commerce' && "bg-purple-50 text-purple-600",
                      prop.type === 'vacant_lot' && "bg-amber-50 text-amber-600",
                      prop.type === 'strategic_point' && "bg-emerald-50 text-emerald-600"
                    )}>
                      {getFullTypeName(prop.type)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Hab: <span className="text-slate-900">{prop.inhabitants || 0}</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Lado: <span className="text-slate-900">{prop.side || "--"}</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full bg-slate-50 text-slate-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(prop);
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full bg-red-50 text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(prop.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block border border-slate-300 rounded-sm overflow-hidden bg-white shadow-sm mx-6 my-6">
        <Table className="border-collapse">
          <TableHeader className="bg-slate-50 border-b border-slate-300">
            <TableRow className="hover:bg-transparent h-10">
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[120px] text-center">Rua ou Logradouro</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[50px] text-center">Lado</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[60px] text-center">Número</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[40px] text-center">Seq.</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[60px] text-center">Comp.</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[40px] text-center">Tipo</TableHead>
              <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[40px] text-center">Hab.</TableHead>
              <TableHead className="text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 min-w-[80px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-400 font-bold uppercase text-[10px]">
                  Nenhum imóvel registrado neste quarteirão.
                </TableCell>
              </TableRow>
            ) : (
              properties.map((prop, index) => (
                <TableRow key={prop.id || index} className="hover:bg-slate-50 border-b border-slate-200 h-10">
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-800">
                    {prop.street_name || "--"}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-black text-slate-800 text-center">
                    {prop.side || "--"}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-black text-slate-800 text-center">
                    {prop.number}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-black text-slate-800 text-center">
                    {prop.sequence || index + 1}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 text-center">
                    {prop.complement || "--"}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-black text-slate-800 text-center">
                    {getTypeCode(prop.type)}
                  </TableCell>
                  <TableCell className="border-r border-slate-300 px-2 py-1 text-[11px] font-black text-slate-800 text-center">
                    {prop.inhabitants || 0}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-sm hover:bg-slate-200 text-slate-500"
                        onClick={() => onEdit(prop)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-sm hover:bg-red-50 text-red-400"
                        onClick={() => onDelete(prop.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
            {/* Fill empty rows to make it look like a physical sheet */}
            {Array.from({ length: Math.max(0, 10 - properties.length) }).map((_, i) => (
              <TableRow key={`empty-${i}`} className="h-10 border-b border-slate-200">
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell className="border-r border-slate-300"></TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
