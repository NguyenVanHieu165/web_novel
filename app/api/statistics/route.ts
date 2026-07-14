import { NextResponse } from "next/server";

import { getFullStatistics } from "@/services/statisticsService";

export async function GET() {
    try {
        const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        const results = await Promise.all(
            months.map((month) =>
                getFullStatistics(month, 2026)
            )
        );

        const chartData = results.map((data, index) => ({
            name: `T${index + 1}`,

            totalRevenue: Number(
                data.finance._sum?.soTienVnd || 0
            ),

            billCount: Number(
                data.finance._count || 0
            ),

            newUserCount: Number(
                data.userCount || 0
            ),

            newStoryCount: Number(
                data.storyCount || 0
            ),

            viewCount: Number(
                data.ranking?.[0]?.luotXem || 0
            ),
        }));

        console.log(chartData);

        return NextResponse.json({
            chartData,
        });
    } catch (error: any) {
        console.error(error);

        return NextResponse.json(
            {
                message: "Lỗi server",
            },
            {
                status: 500,
            }
        );
    }
}