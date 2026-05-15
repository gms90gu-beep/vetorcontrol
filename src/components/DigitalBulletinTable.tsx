import { useState } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Home, 
  Store, 
  MapPin, 
  Warehouse,
  History,
  Info,
  ChevronRight,
  MoreVertical,
  FileText
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "visited":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase"><CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Visitado</Badge>;
      case "closed":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase"><Clock className="w-2.5 h-2.5 mr-1" /> Fechado</Badge>;
      case "refused":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase"><XCircle className="w-2.5 h-2.5 mr-1" /> Recusado</Badge>;
      case "abandoned":
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-none rounded-md px-1.5 py-0 text-[9px] font-black uppercase"><AlertCircle className="w-2.5 h-2.5 mr-1" /> Abandonado</Badge>;
      default:
        return <Badge variant="outline" className="border-dashed text-slate-400 rounded-md px-1.5 py-0 text-[9px] font-black uppercase">Não Visitado</Badge>;
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-slate-100">
              <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-slate-500 py-4">Nº Imóvel</TableHead>
              <TableHead className="w-[100px] text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo</TableHead>
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
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((prop) => (
              <TableRow 
                key={prop.id} 
                className="group hover:bg-blue-50/30 cursor-pointer border-slate-50 transition-colors"
                onClick={() => onPropertyClick(prop)}
              >
                <TableCell className="py-4">
                  <span className="text-sm font-black text-slate-900">{prop.number}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(prop.type)}
                    <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[60px]">
                      {prop.type === 'residence' ? 'Res' : prop.type === 'commerce' ? 'Com' : prop.type === 'vacant_lot' ? 'Ter' : 'PE'}
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
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px] block">
                    {prop.observation || "--"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 group-hover:text-blue-500 group-hover:bg-white transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
