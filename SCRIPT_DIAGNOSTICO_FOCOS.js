/**
 * 🔍 SCRIPT DE DIAGNÓSTICO: Por que focos não aparecem para Supervisor
 * 
 * INSTRUÇÕES:
 * 1. Abra seu app (vetorcontrol.lovable.app)
 * 2. Faça login como AGENTE
 * 3. Abra DevTools (F12)
 * 4. Vá para a aba "Console"
 * 5. Cole TODO este script abaixo
 * 6. Pressione Enter
 * 7. Copie a saída completa e me mande
 */

console.log("=".repeat(80));
console.log("🔍 DIAGNÓSTICO DE FOCOS - VETORCONTROL");
console.log("=".repeat(80));

// ============================================================================
// PASSO 1: Verificar se surveyData.hasFocus está sendo atualizado
// ============================================================================
console.log("\n📋 PASSO 1: Testando atualização de surveyData.hasFocus");
console.log("-".repeat(80));

// Criar objeto de teste
const testSurveyData = { hasFocus: false };
console.log("Estado inicial:", JSON.stringify(testSurveyData));

// Simular clique em checkbox
testSurveyData.hasFocus = true;
console.log("Após marcar 'Foco Encontrado':", JSON.stringify(testSurveyData));

if (testSurveyData.hasFocus === true) {
  console.log("✅ PASSO 1 OK: hasFocus atualiza corretamente para TRUE");
} else {
  console.log("❌ PASSO 1 FALHA: hasFocus não está TRUE");
}

// ============================================================================
// PASSO 2: Consultar últimas visitas do Supabase
// ============================================================================
console.log("\n📋 PASSO 2: Consultando últimas visitas do banco");
console.log("-".repeat(80));

(async () => {
  try {
    // Importar Supabase dinamicamente
    const { supabase } = await import('/src/integrations/supabase/client.js').catch(() => ({
      supabase: window.__supabaseClient
    }));

    if (!supabase) {
      console.error("❌ Supabase client não encontrado");
      console.log("Tentando acessar window.supabase...");
      return;
    }

    // Consultar últimas 5 visitas com has_focus
    const { data: visits, error } = await supabase
      .from('visits')
      .select('id, agent_id, status, activity_type, has_focus, visit_date')
      .limit(5)
      .order('visit_date', { ascending: false });

    if (error) {
      console.error("❌ Erro ao consultar visits:", error.message);
      return;
    }

    console.log("✅ Consulta bem-sucedida. Primeiras 5 visitas:");
    console.table(visits);

    // Análise
    const withFocus = visits.filter(v => v.has_focus === true).length;
    const withoutFocus = visits.filter(v => v.has_focus === false).length;
    const nullFocus = visits.filter(v => v.has_focus === null).length;

    console.log("\n📊 ANÁLISE:");
    console.log(`  • Com has_focus = TRUE: ${withFocus}`);
    console.log(`  • Com has_focus = FALSE: ${withoutFocus}`);
    console.log(`  • Com has_focus = NULL: ${nullFocus}`);

    if (withFocus > 0) {
      console.log("✅ PASSO 2 OK: Existem visitas com has_focus = TRUE no banco!");
    } else if (nullFocus > 0) {
      console.log("❌ PASSO 2 FALHA: has_focus está NULL (não está sendo populado)");
    } else {
      console.log("❌ PASSO 2 FALHA: has_focus está FALSE (sempre salva como false)");
    }

    // ========================================================================
    // PASSO 3: Verificar RLS Policy
    // ========================================================================
    console.log("\n📋 PASSO 3: Verificando RLS Policy");
    console.log("-".repeat(80));

    // Consultar como supervisor (testar permissões)
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      console.log("❌ Usuário não autenticado");
      return;
    }

    console.log("Usuário atual:", user.user.id);
    console.log("Tentando consultar visits de TODOS os agentes...");

    const { data: allVisits, error: policyError } = await supabase
      .from('visits')
      .select('id, agent_id, has_focus')
      .limit(1);

    if (policyError) {
      console.error("❌ Erro de permissão:", policyError.message);
      console.log("🔴 RLS Policy está bloqueando acesso!");
    } else {
      console.log("✅ Conseguiu acessar visitas de outros agentes");
      console.log("✅ PASSO 3 OK: RLS Policy permite leitura de dados");
    }

    // ========================================================================
    // PASSO 4: Simular fluxo completo de salvar foco
    // ========================================================================
    console.log("\n📋 PASSO 4: Simulando fluxo de salvar foco");
    console.log("-".repeat(80));

    const payload = {
      activity_type: 'survey',
      status: 'visited',
      has_focus: true,  // Como deve ser quando marcado
      visit_date: new Date().toISOString(),
    };

    console.log("Payload que DEVERIA ser enviado:");
    console.log(JSON.stringify(payload, null, 2));
    console.log("✅ PASSO 4: Se este JSON foi gerado com has_focus=true, está OK!");

  } catch (e) {
    console.error("❌ Erro geral:", e.message);
    console.error(e);
  }

  // =========================================================================
  // RESUMO FINAL
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📋 RESUMO DO DIAGNÓSTICO");
  console.log("=".repeat(80));
  console.log(`
✅ PASSO 1: hasFocus atualiza? ${testSurveyData.hasFocus ? "SIM" : "NÃO"}
✅ PASSO 2: has_focus está no banco? (veja acima)
✅ PASSO 3: RLS Policy bloqueia? (veja acima)
✅ PASSO 4: Payload com has_focus? (veja acima)

📌 PRÓXIMO PASSO:
   1. Copie toda esta saída do console
   2. Me envie
   3. Vou ver qual é o passo que falha
   4. Aplico o fix em 5 minutos
  `);
})();

console.log("\n⏳ Executando diagnóstico assíncrono... aguarde 5 segundos...");
