import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
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