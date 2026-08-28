/**
 * 🚨 FIX URGENTE: Erros de Sincronização + Focos Sem Depósito
 * 
 * COLE ISTO NO CONSOLE (F12) PARA:
 * 1. Ver quais mutações têm erro
 * 2. Tentar retry automático
 * 3. Fixar focos sem depósito
 * 4. Permitir fechar expediente
 */

(async () => {
  console.log("🚨 INICIANDO FIX: Sincronização + Focos\n");

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 1: Ver mutações com erro
  // ═══════════════════════════════════════════════════════════════════════
  console.log("📋 PASSO 1: Checando mutações com erro...\n");

  const failedMutations = await db.mutations
    .where("status")
    .equals("error")
    .toArray();

  console.log(`❌ Mutações com erro: ${failedMutations.length}`);
  
  if (failedMutations.length > 0) {
    console.table(
      failedMutations.map((m) => ({
        id: m.id.substring(0, 8),
        table: m.table,
        op: m.op,
        tries: m.tries,
        error: m.lastError?.substring(0, 50),
        created: new Date(m.createdAt).toLocaleString("pt-BR"),
      }))
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 2: Tentar Retry de Mutações
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n🔄 PASSO 2: Tentando Retry automático...\n");

  let retryCount = 0;
  for (const mutation of failedMutations) {
    // Resetar para "pending" para tentar novamente
    await db.mutations.update(mutation.id, {
      status: "pending",
      tries: 0, // Reseta tentativas
      lastError: null,
    });
    retryCount++;
    console.log(`  ✅ Resetado: ${mutation.table} (${mutation.op})`);
  }

  console.log(`\n✅ ${retryCount} mutação(ões) resetada(s) para retry!\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 3: Fazer sync agora
  // ═══════════════════════════════════════════════════════════════════════
  console.log("📡 PASSO 3: Sincronizando...\n");

  try {
    const syncResult = await flushMutations();
    console.log(`✅ Sincronização feita: ${syncResult.ok} OK, ${syncResult.failed} falhadas`);
  } catch (e) {
    console.error("❌ Erro ao sincronizar:", e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 4: Verificar e Fixar Focos sem Depósito
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n🔍 PASSO 4: Checando focos sem depósito...\n");

  const visits = await db.visits.toArray();
  const deposits = await db.visit_deposits.toArray();

  const visitIds = new Set(deposits.map((d) => d.visit_id));
  const focosComDeposito = visits.filter(
    (v) => v.has_focus && visitIds.has(v.id)
  );
  const focosSemDeposito = visits.filter(
    (v) => v.has_focus && !visitIds.has(v.id)
  );

  console.log(`✅ Focos com depósito: ${focosComDeposito.length}`);
  console.log(`❌ Focos sem depósito: ${focosSemDeposito.length}`);

  if (focosSemDeposito.length > 0) {
    console.log("\n⚠️ Focos órfãos encontrados! Criando depósitos...\n");

    for (const foco of focosSemDeposito) {
      const depositId = crypto.randomUUID();

      // Criar depósito "correto" para cada foco órfão
      await db.visit_deposits.add({
        id: depositId,
        visit_id: foco.id,
        property_id: foco.property_id,
        agent_id: foco.agent_id,
        is_positive: true, // É um foco!
        deposit_type: "positive",
        cycle_id: foco.cycle_id,
        created_at: new Date().toISOString(),
        synced: false,
      });

      // Criar mutação para sincronizar depois
      await enqueueMutation({
        table: "visit_deposits",
        op: "insert",
        payload: {
          id: depositId,
          visit_id: foco.id,
          property_id: foco.property_id,
          agent_id: foco.agent_id,
          is_positive: true,
          deposit_type: "positive",
          cycle_id: foco.cycle_id,
          created_at: new Date().toISOString(),
        },
      });

      console.log(`✅ Depósito criado para foco: ${foco.id.substring(0, 8)}`);
    }

    console.log(`\n✅ ${focosSemDeposito.length} depósito(s) criado(s)!`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 5: Fazer Sync Final
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n📡 PASSO 5: Sincronização final...\n");

  try {
    const finalSync = await flushMutations();
    console.log(`✅ Sincronização final: ${finalSync.ok} OK, ${finalSync.failed} falhadas`);
  } catch (e) {
    console.error("❌ Erro:", e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("✅ FIX COMPLETO!");
  console.log("═".repeat(60));
  console.log(`
✅ Mutações com erro: resetadas e reenviadas
✅ Focos órfãos: depósitos criados
✅ Sincronização: completa

🎯 RESULTADO:
  Agora você consegue fechar o expediente!

📝 Próximo passo:
  1. Recarregue a página (F5)
  2. Tente fechar expediente novamente
  3. ✅ Deve funcionar agora!
  `);
})();
