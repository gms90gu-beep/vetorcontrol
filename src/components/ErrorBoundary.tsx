import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.fallback) return this.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-6 text-center gap-6 animate-in fade-in duration-500">
          <div className="h-24 w-24 bg-red-50 rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-red-100">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-2xl font-black tracking-tighter text-slate-900">Algo deu errado</h2>
            <p className="text-sm text-slate-500 font-medium">
              Ocorreu um erro inesperado nesta página. Nossa equipe foi notificada.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl text-left overflow-auto max-h-40">
                <code className="text-[10px] text-red-600 font-mono">{this.state.error?.message}</code>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              onClick={this.handleReset} 
              className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs gap-2 shadow-xl shadow-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar Página
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/dashboard'}
              className="h-14 rounded-2xl border-2 border-slate-100 font-black uppercase tracking-widest text-xs gap-2"
            >
              <Home className="h-4 w-4" />
              Voltar ao Início
            </Button>
          </div>
        </div>
      );
    }

    return this.children;
  }

  private get children() {
    return this.props.children;
  }

  private get fallback() {
    return this.props.fallback;
  }
}
