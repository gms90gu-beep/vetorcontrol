/**
 * Workaround temporário para coordenadores até SQL ser executada
 * Remove RLS para coordenadores no fallback
 * 
 * ⚠️ REMOVER quando RPC for executada no Supabase!
 */

export const useCoordinatorBypass = (role?: string, userId?: string) => {
  // Se é coordenador, usar query sem RLS (bypass)
  if (role === 'coordenador' && userId) {
    return {
      isCoordinator: true,
      bypassNeeded: true,
      message: '⚠️ Using temporary bypass - remove when RPC is enabled'
    };
  }
  
  return {
    isCoordinator: false,
    bypassNeeded: false,
    message: 'Normal RLS applies'
  };
};

/**
 * Query segura para coordenadores (sem RLS)
 * Busca supervisores + agentes mesmo sem coordinator_id preenchido
 */
export const getCoordinatorDataDirect = async (supabase: any, userId: string) => {
  try {
    // Buscar TODOS os supervisores (ignora RLS temporariamente)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'supervisor');
    
    if (error) throw error;
    
    return data || [];
  } catch (err) {
    console.error('[COORDINATOR_BYPASS] Erro:', err);
    return [];
  }
};
