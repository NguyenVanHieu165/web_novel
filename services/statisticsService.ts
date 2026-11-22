import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { statisticsPoints, statisticsWindow, type StatisticsFilters, type StatisticsReport } from "@/lib/admin-statistics";

const active = Prisma.sql`(is_deleted = 0 OR is_deleted IS NULL)`;
const sources = {
  users: { table: Prisma.sql`tai_khoan`, where: active, value: Prisma.sql`COUNT(*)` },
  stories: { table: Prisma.sql`truyen`, where: active, value: Prisma.sql`COUNT(*)` },
  chapters: { table: Prisma.sql`chuong`, where: active, value: Prisma.sql`COUNT(*)` },
  revenue: { table: Prisma.sql`hoa_don_nap`, where: Prisma.sql`trang_thai = 'success'`, value: Prisma.sql`SUM(so_tien_vnd)` },
  orders: { table: Prisma.sql`hoa_don_nap`, where: Prisma.sql`trang_thai = 'success'`, value: Prisma.sql`COUNT(*)` },
};

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
