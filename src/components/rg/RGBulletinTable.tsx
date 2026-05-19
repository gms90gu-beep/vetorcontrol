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
type Property = {
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

  return (
    <div className="border border-slate-300 rounded-sm overflow-hidden bg-white shadow-sm">
      <Table className="border-collapse">
        <TableHeader className="bg-slate-50 border-b border-slate-300">
          <TableRow className="hover:bg-transparent h-10">
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[20%] text-center">Rua ou Logradouro</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[10%] text-center">Lado</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[10%] text-center">Número</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[10%] text-center">Seq.</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[15%] text-center">Comp.</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[10%] text-center">Tipo</TableHead>
            <TableHead className="border-r border-slate-300 text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[10%] text-center">Hab.</TableHead>
            <TableHead className="text-[9px] font-black uppercase text-slate-600 px-2 py-0 h-10 w-[15%] text-center">Ações</TableHead>
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
  );
}
