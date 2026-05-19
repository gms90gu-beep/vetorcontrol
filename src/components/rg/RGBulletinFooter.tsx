import { Card, CardContent } from "@/components/ui/card";

interface RGBulletinFooterProps {
  stats: {
    residence: number;
    commerce: number;
    vacant_lot: number;
    strategic_point: number;
    others: number;
    total: number;
    inhabitants: number;
  };
}

export function RGBulletinFooter({ stats }: RGBulletinFooterProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-7 border border-t-0 border-slate-300 bg-slate-50 text-[10px] font-black uppercase tracking-tight divide-x divide-slate-300">
      <div className="p-3 flex flex-col items-center justify-center gap-1">
        <span className="text-slate-500">Residencial (R)</span>
        <span className="text-sm font-black text-slate-900">{stats.residence}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1">
        <span className="text-slate-500">Comercial (C)</span>
        <span className="text-sm font-black text-slate-900">{stats.commerce}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1">
        <span className="text-slate-500">T. Baldio (TB)</span>
        <span className="text-sm font-black text-slate-900">{stats.vacant_lot}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1">
        <span className="text-slate-500">P. Estrat. (PE)</span>
        <span className="text-sm font-black text-slate-900">{stats.strategic_point}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1">
        <span className="text-slate-500">Outros (O)</span>
        <span className="text-sm font-black text-slate-900">{stats.others}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1 bg-slate-900 text-white border-none">
        <span className="text-slate-400">Total Geral</span>
        <span className="text-sm font-black">{stats.total}</span>
      </div>
      <div className="p-3 flex flex-col items-center justify-center gap-1 bg-emerald-600 text-white border-none">
        <span className="text-emerald-200">Total Hab.</span>
        <span className="text-sm font-black">{stats.inhabitants}</span>
      </div>
    </div>
  );
}
