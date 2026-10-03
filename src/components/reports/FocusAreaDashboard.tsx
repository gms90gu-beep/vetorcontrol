import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Bug, Building2, MapPin, Percent, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFocusAreaStatistics,
  type FocusAreaStatistics,
} from "@/lib/focus-area-statistics.functions";

const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#06b6d4", "#14b8a6", "#64748b"];

export function FocusAreaDashboard({ onBack }: { onBack: () => void }) {
  const fetchStatistics = useServerFn(getFocusAreaStatistics);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [cycleId, setCycleId] = useState("all");
  const [statistics, setStatistics] = useState<FocusAreaStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchStatistics({
      data: {
        year: year === "all" ? null : Number(year),
        cycleId: cycleId === "all" ? null : cycleId,
      },
    })
      .then((data) => {
        if (active) setStatistics(data);
      })
      .catch((cause: any) => {
        if (active)
          setError(cause?.message || "Não foi possível carregar as estatísticas de focos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchStatistics, year, cycleId]);

  const cycles = statistics?.cycles || [];
  const years = statistics?.years || [];
  const cycleOptions =
    year === "all" ? cycles : cycles.filter((cycle) => Number(cycle.year) === Number(year));

  const pieData = useMemo(() => {
    const rows = (statistics?.byArea || []).filter((row) => row.focusProperties > 0);
    const top = rows.slice(0, 6).map((row) => ({ name: row.area, value: row.focusProperties }));
    const rest = rows.slice(6).reduce((sum, row) => sum + row.focusProperties, 0);
    return rest > 0 ? [...top, { name: "Demais áreas", value: rest }] : top;
  }, [statistics]);

  const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-BR");

  return (
    <div className="min-h-screen -mx-4 bg-slate-50 px-4 pb-24 pt-5 md:-mx-0 md:px-0">
      <header className="mb-5 flex flex-col gap-4 rounded-3xl bg-slate-950 p-5 text-white md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            aria-label="Voltar à Inteligência Operacional"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <Badge className="mb-2 border-0 bg-rose-500/20 text-rose-200">
              INTELIGÊNCIA EPIDEMIOLÓGICA
            </Badge>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Focos por Área</h2>
            <p className="mt-1 text-xs text-white/70">
              Distribuição dos focos e imóveis com positividade no território
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:min-w-[360px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">
            Ano
            <Select
              value={year}
              onValueChange={(value) => {
                setYear(value);
                setCycleId("all");
              }}
            >
              <SelectTrigger className="mt-1 h-10 border-white/15 bg-white/10 text-white">
                <SelectValue placeholder="Selecione o ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">
            Ciclo
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="mt-1 h-10 border-white/15 bg-white/10 text-white">
                <SelectValue placeholder="Todos os ciclos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os ciclos</SelectItem>
                {cycleOptions.map((cycle) => (
                  <SelectItem key={cycle.id} value={cycle.id}>
                    {cycle.name || `Ciclo ${cycle.number}/${cycle.year}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-3xl bg-white text-sm font-semibold text-slate-500 shadow-sm">
          Carregando estatísticas dos ciclos...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs font-medium text-slate-500">
            Escopo dos dados:{" "}
            {statistics?.totals.visitedProperties
              ? "registros de imóveis visitados no período selecionado."
              : "nenhum registro de visita encontrado para o filtro."}
            {cycleId !== "all"
              ? " O ciclo selecionado limita o período."
              : year !== "all"
                ? " Os ciclos do ano selecionado são incluídos."
                : " Todos os anos disponíveis são incluídos."}
          </p>

          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label="Focos encontrados"
              value={formatNumber(statistics?.totals.focusEvents || 0)}
              icon={Bug}
              tone="rose"
              detail="Registros de foco identificado em campo"
            />
            <MetricCard
              label="Imóveis com foco"
              value={formatNumber(statistics?.totals.focusProperties || 0)}
              icon={Building2}
              tone="orange"
              detail="Cada imóvel contado uma vez"
            />
            <MetricCard
              label="Áreas com foco"
              value={formatNumber(statistics?.totals.areasWithFocus || 0)}
              icon={MapPin}
              tone="cyan"
              detail="Com ao menos um imóvel positivo"
            />
            <MetricCard
              label="Taxa de foco"
              value={`${statistics?.totals.positivityRate || 0}%`}
              icon={Percent}
              tone="violet"
              detail="Imóveis com foco ÷ visitados"
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
                  <ShieldAlert className="h-4 w-4 text-rose-600" /> Imóveis com foco por área
                </CardTitle>
                <p className="text-xs text-slate-500">Ranking para orientar ações prioritárias</p>
              </CardHeader>
              <CardContent className="pt-2">
                {statistics?.byArea.some((row) => row.focusProperties > 0) ? (
                  <div className="h-[270px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={statistics.byArea.slice(0, 8)}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="area" type="category" width={105} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                        <Bar
                          dataKey="focusProperties"
                          name="Imóveis com foco"
                          fill="#ef4444"
                          radius={[0, 6, 6, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChart text="Nenhum foco registrado nas áreas deste filtro." />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-700">
                  Participação por área
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Percentual dos imóveis com foco identificado
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center pt-2 sm:flex-row">
                {pieData.length ? (
                  <>
                    <div className="h-[230px] w-full sm:w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={88}
                            paddingAngle={2}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-2 sm:w-1/2">
                      {pieData.map((entry, index) => (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-slate-600">
                            <i
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />{" "}
                            <span className="truncate">{entry.name}</span>
                          </span>
                          <strong className="text-slate-900">{formatNumber(entry.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyChart text="Os focos aparecerão aqui quando houver registros." />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mb-5 rounded-3xl border-0 shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-700">
                Evolução dos focos positivos
              </CardTitle>
              <p className="text-xs text-slate-500">Registros por mês no filtro selecionado</p>
            </CardHeader>
            <CardContent className="pt-2">
              {statistics?.monthlyTrend.length ? (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={statistics.monthlyTrend}
                      margin={{ left: 4, right: 12, top: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="focusEvents"
                        name="Focos positivos"
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="focusProperties"
                        name="Imóveis com foco"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart text="Sem evolução disponível para este filtro." />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-700">
                Detalhamento por área
              </CardTitle>
              <p className="text-xs text-slate-500">
                A taxa usa imóveis distintos com foco identificado para evitar que revisitas
                distorçam o resultado.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {statistics?.byArea.length ? (
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="border-b bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3">Área</th>
                      <th className="p-3 text-right">Focos encontrados</th>
                      <th className="p-3 text-right">Imóveis com foco</th>
                      <th className="p-3 text-right">Imóveis visitados</th>
                      <th className="p-3 text-right">Taxa de foco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.byArea.map((row) => (
                      <tr key={row.areaId} className="border-b last:border-0">
                        <td className="p-3 font-bold text-slate-800">{row.area}</td>
                        <td className="p-3 text-right tabular-nums">
                          {formatNumber(row.focusEvents)}
                        </td>
                        <td className="p-3 text-right tabular-nums font-bold text-rose-700">
                          {formatNumber(row.focusProperties)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatNumber(row.visitedProperties)}
                        </td>
                        <td className="p-3 text-right tabular-nums">{row.positivityRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyChart text="Não há áreas com foco positivo no intervalo selecionado." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "rose" | "orange" | "cyan" | "violet";
  detail: string;
}) {
  const tones = {
    rose: "bg-rose-50 text-rose-700",
    orange: "bg-orange-50 text-orange-700",
    cyan: "bg-cyan-50 text-cyan-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="flex items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{value}</p>
          <p className="mt-1 text-[9px] font-medium text-slate-500">{detail}</p>
        </div>
        <span className={`rounded-xl p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-center text-xs font-medium text-slate-400">
      {text}
    </div>
  );
}
