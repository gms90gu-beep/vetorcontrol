import { createFileRoute } from "@tanstack/react-router";
import { 
  Map as MapIcon, 
  MapPin, 
  Layers, 
  Navigation2, 
  Search, 
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Maximize2
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
});

function MapPage() {
  const [activeLayer, setActiveLayer] = useState("visits");

  return (
    <div className="h-[calc(100vh-8rem)] w-full flex flex-col gap-4 animate-in fade-in duration-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black tracking-tighter text-primary">Mapa</h2>
        <p className="text-muted-foreground font-medium">Visualização territorial em tempo real</p>
      </div>

      <div className="relative flex-1 rounded-[2.5rem] overflow-hidden shadow-2xl bg-accent/20 border-4 border-white">
        {/* Placeholder for real map */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=1000')] bg-cover bg-center opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/20" />
        
        {/* Map Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        {/* Floating Search */}
        <div className="absolute top-6 left-6 right-6 z-10 flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Buscar rua ou quarteirão..." 
              className="pl-12 h-12 rounded-2xl border-none bg-background/90 backdrop-blur-xl shadow-2xl shadow-black/10 text-sm font-bold focus-visible:ring-primary/30"
            />
          </div>
          <Button variant="secondary" size="icon" className="h-12 w-12 rounded-2xl bg-background/90 backdrop-blur-xl shadow-2xl shadow-black/10 border-none shrink-0 active:scale-95 transition-all">
            <Filter className="h-5 w-5 text-primary" />
          </Button>
        </div>

        {/* Map Markers (Visual Mockup) */}
        <MapMarker x="30%" y="40%" status="visited" label="Q-042" />
        <MapMarker x="60%" y="30%" status="focus" label="Foco" />
        <MapMarker x="45%" y="65%" status="pending" label="Pendente" />
        <MapMarker x="75%" y="55%" status="visited" label="Q-043" />
        <MapMarker x="20%" y="70%" status="visited" label="Q-041" />

        {/* Bottom Controls */}
        <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-2">
              <MapLayerButton active={activeLayer === 'visits'} onClick={() => setActiveLayer('visits')} icon={CheckCircle2} label="Visitas" />
              <MapLayerButton active={activeLayer === 'focus'} onClick={() => setActiveLayer('focus')} icon={AlertTriangle} label="Focos" />
              <MapLayerButton active={activeLayer === 'blocks'} onClick={() => setActiveLayer('blocks')} icon={Layers} label="Quadras" />
            </div>
            
            <div className="flex flex-col gap-2">
              <Button size="icon" className="h-12 w-12 rounded-2xl bg-primary shadow-2xl shadow-primary/40 active:scale-90 transition-all">
                <Navigation2 className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="secondary" className="h-12 w-12 rounded-2xl bg-background/90 backdrop-blur-xl shadow-2xl shadow-black/10 border-none active:scale-90 transition-all">
                <Maximize2 className="h-5 w-5 text-primary" />
              </Button>
            </div>
          </div>

          <Card className="border-none shadow-2xl bg-background/90 backdrop-blur-xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-8 duration-1000">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-black tracking-tight uppercase">Localidade Central</span>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Setor Operacional 04</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-emerald-600 tracking-tight">85%</div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Cobertura</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MapMarker({ x, y, status, label }: any) {
  const colors: any = {
    visited: "bg-emerald-500 shadow-emerald-500/40",
    focus: "bg-red-500 shadow-red-500/40 animate-pulse",
    pending: "bg-yellow-500 shadow-yellow-500/40"
  };

  return (
    <div 
      className="absolute flex flex-col items-center gap-1 group cursor-pointer" 
      style={{ left: x, top: y }}
    >
      <div className={`h-4 w-4 rounded-full border-2 border-white shadow-xl transition-transform group-hover:scale-150 ${colors[status]}`} />
      <div className="px-2 py-0.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-xl text-[8px] font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
        {label}
      </div>
    </div>
  );
}

function MapLayerButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl shadow-black/10 transition-all active:scale-95 ${active ? 'bg-primary text-primary-foreground font-black' : 'bg-background/90 backdrop-blur-xl text-muted-foreground font-bold'}`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-primary'}`} />
      <span className="text-[10px] uppercase tracking-widest">{label}</span>
    </button>
  );
}
