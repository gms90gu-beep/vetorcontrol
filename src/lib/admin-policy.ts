export function assertMasterRole(role: string) {
  if (role !== "admin_master") throw new Error("Apenas o Admin Master pode executar esta ação.");
}

export function assertMasterTargetChange(input: {
  actorId: string; targetId: string; targetRole: string; activeMasters: number;
  nextRole?: string; active?: boolean; deleting?: boolean;
}) {
  const removing = input.deleting || input.active === false ||
    (input.nextRole !== undefined && input.nextRole !== "admin_master");
  if (removing && input.actorId === input.targetId) throw new Error("Você não pode remover ou desativar o próprio usuário logado.");
  if (removing && input.targetRole === "admin_master" && input.activeMasters <= 1) {
    throw new Error("Não é possível remover ou desativar o último Admin Master ativo.");
  }
}