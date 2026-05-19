import { Link } from "@tanstack/react-router";
import { 
  CalendarCheck, 
  MapPin, 
  BarChart3, 
  AlertCircle, 
  Map as MapIcon, 
  Settings,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionCardProps {
  title: string;
  description: string;
  icon: any;
  color: string;
  to: string;
  className?: string;
}

function ActionCard({ title, description, icon: Icon, color, to, className }: ActionCardProps) {
  return (
    <Link to={to} className="group block outline-none">
      <div className={cn(
        "relative flex flex-col h-[180px] p-6 rounded-[2.5rem] transition-all duration-500 active:scale-95 shadow-xl hover:shadow-2xl border border-transparent hover:border-white/20 overflow-hidden",
        color,
        className
      )}>
        {/* Animated Background Blur */}
        <div className="absolute -right-4 -top-4 bg-white/20 h-32 w-32 rounded-full blur-3xl group-hover:h-40 group-hover:w-40 transition-all duration-700" />
        
        {/* Icon Container */}
        <div className="bg-white/20 backdrop-blur-xl p-4 rounded-3xl w-fit mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl border border-white/10">
          <Icon className="h-7 w-7 text-white" />
        </div>

        {/* Text Content */}
        <div className="relative z-10 mt-auto">
          <h3 className="text-xl font-black leading-tight tracking-tighter text-white mb-1">{title}</h3>
          <p className="text-[10px] text-white/80 font-black uppercase tracking-widest leading-none truncate pr-4">
            {description}
          </p>
        </div>
        
        {/* Hover Arrow */}
        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500">
          <ChevronRight className="h-5 w-5 text-white/50" />
        </div>
      </div>
    </Link>
  );
}

export function ActionGrid() {
  const actions = [
    { 
      title: "Diário", 
      description: "Trabalho de Campo", 
      icon: CalendarCheck, 
      color: "bg-emerald-500",
      to: "/field-work"
    },
    { 
      title: "RG", 
      description: "Imóveis & Fotos", 
      icon: MapPin, 
      color: "bg-blue-600",
      to: "/rg"
    },
    { 
      title: "Mapa", 
      description: "Visão Territorial", 
      icon: MapIcon, 
      color: "bg-indigo-600",
      to: "/map"
    },
    { 
      title: "Boletim", 
      description: "Relatórios & Stats", 
      icon: BarChart3, 
      color: "bg-slate-900",
      to: "/reports"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {actions.map((action, index) => (
        <ActionCard key={index} {...action} />
      ))}
    </div>
  );
}
