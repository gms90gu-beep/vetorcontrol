import { WifiOff, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@tanstack/react-router";

/**
 * Componente bloqueante para áreas que requerem conexão online.
 * Exibe uma tela clara informando que o recurso só está disponível com internet.
 *
 * Uso:
 * if (!online) return <OfflineNotAvailable feature="Relatórios" />;
 */
export function OfflineNotAvailable({ feature = "Este recurso" }: { feature?: string }) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Ícone */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-100 rounded-full blur-xl opacity-50" />
            <div className="relative bg-white rounded-full p-6 shadow-lg">
              <WifiOff className="h-12 w-12 text-red-500 mx-auto" />
            </div>
          </div>
        </div>

        {/* Título */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-900">
            Sem Conexão
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {feature} está disponível <span className="font-bold">apenas quando conectado à internet.</span>
          </p>
        </div>

        {/* Dica */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-800">
            <span className="font-bold">Dica:</span> Você pode continuar registrando visitas e gerenciando o RG sem internet. Os dados serão sincronizados automaticamente quando reconectar.
          </p>
        </div>

        {/* Botões */}
        <div className="space-y-3">
          <Button
            onClick={() => router.history.back()}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 font-bold"
          >
            ← Voltar
          </Button>
          <Button
            onClick={() => router.navigate({ to: "/campo" })}
            variant="outline"
            className="w-full border-slate-300 rounded-xl h-11 font-bold"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Ir para Trabalho de Campo
          </Button>
        </div>

        {/* Status */}
        <div className="text-xs text-slate-500">
          Aguardando conexão...
        </div>
      </div>
    </div>
  );
}
