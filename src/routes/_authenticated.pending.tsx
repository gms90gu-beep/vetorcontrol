import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { 
  AlertTriangle, 
  ChevronRight, 
  MapPin, 
  Clock, 
  Home, 
  Calendar,
  CheckCircle2,
  Phone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/pending")({
  component: PendingPage,
});

function PendingPage() {
  const [pendencies] = useState([
    { id: 1, number: "158", street: "Rua das Palmeiras", block: "042", status: "closed", days: 3, lastAttempt: "12/05" },
    { id: 2, number: "164", street: "Rua das Palmeiras", block: "042", status: "refused", days: 1, lastAttempt: "14/05" },
    { id: 3, number: "201", street: "Rua das Palmeiras", block: "042", status: "closed", days: 5, lastAttempt: "10/05" },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Pendências</h2>
        <p className="text-muted-foreground font-medium">Imóveis fechados ou com recusa</p>
      </div>

      <div className="space-y-4">
        {pendencies.map((pend) => (
          <Card key={pend.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden group">
            <CardContent className="p-0">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-16 w-16 rounded-[1.5rem] flex items-center justify-center shadow-inner ${pend.status === 'closed' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      <Home className="h-8 w-8" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black tracking-tighter">{pend.number}</span>
                        <Badge variant="outline" className={`rounded-lg font-bold text-[10px] uppercase tracking-wider border-none ${pend.status === 'closed' ? 'bg-yellow-100/50 text-yellow-700' : 'bg-red-100/50 text-red-700'}`}>
                          {pend.status === 'closed' ? 'Fechado' : 'Recusado'}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">{pend.street}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black tracking-tight text-primary">{pend.days}d</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pendente</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground bg-accent/30 p-3 rounded-2xl">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Última: {pend.lastAttempt}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Q: {pend.block}
                  </div>
                </div>
              </div>

              <div className="flex border-t border-accent/50 bg-accent/5 p-2 gap-2">
                <Button className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-95 transition-all gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Recuperar
                </Button>
                <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest border-none bg-background hover:bg-accent active:scale-95 transition-all gap-2">
                  <Clock className="h-4 w-4" /> Adiar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-primary/5 rounded-[2.5rem] p-8 text-center space-y-4">
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
          <Phone className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <h4 className="font-black text-xl tracking-tight">Precisa de Ajuda?</h4>
          <p className="text-sm font-medium text-muted-foreground">Contate seu supervisor para agendamentos especiais em imóveis fechados.</p>
        </div>
        <Button variant="link" className="text-primary font-bold uppercase tracking-widest text-xs">Falar com Supervisor</Button>
      </div>
    </div>
  );
}
