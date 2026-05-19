import { useState } from "react";
import { Plus, MapPin, Camera, AlertTriangle, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

export function QuickActionsFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    { label: "Nova Visita", icon: Plus, color: "bg-emerald-500", onClick: () => navigate({ to: "/field-work" }) },
    { label: "Novo RG", icon: MapPin, color: "bg-blue-600", onClick: () => navigate({ to: "/rg" }) },
    { label: "Via Foto", icon: Camera, color: "bg-indigo-600", onClick: () => navigate({ to: "/rg" }) },
    { label: "Foco (+)", icon: AlertTriangle, color: "bg-red-500", onClick: () => navigate({ to: "/field-work" }) },
    { label: "Revisita", icon: History, color: "bg-amber-500", onClick: () => navigate({ to: "/pending" }) },
  ];

  return (
    <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <div className="flex flex-col items-end gap-3 mb-2 pointer-events-auto">
            {actions.map((action, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ delay: (actions.length - 1 - idx) * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className="bg-slate-900/90 text-white text-[10px] font-black px-3 py-1.5 rounded-xl backdrop-blur-md shadow-xl uppercase tracking-widest border border-white/10">
                  {action.label}
                </span>
                <button
                  onClick={() => {
                    action.onClick();
                    setIsOpen(false);
                  }}
                  className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-2xl transition-all active:scale-90 border border-white/10",
                    action.color
                  )}
                >
                  <action.icon className="h-5 w-5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-16 w-16 rounded-[1.8rem] flex items-center justify-center shadow-[0_15px_30px_rgba(37,99,235,0.4)] transition-all active:scale-90 pointer-events-auto border-4 border-white dark:border-slate-950 relative z-10",
          isOpen ? "bg-slate-900 text-white" : "bg-blue-600 text-white"
        )}
      >
        {isOpen ? <X className="h-7 w-7" /> : <Plus className="h-8 w-8" />}
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[-1] pointer-events-auto"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
