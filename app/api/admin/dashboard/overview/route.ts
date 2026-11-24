import { NextRequest, NextResponse } from "next/server";
import { getRequestId, resError, resSuccess } from "@/lib/api";
import { statisticsFilters } from "@/lib/admin-statistics";
import { requireAdmin } from "@/lib/server/auth-session";
import { getOnlineStats } from "@/lib/server/online-stats";
import { getDashboardOverview } from "@/services/statisticsService";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const filters = statisticsFilters.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!filters.success) {
    return NextResponse.json(
      resError({
        message: filters.error.issues[0]?.code === "custom"
          ? filters.error.issues[0].message
          : "Bộ lọc thống kê không hợp lệ.",
        requestId: getRequestId(),
      }),
      { status: 400, headers: privateHeaders },
    );
  }

  const requestId = getRequestId();
  try {
    const [overview, onlineStats] = await Promise.all([
      getDashboardOverview(filters.data),
      getOnlineStats(),
    ]);
    const data = { ...overview, onlineStats };
    return NextResponse.json(
      resSuccess(data, {
        message: "Dashboard data fetched successfully",
        requestId,
        meta: { from: data.from, to: data.to },
      }),
      { headers: privateHeaders },
    );
  } catch (error: unknown) {
    console.error("Admin dashboard overview failed", error);
    return NextResponse.json(
      resError({
        message: "Failed to fetch dashboard data",
        requestId,
      }),
      { status: 500, headers: privateHeaders },
    );
  }
}
