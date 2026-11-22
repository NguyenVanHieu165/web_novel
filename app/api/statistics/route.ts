import { NextResponse, type NextRequest } from "next/server";

import { statisticsFilters } from "@/lib/admin-statistics";
import { requireAdmin } from "@/lib/server/auth-session";
import { getStatisticsReport } from "@/services/statisticsService";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const filters = statisticsFilters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!filters.success) {
      return NextResponse.json(
        { message: filters.error.issues[0]?.code === "custom" ? filters.error.issues[0].message : "Bộ lọc thống kê không hợp lệ." },
        { status: 400, headers: privateHeaders },
      );
    }

    return NextResponse.json(await getStatisticsReport(filters.data), { headers: privateHeaders });
  } catch (error) {
    console.error("Admin statistics failed", error);
    return NextResponse.json({ message: "Không tải được thống kê." }, { status: 500, headers: privateHeaders });
  }
}
