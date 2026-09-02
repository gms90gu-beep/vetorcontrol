import React from 'react';

interface FocusObservation {
  quarteirão: string;
  imóvel: string;
  tipoDepósito: string;
  data: string;
  tipoImóvel: string;
}

interface FocusObservationsGridProps {
  focos: FocusObservation[];
}

export function FocusObservationsGrid({ focos }: FocusObservationsGridProps) {
  if (!focos || focos.length === 0) return null;

  return (
    <div className="mt-8 mb-4">
      <h3 className="text-lg font-bold mb-4 text-center">OBSERVAÇÕES - FOCOS ENCONTRADOS</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {focos.map((foco, idx) => (
          <div 
            key={idx}
            className="border-2 border-gray-400 rounded-lg p-4 bg-gray-50 shadow-sm"
          >
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <strong>Quarteirão:</strong>
                <span>{foco.quarteirão}</span>
              </div>
              <div className="flex justify-between">
                <strong>Imóvel:</strong>
                <span className="text-right">{foco.imóvel}</span>
              </div>
              <div className="flex justify-between">
                <strong>Depósito:</strong>
                <span>{foco.tipoDepósito}</span>
              </div>
              <div className="flex justify-between">
                <strong>Data:</strong>
                <span>{foco.data}</span>
              </div>
              <div className="flex justify-between">
                <strong>Tipo:</strong>
                <span>{foco.tipoImóvel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
