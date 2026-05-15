import { LucideIcon } from "lucide-react";

interface StatusButtonProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  color: string;
  activeColor: string;
  disabled?: boolean;
}

export function StatusButton({ active, onClick, icon: Icon, label, color, activeColor, disabled }: StatusButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-3 p-4 h-28 rounded-[2.5rem] border-2 
        transition-all duration-300 ease-out active:scale-95 touch-manipulation
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${active 
          ? `${activeColor} border-transparent shadow-xl ring-4 ring-offset-2 ring-opacity-20` 
          : `${color} border-current/10 hover:border-current/30`
        }
      `}
    >
      <Icon className={`h-8 w-8 transition-transform duration-300 ${active ? 'scale-110' : 'scale-100'}`} />
      <span className={`text-[11px] font-black uppercase tracking-[0.15em] ${active ? 'opacity-100' : 'opacity-70'}`}>
        {label}
      </span>
      {active && (
        <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-white animate-pulse" />
      )}
    </button>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
  activeColor: string;
  disabled?: boolean;
}

export function ToggleButton({ active, onClick, label, color, activeColor, disabled }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center p-3 rounded-2xl text-[10px] font-black uppercase tracking-wider 
        transition-all duration-300 active:scale-95 touch-manipulation
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${active ? `${activeColor} shadow-md` : `${color} border border-current/5`}
      `}
    >
      {label}
    </button>
  );
}

