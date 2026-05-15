import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { 
  FileText, 
  Download, 
  Share2, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Mail,
  MessageSquare
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [reports] = useState([
    { id: 1, type: "daily", date: "15/05/2026", title: "Boletim Diário", status: "Gerado" },
    { id: 2, type: "weekly", date: "11/05 - 17/05", title: "Resumo Semanal", status: "Gerado" },
    { id: 3, type: "cycle", date: "Ciclo 03/2026", title: "Fechamento de Ciclo", status: "Aberto" },
  ]);

  const handleShare = (title: string) => {
    toast.success(`Compartilhando ${title}...`);
  };

  const handleDownload = (title: string) => {
    toast.success(`Iniciando download de ${title}...`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Relatórios</h2>
        <p className="text-muted-foreground font-medium">Geração automática de boletins oficiais</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden group hover:scale-[1.02] transition-all">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                  <FileText className="h-7 w-7" />
                </div>
                <Badge variant={report.status === "Gerado" ? "secondary" : "outline"} className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
                  {report.status}
                </Badge>
              </div>
              <CardTitle className="text-xl font-black tracking-tight">{report.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {report.date}
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-accent/50 bg-accent/10">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-2xl h-12 font-bold text-[10px] uppercase tracking-widest border-none bg-background hover:bg-accent active:scale-95 transition-all gap-2"
                  onClick={() => handleDownload(report.title)}
                >
                  <Download className="h-4 w-4" /> Baixar
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-2xl h-12 font-bold text-[10px] uppercase tracking-widest border-none bg-background hover:bg-accent active:scale-95 transition-all gap-2"
                  onClick={() => handleShare(report.title)}
                >
                  <Share2 className="h-4 w-4" /> Compartilhar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between ml-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Estatísticas do Período</h3>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-lg px-2 py-0.5 text-[10px] font-bold">
            <TrendingUp className="w-3 h-3 mr-1" /> Meta Alcançada
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <QuickStat icon={CheckCircle2} label="Inspecionados" value="842" color="text-emerald-500" />
          <QuickStat icon={XCircle} label="Fechados" value="56" color="text-yellow-500" />
          <QuickStat icon={AlertTriangle} label="Focos" value="12" color="text-red-500" />
          <QuickStat icon={TrendingUp} label="Produtividade" value="98%" color="text-blue-500" />
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <Button className="w-full h-16 rounded-[2rem] text-sm font-bold shadow-xl shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 transition-all gap-2">
          <MessageSquare className="h-5 w-5" /> Enviar para Supervisor via WhatsApp
        </Button>
        <Button variant="outline" className="w-full h-16 rounded-[2rem] text-sm font-bold border-none bg-accent/30 hover:bg-accent/50 transition-all gap-2">
          <Mail className="h-5 w-5" /> Enviar por E-mail
        </Button>
      </div>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="border-none shadow-md bg-card rounded-[1.5rem] overflow-hidden">
      <CardContent className="p-4 flex flex-col items-center text-center gap-1">
        <div className={`p-2 rounded-xl bg-accent/50 mb-1 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xl font-black">{value}</div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
