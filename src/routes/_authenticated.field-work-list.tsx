import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { 
  Search, 
  MapPin, 
  ChevronRight, 
  Filter,
  Home,
  Store,
  Warehouse,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/field-work-list")({
  component: FieldWorkListPage,
});

function FieldWorkListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  const properties = [
    { id: 1, number: "142", street: "Rua das Flores", type: "residence", status: "visited", lastVisit: "Ontem" },
    { id: 2, number: "150", street: "Rua das Flores", type: "commerce", status: "not_visited", lastVisit: "15 dias" },
    { id: 3, number: "158", street: "Rua das Flores", type: "vacant_lot", status: "closed", lastVisit: "7 dias" },
    { id: 4, number: "164", street: "Rua das Flores", type: "residence", status: "refused", lastVisit: "12 dias" },
    { id: 5, number: "172", street: "Rua das Flores", type: "strategic_point", status: "not_visited", lastVisit: "2 dias" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "visited":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="w-3 h-3 mr-1" /> Visitado</Badge>;
      case "closed":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><XCircle className="w-3 h-3 mr-1" /> Fechado</Badge>;
      case "refused":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"><AlertCircle className="w-3 h-3 mr-1" /> Recusado</Badge>;
      default:
        return <Badge variant="outline" className="border-dashed text-muted-foreground rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Não Visitado</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "residence": return <Home className="w-5 h-5 text-blue-500" />;
      case "commerce": return <Store className="w-5 h-5 text-purple-500" />;
      case "vacant_lot": return <MapPin className="w-5 h-5 text-amber-600" />;
      case "strategic_point": return <Warehouse className="w-5 h-5 text-emerald-600" />;
      default: return <Home className="w-5 h-5" />;
    }
  };

  return (
    <div className="pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/field-work' })} className="rounded-full">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Lista de Imóveis</h2>
          <p className="text-sm font-medium text-slate-500">Quarteirão 3 • Rua das Flores</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative group">
          <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <Input 
            placeholder="Buscar imóvel pelo número..." 
            className="pl-12 h-14 rounded-2xl border-none bg-white shadow-md text-base font-bold focus-visible:ring-blue-500/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" className="w-full" onValueChange={setFilter}>
          <TabsList className="w-full h-12 bg-slate-100 rounded-2xl p-1">
            <TabsTrigger value="all" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">Todos</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">Pendentes</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">Concluídos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-3">
        {properties.map((prop) => (
          <Card 
            key={prop.id} 
            className="border-none shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer rounded-[2rem] overflow-hidden group bg-white"
            onClick={() => navigate({ to: `/property/${prop.id}` })}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    {getTypeIcon(prop.type)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black tracking-tight text-slate-800">{prop.number}</span>
                      {getStatusBadge(prop.status)}
                    </div>
                    <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 transition-colors">
                      {prop.street}
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button className="fixed bottom-24 right-6 h-16 w-16 rounded-[2rem] shadow-2xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 p-0 active:scale-90 transition-all z-40">
        <Plus className="h-8 w-8 text-white" />
      </Button>
    </div>
  );
}
