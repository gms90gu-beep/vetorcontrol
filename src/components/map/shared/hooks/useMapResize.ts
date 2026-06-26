// useMapResize — invalida o tamanho do mapa em mudanças do container.
// Resolve casos clássicos de mapa dentro de Dialog/Sheet/Tab.
import { useEffect } from "react";
import L from "leaflet";

export function useMapResize(map: L.Map | null, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!map || !ref.current) return;
    const el = ref.current;
    const trigger = () => {
      try { map.invalidateSize({ animate: false }); } catch { /* noop */ }
    };
    // chamada inicial pós-mount
    const t = setTimeout(trigger, 80);
    const ro = new ResizeObserver(trigger);
    ro.observe(el);
    window.addEventListener("orientationchange", trigger);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("orientationchange", trigger);
    };
  }, [map, ref]);
}
