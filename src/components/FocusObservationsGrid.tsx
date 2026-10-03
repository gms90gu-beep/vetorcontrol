import type { FocusObservation } from "@/lib/focus-observations";

interface FocusObservationsGridProps {
  focos: FocusObservation[];
}

export function FocusObservationsGrid({ focos }: FocusObservationsGridProps) {
  if (!focos || focos.length === 0) return null;

  return (
    <div className="mt-6 mb-4">
      <h3 className="mb-2 text-center text-[11px] font-black uppercase tracking-widest text-slate-800">
        Observações — focos encontrados
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">
                Nº imóvel
              </th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">Endereço</th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">
                Depósito positivo
              </th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-right">Qtd.</th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-center">
                Data da coleta
              </th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">
                Quarteirão
              </th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">
                Tipo de imóvel
              </th>
            </tr>
          </thead>
          <tbody>
            {focos.map((foco, idx) => (
              <tr key={`${foco.numeroImovel}-${foco.dataColeta}-${foco.tipoDeposito}-${idx}`}>
                <td className="border border-slate-200 px-2 py-1 font-bold">{foco.numeroImovel}</td>
                <td className="border border-slate-200 px-2 py-1">{foco.endereco}</td>
                <td className="border border-slate-200 px-2 py-1">{foco.tipoDeposito}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">
                  {foco.quantidade ?? "—"}
                </td>
                <td className="border border-slate-200 px-2 py-1 text-center">{foco.dataColeta}</td>
                <td className="border border-slate-200 px-2 py-1">{foco.quarteirao}</td>
                <td className="border border-slate-200 px-2 py-1">{foco.tipoImovel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
