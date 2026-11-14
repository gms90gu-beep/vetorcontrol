export function rgLocalityKey(locality: string | null | undefined) {
  return (locality ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function RgLocalityFilter({
  boletins,
  value,
  onChange,
}: {
  boletins: readonly { locality?: string | null }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = new Map<string, string>();
  for (const boletim of boletins) {
    const name = boletim.locality?.trim();
    if (!name) continue;
    const key = rgLocalityKey(name);
    if (!options.has(key)) options.set(key, name);
  }

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      Localidade
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todas as localidades</option>
        {[...options].sort(([, a], [, b]) => a.localeCompare(b, "pt-BR")).map(([key, name]) => (
          <option key={key} value={key}>{name}</option>
        ))}
      </select>
    </label>
  );
}
