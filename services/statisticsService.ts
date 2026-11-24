import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { CHAPTER_VIEW_ACTION } from "@/lib/chapter-view-log";
import {
  dashboardViewTotal,
  statisticsPoints,
  statisticsWindow,
  type DashboardOverview,
  type StatisticsFilters,
  type StatisticsReport,
} from "@/lib/admin-statistics";

const active = Prisma.sql`(is_deleted = 0 OR is_deleted IS NULL)`;
const sources = {
  users: { table: Prisma.sql`tai_khoan`, where: active, value: Prisma.sql`COUNT(*)` },
  stories: { table: Prisma.sql`truyen`, where: active, value: Prisma.sql`COUNT(*)` },
  chapters: { table: Prisma.sql`chuong`, where: active, value: Prisma.sql`COUNT(*)` },
  revenue: { table: Prisma.sql`hoa_don_nap`, where: Prisma.sql`trang_thai = 'success'`, value: Prisma.sql`SUM(so_tien_vnd)` },
  orders: { table: Prisma.sql`hoa_don_nap`, where: Prisma.sql`trang_thai = 'success'`, value: Prisma.sql`COUNT(*)` },
};

function isMissingSystemLogTable(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2021";
}

async function getChapterViewActivity(createdAt: { gte: Date; lt: Date }) {
  try {
    const [count, latest] = await Promise.all([
      prisma.nhatKyHeThong.count({
        where: { nguon: CHAPTER_VIEW_ACTION, createdAt },
      }),
      prisma.nhatKyHeThong.findFirst({
        where: { nguon: CHAPTER_VIEW_ACTION },
        select: { idNhatKy: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { count, hasLogs: Boolean(latest) };
  } catch (error) {
    if (!isMissingSystemLogTable(error)) throw error;
    console.warn("System log table is unavailable; dashboard views are using the legacy fallback.");
    return { count: 0, hasLogs: false };
  }
}

export async function getStatisticsReport(filters: StatisticsFilters): Promise<StatisticsReport> {
  const { from, to, group, start, end } = statisticsWindow(filters);
  const { table, where, value } = sources[filters.metric];
  const includeBills = filters.metric === "revenue";
  const billColumn = includeBills ? Prisma.sql`, COUNT(*) AS billCount` : Prisma.empty;
  // Timestamp bounds remain indexable. Only the grouping key converts UTC to Vietnam time.
  const rows = await prisma.$queryRaw<Array<{ day: string; value: Prisma.Decimal | bigint; billCount?: bigint }>>`
    SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 7 HOUR), '%Y-%m-%d') AS day, ${value} AS value${billColumn}
    FROM ${table}
    WHERE created_at >= ${start} AND created_at < ${end} AND ${where}
    GROUP BY day
  `;
  const values = new Map(rows.map((row) => [row.day, Number(row.value)]));
  const bills = includeBills ? new Map(rows.map((row) => [row.day, Number(row.billCount ?? 0)])) : undefined;
  return { from, to, group, points: statisticsPoints({ from, to, group }, values, bills) };
}

export async function getDashboardOverview(filters: StatisticsFilters): Promise<DashboardOverview> {
  const { from, to, start, end } = statisticsWindow(filters);
  const createdAt = { gte: start, lt: end };
  const [useTotal, truyensTotal, chuongsTotal, chapterViewActivity, revenue] = await Promise.all([
    prisma.taiKhoan.count({
      where: {
        createdAt,
        OR: [{ isDeleted: false }, { isDeleted: null }],
      },
    }),
    prisma.truyen.count({
      where: {
        createdAt,
        OR: [{ isDeleted: false }, { isDeleted: null }],
      },
    }),
    prisma.chuong.count({
      where: {
        createdAt,
        OR: [{ isDeleted: false }, { isDeleted: null }],
      },
    }),
    getChapterViewActivity(createdAt),
    prisma.hoaDonNap.aggregate({
      _sum: { soTienVnd: true },
      where: {
        createdAt,
        trang_thai: "success",
      },
    }),
  ]);

  const legacyViews = chapterViewActivity.hasLogs ? 0 : Number((await prisma.truyen.aggregate({
    _sum: { luotXem: true },
    where: {
      createdAt,
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
  }))._sum.luotXem ?? 0);

  return {
    useTotal,
    truyensTotal,
    chuongsTotal,
    viewsTotal: dashboardViewTotal(chapterViewActivity.count, chapterViewActivity.hasLogs, legacyViews),
    revenueTotal: Number(revenue._sum.soTienVnd ?? 0),
    onlineStats: null,
    from,
    to,
  };
}
