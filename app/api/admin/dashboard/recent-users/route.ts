import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const users = await prisma.taiKhoan.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
            idTaiKhoan: true,
            tenTaiKhoan: true,
            createdAt: true,
        },
    });

    return NextResponse.json({ users });
}
