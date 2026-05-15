export function StatusButton({ active, onClick, icon: Icon, label, color, activeColor }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 p-4 h-24 rounded-[2rem] border-2 transition-all active:scale-95 ${active ? activeColor : color}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

export function ToggleButton({ active, onClick, label, color, activeColor }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center p-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${active ? activeColor : color}`}
    >
      {label}
    </button>
  );
}
