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
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/field-work")({
  component: FieldWorkPage,
});

function FieldWorkPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  const properties = [
    { id: 1, number: "142", street: "Rua das Palmeiras", type: "residence", status: "visited", lastVisit: "Ontem" },
    { id: 2, number: "150", street: "Rua das Palmeiras", type: "commerce", status: "not_visited", lastVisit: "15 dias" },
    { id: 3, number: "158", street: "Rua das Palmeiras", type: "vacant_lot", status: "closed", lastVisit: "7 dias" },
    { id: 4, number: "164", street: "Rua das Palmeiras", type: "residence", status: "refused", lastVisit: "12 dias" },
    { id: 5, number: "172", street: "Rua das Palmeiras", type: "strategic_point", status: "not_visited", lastVisit: "2 dias" },
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Trabalho de Campo</h2>
        <p className="text-muted-foreground font-medium">Quarteirão 042 • Rua das Palmeiras</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative group">
          <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Buscar imóvel..." 
            className="pl-12 h-14 rounded-2xl border-none bg-accent/50 focus-visible:ring-primary/30 text-base font-medium shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" className="w-full" onValueChange={setFilter}>
          <TabsList className="w-full h-12 bg-accent/30 rounded-2xl p-1">
            <TabsTrigger value="all" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-md">Todos</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-md">Pendentes</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-md">Concluídos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-3">
        {properties.map((prop) => (
          <Card 
            key={prop.id} 
            className="border-none shadow-lg hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer rounded-[2rem] overflow-hidden group"
            onClick={() => navigate({ to: `/property/${prop.id}` })}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-accent/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    {getTypeIcon(prop.type)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black tracking-tight">{prop.number}</span>
                      {getStatusBadge(prop.status)}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                      {prop.street}
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-accent/30 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button className="fixed bottom-8 right-8 h-16 w-16 rounded-3xl shadow-2xl shadow-primary/40 p-0 active:scale-90 transition-all z-40">
        <Plus className="h-8 w-8" />
      </Button>
    </div>
  );
}
