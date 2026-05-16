import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Home, 
  Store, 
  MapPin, 
  Warehouse,
  ChevronRight,
  ClipboardList
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

interface Property {
  id: string;
  number: string;
  type: string;
  status: string;
  street_name: string;
  has_focus?: boolean;
  treatment_applied?: boolean;
  is_pending?: boolean;
  observation?: string;
}

interface DigitalBulletinTableProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
  onStatusUpdate: (propertyId: string, status: string) => void;
  indexSurvey?: boolean;
}

export function DigitalBulletinTable({ properties, onPropertyClick, onStatusUpdate, indexSurvey }: DigitalBulletinTableProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "residence": return <Home className="w-4 h-4 text-blue-500" />;
      case "commerce": return <Store className="w-4 h-4 text-purple-500" />;
      case "vacant_lot": return <MapPin className="w-4 h-4 text-amber-600" />;
      case "strategic_point": return <Warehouse className="w-4 h-4 text-emerald-600" />;
      default: return <Home className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'residence': return 'Residencial';
      case 'commerce': return 'Comercial';
      case 'vacant_lot': return 'Terreno Baldio';
      case 'strategic_point': return 'Ponto Estratégico';
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "visited":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Visitado</Badge>;
      case "closed":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><Clock className="w-2.5 h-2.5 mr-1" /> Fechado</Badge>;
      case "refused":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><XCircle className="w-2.5 h-2.5 mr-1" /> Recusado</Badge>;
      case "abandoned":
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap"><AlertCircle className="w-2.5 h-2.5 mr-1" /> Abandonado</Badge>;
      default:
        return <Badge variant="outline" className="border-dashed text-slate-400 rounded-md px-1.5 py-0 text-[9px] font-black uppercase whitespace-nowrap">Não Visitado</Badge>;
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] md:border md:border-slate-100 md:shadow-xl overflow-hidden h-full flex flex-col">
      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4 p-4">
        {properties.map((prop) => (
          <div 
            key={prop.id}
            onClick={() => onPropertyClick(prop)}
            className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm active:scale-[0.98] transition-all relative overflow-hidden group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-900 font-black text-lg">
                  {prop.number}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {getTypeIcon(prop.type)}
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {getTypeLabel(prop.type)}
                    </span>
                  </div>
                  {getStatusBadge(prop.status)}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-active:text-blue-500" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className={cn(
                "flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all",
                prop.treatment_applied ? "bg-blue-50 border-blue-200" : "border-slate-50 bg-slate-50/50"
              )}>
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center mb-1",
                  prop.treatment_applied ? "bg-blue-500 text-white" : "text-slate-300"
                )}>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-widest", prop.treatment_applied ? "text-blue-600" : "text-slate-400")}>
                  Tratado
                </span>
              </div>

              <div className={cn(
                "flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all",
                prop.has_focus ? "bg-red-50 border-red-200" : "border-slate-50 bg-slate-50/50"
              )}>
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center mb-1",
                  prop.has_focus ? "bg-red-500 text-white animate-pulse" : "text-slate-300"
                )}>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-widest", prop.has_focus ? "text-red-600" : "text-slate-400")}>
                  Foco
                </span>
              </div>

              <div className={cn(
                "flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all",
                prop.is_pending ? "bg-orange-50 border-orange-200" : "border-slate-50 bg-slate-50/50"
              )}>
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center mb-1",
                  prop.is_pending ? "bg-orange-500 text-white" : "text-slate-300"
                )}>
                  <Clock className="h-4 w-4" />
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-widest", prop.is_pending ? "text-orange-600" : "text-slate-400")}>
                  Pendente
                </span>
              </div>
            </div>

            {prop.observation && (
              <div className="mt-4 pt-4 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 font-medium italic">
                  "{prop.observation}"
                </p>
              </div>
            )}
            
            {indexSurvey && (
              <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Depósitos:</span>
                  <span className="text-[10px] font-bold text-blue-500">--</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Coletas:</span>
                  <span className="text-[10px] font-bold text-amber-500">--</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 pl-6 sticky left-0 bg-slate-50/80 backdrop-blur-md z-20">Nº Imóvel</TableHead>
                <TableHead className="w-[120px] text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">Situação</TableHead>
                <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Trat.</TableHead>
                <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Foco</TableHead>
                <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Pend.</TableHead>
                {indexSurvey && (
                  <>
                    <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Dep.</TableHead>
                    <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Col.</TableHead>
                  </>
                )}
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
                    <div className="flex items-center gap-2">
                      {getTypeIcon(prop.type)}
                      <span className="text-[10px] font-bold text-slate-500 uppercase truncate">
                        {getTypeLabel(prop.type)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(prop.status)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className={cn(
                      "h-5 w-5 rounded-full mx-auto border-2 flex items-center justify-center transition-all",
                      prop.treatment_applied ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200"
                    )}>
                      {prop.treatment_applied && <CheckCircle2 className="h-3 w-3" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className={cn(
                      "h-5 w-5 rounded-full mx-auto border-2 flex items-center justify-center transition-all",
                      prop.has_focus ? "bg-red-500 border-red-500 text-white animate-pulse" : "border-slate-200"
                    )}>
                      {prop.has_focus && <AlertCircle className="h-3 w-3" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className={cn(
                      "h-5 w-5 rounded-full mx-auto border-2 flex items-center justify-center transition-all",
                      prop.is_pending ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200"
                    )}>
                      {prop.is_pending && <Clock className="h-3 w-3" />}
                    </div>
                  </TableCell>
                  {indexSurvey && (
                    <>
                      <TableCell className="text-center">
                        <span className="text-[10px] font-bold text-blue-500">--</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-[10px] font-bold text-amber-500">--</span>
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] block">
                      {prop.observation || "--"}
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
    </div>
  );
}
