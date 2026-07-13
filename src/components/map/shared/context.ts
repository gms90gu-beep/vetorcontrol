import { createContext, useContext } from "react";
import type L from "leaflet";
import type { BaseLayerId } from "./base-layers";

export type SharedMapContextValue = {
  map: L.Map | null;
  activeBaseLayerId?: BaseLayerId;
  changeBaseLayer?: (id: BaseLayerId) => void;
};

export const SharedMapContext = createContext<SharedMapContextValue>({ map: null });

export function useSharedMap(): L.Map | null {
  return useContext(SharedMapContext).map;
}

export function useSharedMapContext(): SharedMapContextValue {
  return useContext(SharedMapContext);
}
