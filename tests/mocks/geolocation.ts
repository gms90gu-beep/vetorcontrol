import { vi } from "vitest";

type Coords = { latitude: number; longitude: number; accuracy?: number };

export function mockGeoSuccess(coords: Coords = { latitude: -23.55, longitude: -46.63, accuracy: 10 }) {
  const geo = {
    getCurrentPosition: vi.fn((ok: any) => ok({ coords: { accuracy: 10, ...coords }, timestamp: Date.now() })),
    watchPosition: vi.fn(() => 1),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geo });
  return geo;
}

export function mockGeoError(code: 1 | 2 | 3, message = "geo error") {
  const geo = {
    getCurrentPosition: vi.fn((_ok: any, err: any) => err({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })),
    watchPosition: vi.fn(() => 1),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geo });
  return geo;
}

export const mockGeoDenied = () => mockGeoError(1, "permission denied");
export const mockGeoUnavailable = () => mockGeoError(2, "unavailable");
export const mockGeoTimeout = () => mockGeoError(3, "timeout");
