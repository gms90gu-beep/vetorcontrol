import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { placesAutocomplete, placeDetails, type PlaceSuggestion } from "@/lib/places.functions";
import { Loader2 } from "lucide-react";

interface StreetAutocompleteProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onSelect?: (result: {
    address: string;
    neighborhood: string;
    city: string;
    state: string;
    formatted: string;
    latitude: number | null;
    longitude: number | null;
  }) => void;
  bias?: { lat: number; lng: number } | null;
  className?: string;
  placeholder?: string;
}

export function StreetAutocomplete({
  label = "Logradouro",
  value,
  onChange,
  onSelect,
  bias,
  className,
  placeholder,
}: StreetAutocompleteProps) {
  const autocompleteFn = useServerFn(placesAutocomplete);
  const detailsFn = useServerFn(placeDetails);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [skipNext, setSkipNext] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (skipNext) {
      setSkipNext(false);
      return;
    }
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await autocompleteFn({
          data: { input: value, lat: bias?.lat, lng: bias?.lng },
        });
        if (res.ok && res.suggestions) {
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    setSkipNext(true);
    onChange(s.primary);
    if (!onSelect) return;
    setResolving(true);
    try {
      const res = await detailsFn({ data: { placeId: s.placeId } });
      if (res.ok) {
        onSelect({
          address: res.address,
          neighborhood: res.neighborhood,
          city: res.city,
          state: res.state,
          formatted: res.formatted,
          latitude: res.latitude,
          longitude: res.longitude,
        });
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className={className} ref={wrapRef}>
      {label && <Label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</Label>}
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || "Ex: Rua da Igreja"}
          autoComplete="off"
        />
        {(loading || resolving) && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-auto">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm border-b last:border-b-0"
                >
                  <div className="font-medium text-slate-800">{s.primary}</div>
                  {s.secondary && <div className="text-xs text-slate-500">{s.secondary}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
