/**
 * Lista fixa de agentes usada na Fase G (Snapshot operacional).
 * IDs descobertos via profiles.full_name no banco.
 */
export interface OperationalAgent {
  id: string;
  name: string;
}

export const OPERATIONAL_AGENTS: OperationalAgent[] = [
  { id: '30f520ba-b5b8-4516-932e-0008ceab854d', name: 'Gustavo Mota' },
  { id: 'c1784570-071e-4a66-8c05-7df588362abc', name: 'Marineide' },
  { id: '1e650f03-212c-45f1-9ac4-25235125dd4c', name: 'Maria Olga' },
];
