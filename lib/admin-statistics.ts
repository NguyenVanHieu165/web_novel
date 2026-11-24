import { z } from "zod";

export const metricLabels = {
  users: "Người dùng mới",
  stories: "Truyện mới",
  chapters: "Chương mới",
  revenue: "Doanh thu nạp",
  orders: "Đơn nạp thành công",
} as const;

export const rangeLabels = {
  month: "Tháng hiện tại",
  "7d": "7 ngày gần nhất",
  "30d": "30 ngày gần nhất",
  "90d": "90 ngày gần nhất",
  "365d": "365 ngày gần nhất",
  custom: "Tùy chọn ngày",
} as const;

export const groupLabels = {
  auto: "Tự động",
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
} as const;

const dayMs = 86_400_000;
const vietnamOffsetMs = 7 * 3_600_000;

function dayTime(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export const statisticsFilters = z.object({
  metric: z.enum(["users", "stories", "chapters", "revenue", "orders"]).default("revenue"),
  range: z.enum(["month", "7d", "30d", "90d", "365d", "custom"]).default("month"),
  group: z.enum(["auto", "day", "week", "month"]).default("auto"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
}).superRefine((filter, context) => {
  if (filter.range !== "custom") return;
  if (!filter.from || !filter.to) {
    context.addIssue({ code: "custom", message: "Chọn ngày bắt đầu và ngày kết thúc." });
    return;
  }
  const days = (dayTime(filter.to) - dayTime(filter.from)) / dayMs + 1;
  if (days < 1 || days > 366) {
    context.addIssue({ code: "custom", message: "Chọn khoảng thời gian từ 1 đến 366 ngày, theo thứ tự bắt đầu đến kết thúc." });
  }
});

export type StatisticsFilters = z.output<typeof statisticsFilters>;
export type StatisticsReport = {
  from: string;
  to: string;
  group: Exclude<StatisticsFilters["group"], "auto">;
  points: { from: string; to: string; value: number; billCount?: number }[];
};
export type DashboardOverview = {
  useTotal: number;
  truyensTotal: number;
  chuongsTotal: number;
  viewsTotal: number;
  revenueTotal: number;
  from: string;
  to: string;
};

export function statisticsQuery(filters: StatisticsFilters) {
  const params = new URLSearchParams({
    metric: filters.metric,
    range: filters.range,
    group: filters.group,
  });
  if (filters.range === "custom" && filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  return params.toString();
}

export function statisticsWindowQuery(filters: StatisticsFilters) {
  const params = new URLSearchParams({ range: filters.range });
  if (filters.range === "custom" && filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  return params.toString();
}

export function statisticsWindow(filters: StatisticsFilters, now = new Date()) {
  const today = dayTime(dayKey(now.getTime() + vietnamOffsetMs));
  const to = filters.range === "custom" && filters.to ? dayTime(filters.to) : today;
  let from: number;
  if (filters.range === "month") {
    from = dayTime(`${dayKey(today).slice(0, 7)}-01`);
  } else if (filters.range === "custom" && filters.from) {
    from = dayTime(filters.from);
  } else {
    from = to - (Number.parseInt(filters.range, 10) - 1) * dayMs;
  }
  const days = (to - from) / dayMs + 1;
  const group = filters.group !== "auto" ? filters.group : days <= 45 ? "day" : days <= 120 ? "week" : "month";
  return {
    from: dayKey(from),
    to: dayKey(to),
    group,
    start: new Date(from - vietnamOffsetMs),
    end: new Date(to + dayMs - vietnamOffsetMs),
  };
}

export function statisticsPoints(
  window: Pick<StatisticsReport, "from" | "to" | "group">,
  values: ReadonlyMap<string, number>,
  bills?: ReadonlyMap<string, number>,
): StatisticsReport["points"] {
  const end = dayTime(window.to);
  const points: StatisticsReport["points"] = [];
  for (let start = dayTime(window.from); start <= end;) {
    const date = new Date(start);
    let next = start + dayMs;
    if (window.group === "week") {
      next = start + (7 - ((date.getUTCDay() + 6) % 7)) * dayMs;
    } else if (window.group === "month") {
      date.setUTCMonth(date.getUTCMonth() + 1, 1);
      next = date.getTime();
    }
    let value = 0;
    let billCount = 0;
    for (let day = start; day < next && day <= end; day += dayMs) {
      const key = dayKey(day);
      value += values.get(key) ?? 0;
      billCount += bills?.get(key) ?? 0;
    }
    points.push({
      from: dayKey(start),
      to: dayKey(Math.min(end, next - dayMs)),
      value,
      ...(bills ? { billCount } : {}),
    });
    start = next;
  }
  return points;
}
