import { Card } from "@/components/ui/card";
import { Map as MapIcon, Maximize2, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function MiniMapCard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Visão do Território</h3>
        <Link to="/map">
          <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Mapa Full</span>
        </Link>
      </div>

      <Card className="border-none shadow-xl bg-slate-200 dark:bg-slate-800 rounded-[2.5rem] overflow-hidden relative h-[220px] group">
        {/* Placeholder for real map */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1000')] bg-cover bg-center opacity-60 dark:opacity-40 grayscale group-hover:scale-110 transition-transform duration-[10s]" />
        
        {/* Map Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-slate-900/10 dark:bg-slate-900/30" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        {/* Floating Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button className="h-8 w-8 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-center shadow-lg active:scale-90 transition-all border border-black/5">
            <Maximize2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Current Location Marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-[0_0_15px_rgba(37,99,235,0.8)] animate-pulse" />
          <div className="mt-2 bg-slate-900/90 text-white text-[8px] font-black px-2 py-1 rounded-lg backdrop-blur-md uppercase tracking-widest border border-white/10 whitespace-nowrap">
            Você está aqui
          </div>
        </div>

        {/* Stats Overlay Bottom */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl p-3 border border-black/5 dark:border-white/10 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-2">
              <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-xl">
                <MapPin className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-tighter text-slate-900 dark:text-white">Q. 045 • Centro</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Aprox. 12 imóveis rest.</p>
              </div>
            </div>
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all">
               <MapIcon className="h-4 w-4" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
