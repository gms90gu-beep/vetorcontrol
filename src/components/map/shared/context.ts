import { createContext, useContext } from "react";
import type L from "leaflet";

export type SharedMapContextValue = {
  map: L.Map | null;
};

export const SharedMapContext = createContext<SharedMapContextValue>({ map: null });

export function useSharedMap(): L.Map | null {
  return useContext(SharedMapContext).map;
}
