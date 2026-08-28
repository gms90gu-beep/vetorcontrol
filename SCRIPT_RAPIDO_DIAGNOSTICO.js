// 🔍 DIAGNÓSTICO RÁPIDO DE FOCOS
// Cole isto no Console (F12) e pressione Enter

console.log("🔍 INICIANDO DIAGNÓSTICO...\n");

(async () => {
  // PASSO 1: Teste básico
  console.log("PASSO 1: Testando surveyData.hasFocus");
  const test = { hasFocus: false };
  test.hasFocus = true;
  console.log(test.hasFocus === true ? "✅ OK: hasFocus atualiza para TRUE" : "❌ FALHA: não é TRUE");

  // PASSO 2: Consultar banco
  console.log("\nPASSO 2: Consultando visitas do banco");
  try {
    // Tentar encontrar o cliente Supabase
    let supabase = null;
    
    // Método 1: Procurar no window
    if (window.__supabaseClient) {
      supabase = window.__supabaseClient;
    } else if (window.supabase) {
      supabase = window.supabase;
    }
    
    if (!supabase) {
      console.error("❌ Supabase client não encontrado");
      console.log("Procure na aba 'Network' e veja a URL da API");
      return;
    }

    // Consultar visitas
    const { data: visits, error } = await supabase
      .from('visits')
      .select('id, has_focus, status, activity_type, visit_date')
      .limit(10);

    if (error) {
      console.error("❌ Erro ao consultar:", error.message);
      return;
    }

    console.log("✅ Visitas do banco:");
    console.table(visits);

    // Análise dos dados
    const stats = {
      total: visits.length,
      com_foco_true: visits.filter(v => v.has_focus === true).length,
      com_foco_false: visits.filter(v => v.has_focus === false).length,
      com_foco_null: visits.filter(v => v.has_focus === null).length,
    };

    console.log("\n📊 ANÁLISE:");
    console.table(stats);

    if (stats.com_foco_true > 0) {
      console.log("✅ PASSO 2 OK: has_focus está sendo salvo como TRUE!");
    } else if (stats.com_foco_null > 0) {
      console.log("❌ PASSO 2 FALHA: has_focus está NULL (não está sendo populado)");
    } else {
      console.log("❌ PASSO 2 FALHA: has_focus está FALSE (sempre salva como false)");
    }

  } catch (e) {
    console.error("❌ Erro:", e.message);
  }

  // PASSO 3: Verificar permissões
  console.log("\nPASSO 3: Verificando permissões (RLS)");
  try {
    const { data: { user } } = await supabase.auth.getUser();
    console.log("Você é:", user?.email || "não autenticado");
    
    const { error: permError } = await supabase
      .from('visits')
      .select('id, agent_id')
      .limit(1);
    
    if (permError) {
      console.log("❌ Erro de permissão:", permError.message);
    } else {
      console.log("✅ Permissões OK: consegue acessar dados");
    }
  } catch (e) {
    console.error("Erro ao verificar permissões:", e.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("FIM DO DIAGNÓSTICO");
  console.log("Copie toda a saída acima e envie para Claude!");
  console.log("=".repeat(60));
})();
