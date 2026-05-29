import { 
  CheckCircle2, 
  Clock, 
  Home, 
  Store, 
  MapPin, 
  Warehouse,
  ChevronRight,
  Navigation,
  HelpCircle
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { translate } from "@/lib/translations";

type Property = {
  id: string;
  number: string;
  complement: string | null;
  type: "residence" | "commerce" | "vacant_lot" | "strategic_point" | "others";
  street_name: string | null;
  neighborhood: string | null;
  block_number: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  container_count: number | null;
  observations: string | null;
  is_abandoned: boolean | null;
  is_frequently_closed: boolean | null;
  had_previous_focus: boolean | null;
  status: "active" | "pending" | "deactivated" | null;
  user_id: string | null;
  block_id?: string | null;
  street_id?: string | null;
};

interface RGDigitalBulletinTableProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
}

export function RGDigitalBulletinTable({ properties, onPropertyClick }: RGDigitalBulletinTableProps) {
  const getTypeIcon = (type: string) => {
    const lowerType = type?.toLowerCase();
    switch (lowerType) {
      case "residence":
      case "residential": return <Home className="w-4 h-4 text-blue-500" />;
      case "commerce":
      case "commercial": return <Store className="w-4 h-4 text-purple-500" />;
      case "vacant_lot": return <MapPin className="w-4 h-4 text-amber-600" />;
      case "strategic_point": return <Warehouse className="w-4 h-4 text-emerald-600" />;
      default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><CheckCircle2 className="w-2.5 h-2.5 mr-1" /> {translate("OPEN")}</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><Clock className="w-2.5 h-2.5 mr-1" /> {translate(status)}</Badge>;
      default:
        return <Badge variant="outline" className="border-dashed text-slate-400 rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap">Novo</Badge>;
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-xl overflow-hidden h-full flex flex-col">
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
            <TableRow className="hover:bg-transparent border-slate-100">
              <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 pl-6 sticky left-0 bg-slate-50/80 backdrop-blur-md z-20">Nº Imóvel</TableHead>
              <TableHead className="w-[100px] text-[10px] font-black uppercase tracking-widest text-slate-500">Comp.</TableHead>
              <TableHead className="w-[100px] text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Situação</TableHead>
              <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">GPS</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Obs.</TableHead>
              <TableHead className="w-[50px] pr-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((prop) => (
              <TableRow 
                key={prop.id} 
                className="group hover:bg-blue-50/30 cursor-pointer border-slate-50 transition-colors"
                onClick={() => onPropertyClick(prop)}
              >
                <TableCell className="py-4 pl-6">
                  <span className="text-sm font-black text-slate-900">{prop.number}</span>
                </TableCell>
                <TableCell>
                  <span className="text-[10px] font-bold text-slate-500 uppercase truncate block max-w-[80px]">
                    {prop.complement || "--"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(prop.type)}
                    <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[80px]">
                      {translate(prop.type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {getStatusBadge(prop.status)}
                </TableCell>
                <TableCell className="text-center">
                  <div className={cn(
                    "h-5 w-5 rounded-full mx-auto border-2 flex items-center justify-center transition-all",
                    prop.latitude ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200"
                  )}>
                    {prop.latitude && <Navigation className="h-3 w-3" />}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] block">
                    {prop.observations || "--"}
                  </span>
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 group-hover:text-blue-500 group-hover:bg-white transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
