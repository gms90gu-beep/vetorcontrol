import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SharedMap, SharedMarkerLayer, classifyProperty } from "@/components/map/shared";

export type BlockMapProperty = {
  id: string;
  number: string;
  street_name: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  had_previous_focus?: boolean | null;
  status?: string | null;
  has_pendency?: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockNumber: string | null;
  properties: BlockMapProperty[];
  loading?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
}

export function BlockMapDialog({
  open, onOpenChange, blockNumber, properties,
  loading = false, loadError = null, onRetryLoad,
}: Props) {
  const geo = properties.filter((p) => p.latitude != null && p.longitude != null);
  const points = geo.map((p) => {
    const cls = classifyProperty(p);
    return {
      id: p.id,
      lat: p.latitude as number,
      lng: p.longitude as number,
      had_previous_focus: p.had_previous_focus,
      has_pendency: p.has_pendency,
      type: p.type,
      popupHtml: `<div style="font-family:system-ui;font-size:12px"><b>Nº ${p.number}</b><br/>${
        p.street_name ?? ""
      }<br/><span style="color:${cls.color}">●</span> ${cls.label}</div>`,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mapa do quarteirão {blockNumber ?? "—"}</DialogTitle>
        </DialogHeader>
        <SharedMap
          height="60vh"
          loading={loading}
          loadError={loadError}
          isEmpty={properties.length === 0 || geo.length === 0}
          emptyVariant={properties.length === 0 ? "no-data" : "no-geo"}
          onRetryLoad={onRetryLoad}
          legendTrailing={`${geo.length} de ${properties.length} georreferenciados`}
        >
          <SharedMarkerLayer points={points} />
        </SharedMap>
      </DialogContent>
    </Dialog>
  );
}
