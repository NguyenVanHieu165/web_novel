"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  groupLabels,
  metricLabels,
  rangeLabels,
  statisticsFilters,
  statisticsQuery,
  statisticsWindow,
  type StatisticsFilters,
  type StatisticsReport,
} from "@/lib/admin-statistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterBar, FilterBarActions, FilterBarGroup } from "@/components/shared/filter-bar";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";

const numberFormat = new Intl.NumberFormat("vi-VN");
const compactFormat = new Intl.NumberFormat("vi-VN", { notation: "compact" });
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "UTC" });

const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
function formatPeriod(from: string, to: string) {
  return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

type ReportResult = { key: string; report: StatisticsReport } | { key: string; error: string };

export default function Chart() {
  const search = useSearchParams();
  const query = Object.fromEntries(search);
  const parsed = statisticsFilters.safeParse(query);
  const filters = parsed.success ? parsed.data : statisticsFilters.parse({});
  const reportQuery = statisticsQuery(filters);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${reportQuery}|${attempt}`;
  const [result, setResult] = useState<ReportResult>();
  const current = result?.key === requestKey ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/statistics?${reportQuery}`, { signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setResult({
              key: requestKey,
              error: response.status === 401 || response.status === 403
                ? "Phiên quản trị không còn hiệu lực. Hãy đăng nhập lại."
                : "Không tải được thống kê. Hãy thử lại.",
            });
          }
          return;
        }
        const report: StatisticsReport = await response.json();
        if (!controller.signal.aborted) setResult({ key: requestKey, report });
      } catch {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: "Không kết nối được máy chủ. Hãy thử lại." });
      }
    }
    void load();
    return () => controller.abort();
  }, [reportQuery, requestKey]);

  return (
    <section aria-labelledby="growth-chart-heading" className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h3 id="growth-chart-heading" className="text-lg font-bold">Báo cáo hệ thống</h3>
      <ChartFilters key={reportQuery} filters={filters} />
      <div aria-busy={!current}>
        {!current ? (
          <p role="status" className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Đang tải biểu đồ…
          </p>
        ) : "error" in current ? (
          <ErrorState className="min-h-40 content-center"><ErrorStateTitle>Không thể tải báo cáo</ErrorStateTitle><ErrorStateDescription>{current.error}</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Thử lại</Button></ErrorStateActions></ErrorState>
        ) : (
          <ReportChart report={current.report} metric={filters.metric} />
        )}
      </div>
    </section>
  );
}

function ChartFilters({ filters }: { filters: StatisticsFilters }) {
  const [range, setRange] = useState<StatisticsFilters["range"]>(filters.range);
  const [validation, setValidation] = useState("");
  const [suggestedDates, setSuggestedDates] = useState<{ from: string; to: string } | null>(null);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = statisticsFilters.safeParse(Object.fromEntries(data));
    if (!result.success) {
      setValidation(result.error.issues[0]?.message ?? "Kiểm tra lại bộ lọc.");
      return;
    }
    setValidation("");
    const url = new URL(window.location.href);
    for (const key of ["metric", "range", "group", "from", "to"]) url.searchParams.delete(key);
    for (const [key, value] of data) {
      if (typeof value === "string") url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", url);
  }

  return (
    <form aria-label="Bộ lọc biểu đồ" className="space-y-3" onSubmit={apply}>
      <FilterBar>
        <FilterBarGroup className="grid min-w-0 grid-cols-1 items-end sm:grid-cols-2 xl:grid-cols-3">
        <label className="min-w-0 space-y-1 text-sm font-medium">
          <span>Chỉ số</span>
          <Select name="metric" defaultValue={filters.metric}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(metricLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </label>
        <label className="min-w-0 space-y-1 text-sm font-medium">
          <span>Khoảng thời gian</span>
          <Select name="range" value={range} onValueChange={(value) => {
            if (!Object.hasOwn(rangeLabels, value)) return;
            if (value === "custom" && !suggestedDates) {
              setSuggestedDates(statisticsWindow(filters));
            }
            setRange(value as StatisticsFilters["range"]);
            setValidation("");
          }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(rangeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </label>
        <label className="min-w-0 space-y-1 text-sm font-medium">
          <span>Gom số liệu</span>
          <Select name="group" defaultValue={filters.group}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(groupLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </label>
        {range === "custom" && (
          <>
            <label className="min-w-0 space-y-1 text-sm font-medium">
              <span>Từ ngày</span>
              <Input type="date" name="from" defaultValue={filters.from ?? suggestedDates?.from} required />
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium">
              <span>Đến ngày</span>
              <Input type="date" name="to" defaultValue={filters.to ?? suggestedDates?.to} required />
            </label>
          </>
        )}
        </FilterBarGroup>
        <FilterBarActions><Button type="submit">Áp dụng</Button></FilterBarActions>
      </FilterBar>
      {validation && <ErrorState><ErrorStateTitle>Bộ lọc chưa hợp lệ</ErrorStateTitle><ErrorStateDescription>{validation}</ErrorStateDescription></ErrorState>}
    </form>
  );
}

function ReportChart({ report, metric }: { report: StatisticsReport; metric: StatisticsFilters["metric"] }) {
  const revenue = metric === "revenue";
  const users = metric === "users";
  const label = revenue ? "Doanh thu" : metricLabels[metric];
  const colors = { revenue: "#6366f1", users: "#10b981", stories: "#ec4899", chapters: "#8b5cf6", orders: "#f59e0b" };
  const hasData = report.points.some((point) => point.value !== 0 || Boolean(point.billCount));
  const pointEnds = new Map(report.points.map((point) => [point.from, point.to]));
  const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{formatPeriod(report.from, report.to)}</p>
      <div className="h-72 min-w-0 sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={report.points} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="from" minTickGap={20} tick={axisTick}
              tickFormatter={(value: string) => report.group === "month" ? value.slice(0, 7) : value.slice(5).split("-").reverse().join("/")} />
            <YAxis yAxisId="value" width={revenue ? 54 : 36} allowDecimals={false} tick={axisTick}
              tickFormatter={(value: number) => compactFormat.format(value)} />
            {revenue && <YAxis yAxisId="bills" width={32} orientation="right" allowDecimals={false} tick={axisTick} />}
            <Tooltip
              contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
              itemStyle={{ color: "var(--popover-foreground)" }}
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              labelFormatter={(value) => formatPeriod(String(value), pointEnds.get(String(value)) ?? String(value))}
              formatter={(value, name) => [
                revenue && name === label ? numberFormat.format(Number(value)) + " ₫" : numberFormat.format(Number(value)),
                name,
              ]}
            />
            <Legend />
            <Bar yAxisId="value" dataKey="value" name={label} fill={colors[metric]} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            {revenue && <Line yAxisId="bills" type="monotone" dataKey="billCount" name="Số đơn"
              stroke="#f59e0b" strokeWidth={3} dot={report.points.length <= 31 ? { r: 3 } : false} isAnimationActive={false} />}
            {users && <Line yAxisId="value" type="monotone" dataKey="value" name="Xu hướng"
              stroke="#3b82f6" strokeWidth={3} legendType="none" tooltipType="none" dot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!hasData && <p role="status" className="text-center text-sm text-muted-foreground">Chưa có dữ liệu trong khoảng đã chọn.</p>}
      {(revenue || metric === "orders") && (
        <p className="text-xs text-muted-foreground">Tính theo ngày tạo hóa đơn nạp thành công.</p>
      )}
    </div>
  );
}
