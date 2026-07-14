import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resSuccess, resError, getRequestId } from "@/lib/api"
export async function GET() {
    const requestId = getRequestId();
    try {
        const useTotal = await prisma.taiKhoan.count();
        const truyensTotal = await prisma.truyen.count();
        const chuongsTotal = await prisma.chuong.count();
        const viewsTotal = await prisma.truyen.aggregate({
            _sum: {
                luotXem: true,
            },
        });
        const revenueTotal = await prisma.hoaDonNap.aggregate({
            _sum: {
                soTienVnd: true,
            },
            where: {
                trang_thai: "success"
            }
        });
        const data = {
            useTotal,
            truyensTotal,
            chuongsTotal,
            viewsTotal: Number(viewsTotal._sum.luotXem || 0),
            revenueTotal: Number(revenueTotal._sum.soTienVnd || 0)
        };
        return NextResponse.json(resSuccess(data, {
            message
                : "Dashboard data fetched successfully", requestId
        }));
    }
    catch (err: any) {
        NextResponse.json(resError({
            message: "Failed to fetch dashboard data",
            error: { details: err.message },
            requestId
        }), { status: 500 });
    }
}
