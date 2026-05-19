import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, Component, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Car, 
  ChevronLeft, 
  Save, 
  AlertCircle,
  ShieldCheck,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

class ErrorBoundary extends Component<{ children: ReactNode, fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode, fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export const Route = createFileRoute("/_authenticated/vehicles")({
  component: () => (
    <ErrorBoundary fallback={
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h2 className="text-xl font-bold mb-4">Erro ao carregar o cadastro de veículos</h2>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    }>
      <VehicleRegistrationPage />
    </ErrorBoundary>
  ),
});

function VehicleRegistrationPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    placa: '',
    modelo: '',
    marca: '',
    cor: '',
    observacao: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.placa) {
      return toast.error('Informe a placa do veículo');
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Note: This is a placeholder since the table might not exist yet
      // In a real scenario, we would have run the migration first
      const { error } = await supabase
        .from('vehicles')
        .insert([{
          license_plate: form.placa,
          model: form.modelo,
          brand: form.marca,
          color: form.cor,
          observations: form.observacao,
          user_id: user.id
        }]);

      if (error) {
        console.error(error);
        throw error;
      }

      toast.success("Veículo registrado com sucesso!");
      setForm({ placa: '', modelo: '', marca: '', cor: '', observacao: '' });
      // Invalidate queries if using react-query
      // queryClient.invalidateQueries(['vehicles'])
    } catch (error: any) {
      toast.error("Erro ao salvar veículo: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24 max-w-lg mx-auto">
      <div className="flex flex-col gap-4 bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/settings" })} className="rounded-2xl bg-slate-50 active:scale-95 transition-all">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Frota Operacional</span>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 flex items-center gap-2">
              <Car className="h-6 w-6 text-blue-500" /> VEÍCULOS
            </h2>
          </div>
          <div className="w-10" />
        </div>
        <p className="text-sm text-slate-500 font-medium">Cadastre veículos para uso em campo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
              <ClipboardList className="h-4 w-4" /> Dados do Veículo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Placa (Obrigatório)</Label>
              <Input 
                value={form.placa}
                onChange={(e) => setForm({...form, placa: e.target.value.toUpperCase()})}
                placeholder="ABC-1234"
                className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-lg uppercase"
                maxLength={8}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Marca</Label>
                <Input 
                  value={form.marca}
                  onChange={(e) => setForm({...form, marca: e.target.value})}
                  placeholder="Ex: Toyota"
                  className="h-12 rounded-2xl border-slate-100 bg-slate-50 font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Modelo</Label>
                <Input 
                  value={form.modelo}
                  onChange={(e) => setForm({...form, modelo: e.target.value})}
                  placeholder="Ex: Hilux"
                  className="h-12 rounded-2xl border-slate-100 bg-slate-50 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cor</Label>
              <Input 
                value={form.cor}
                onChange={(e) => setForm({...form, cor: e.target.value})}
                placeholder="Ex: Branco"
                className="h-12 rounded-2xl border-slate-100 bg-slate-50 font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações</Label>
              <Textarea 
                value={form.observacao}
                onChange={(e) => setForm({...form, observacao: e.target.value})}
                placeholder="Detalhes adicionais..."
                className="min-h-[100px] rounded-2xl border-slate-100 bg-slate-50 font-medium resize-none p-4"
              />
            </div>
          </CardContent>
        </Card>

        <Button 
          type="submit" 
          disabled={isSaving}
          className="w-full h-16 rounded-[2rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-lg uppercase tracking-widest shadow-xl shadow-blue-500/20 gap-3 active:scale-95 transition-all"
        >
          {isSaving ? (
            <div className="h-6 w-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="h-6 w-6" />
              Salvar Veículo
            </>
          )}
        </Button>
      </form>

      <div className="bg-blue-50 rounded-[2.5rem] p-8 text-center space-y-4 border border-blue-100/50">
        <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <h4 className="font-black text-xl tracking-tight text-slate-800">Uso Obrigatório</h4>
          <p className="text-sm font-medium text-slate-500">O registro do veículo é necessário para o cálculo de deslocamento e reembolso operacional.</p>
        </div>
      </div>
    </div>
  );
}
