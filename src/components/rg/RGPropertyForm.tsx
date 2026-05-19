import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Property } from "@/components/rg/RGBulletinTable";

export function RGPropertyForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData: Property | null;
  onSave: (p: Property) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Partial<Property>>(
    initialData || {
      number: "",
      complement: "",
      type: "residence",
      street_name: "",
      side: "01",
      sequence: 1,
      inhabitants: 0,
      status: "active",
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number) {
      toast.error("Número obrigatório");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const propertyToSave = {
        number: formData.number || "",
        complement: formData.complement || null,
        type: formData.type || "residence",
        street_name: formData.street_name || null,
        side: formData.side || null,
        sequence: formData.sequence || null,
        inhabitants: formData.inhabitants || 0,
        status: formData.status || "active",
        user_id: user.id,
        id: initialData?.id || undefined,
      };

      const { data, error } = await supabase
        .from("properties")
        .upsert(propertyToSave)
        .select()
        .single();

      if (error) throw error;

      onSave(data as Property);
      toast.success(initialData ? "Atualizado!" : "Cadastrado!");
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rua</Label>
          <Input
            value={formData.street_name || ""}
            onChange={(e) => setFormData({ ...formData, street_name: e.target.value })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lado</Label>
          <Input
            value={formData.side || ""}
            onChange={(e) => setFormData({ ...formData, side: e.target.value })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Número</Label>
          <Input
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sequência</Label>
          <Input
            type="number"
            value={formData.sequence || ""}
            onChange={(e) => setFormData({ ...formData, sequence: parseInt(e.target.value) })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Complemento</Label>
          <Input
            value={formData.complement || ""}
            onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Habitantes</Label>
          <Input
            type="number"
            value={formData.inhabitants || 0}
            onChange={(e) => setFormData({ ...formData, inhabitants: parseInt(e.target.value) })}
            className="rounded-xl border-slate-100 bg-slate-50 font-bold"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de Imóvel</Label>
        <Select
          value={formData.type}
          onValueChange={(val: any) => setFormData({ ...formData, type: val })}
        >
          <SelectTrigger className="rounded-xl border-slate-100 bg-slate-50 font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-none shadow-2xl">
            <SelectItem value="residence" className="rounded-xl font-bold">Residencial</SelectItem>
            <SelectItem value="commerce" className="rounded-xl font-bold">Comércio</SelectItem>
            <SelectItem value="vacant_lot" className="rounded-xl font-bold">Terreno Baldio</SelectItem>
            <SelectItem value="strategic_point" className="rounded-xl font-bold">Ponto Estratégico</SelectItem>
            <SelectItem value="others" className="rounded-xl font-bold">Outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="flex-[2] h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest gap-2"
        >
          <Save className="h-4 w-4" /> Salvar
        </Button>
      </div>
    </form>
  );
}
