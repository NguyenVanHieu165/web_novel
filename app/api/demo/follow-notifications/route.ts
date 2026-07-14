import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";

function serialize(data: unknown) {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? value.toString() : value
        )
    );
}

// GET: Lấy danh sách truyện và tài khoản để chạy demo
export async function GET() {
    try {
        const [stories, users] = await Promise.all([
            prisma.truyen.findMany({
                where: { isDeleted: false },
                take: 10,
                select: { idTruyen: true, tenTruyen: true }
            }),
            prisma.taiKhoan.findMany({
                take: 10,
                select: { idTaiKhoan: true, tenTaiKhoan: true }
            })
        ]);

        return NextResponse.json({
            success: true,
            stories: serialize(stories),
            users: serialize(users)
        });
    } catch (error) {
        console.error("GET Demo Data Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}

// POST: Thực hiện theo dõi truyện và trigger gửi thông báo qua WebSocket
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const idTruyen = Number(body.idTruyen);
        const idTaiKhoan = Number(body.idTaiKhoan);

        if (!idTruyen || !idTaiKhoan) {
            return NextResponse.json({
                success: false,
                message: "Thiếu idTruyen hoặc idTaiKhoan"
            }, { status: 400 });
        }

        // 1. Kiểm tra xem truyện và tài khoản có tồn tại không
        const [story, user] = await Promise.all([
            prisma.truyen.findUnique({ where: { idTruyen } }),
            prisma.taiKhoan.findUnique({ where: { idTaiKhoan } })
        ]);

        if (!story || !user) {
            return NextResponse.json({
                success: false,
                message: "Không tìm thấy Truyện hoặc Tài khoản tương ứng"
            }, { status: 404 });
        }

        // 2. Kiểm tra xem đã theo dõi chưa, nếu chưa thì tạo mới
        const existingFollow = await prisma.theoDoiTruyen.findUnique({
            where: {
                idTaiKhoan_idTruyen: { idTaiKhoan, idTruyen }
            }
        });

        let followRecord;
        let actionType = "follow";

        if (existingFollow) {
            // Nếu đã theo dõi rồi, demo sẽ hủy theo dõi để có thể bấm lại nhiều lần test
            await prisma.theoDoiTruyen.delete({
                where: {
                    idTheoDoiTruyen: existingFollow.idTheoDoiTruyen
                }
            });
            actionType = "unfollow";
        } else {
            followRecord = await prisma.theoDoiTruyen.create({
                data: {
                    idTruyen,
                    idTaiKhoan,
                    thong_bao_chuong_moi: true
                }
            });
        }

        // 3. Nếu là hành động theo dõi (follow), gọi điện kích hoạt thông báo qua Socket Server
        if (actionType === "follow") {
            const socketServerUrl = process.env.SOCKET_SERVER_URL || "http://localhost:3001";
            const secretToken = process.env.INTERNAL_SECRET_TOKEN || "super-secret-token";

            try {
                // Gọi bất đồng bộ (fire-and-forget), không dùng await để tránh block client nếu socket server phản hồi chậm
                fetch(`${socketServerUrl}/api/trigger-notification`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${secretToken}`
                    },
                    body: JSON.stringify({
                        type: "new-follow",
                        title: "Lượt theo dõi mới! 📖",
                        message: `Độc giả "${user.tenTaiKhoan}" vừa bấm theo dõi truyện "${story.tenTruyen}"`,
                        data: {
                            idTruyen,
                            tenTruyen: story.tenTruyen,
                            tenTaiKhoan: user.tenTaiKhoan,
                            idTaiKhoan
                        }
                    })
                }).then(res => {
                    if (!res.ok) {
                        console.error(`[Next.js API] Socket server returned status ${res.status}`);
                    }
                }).catch(err => {
                    console.error("[Next.js API] Socket server request connection failed:", err.message);
                });
            } catch (socketErr: any) {
                console.error("[Next.js API] Fail to fetch Socket Server:", socketErr.message);
            }
        }

        return NextResponse.json({
            success: true,
            action: actionType,
            message: actionType === "follow" ? "Theo dõi truyện thành công" : "Hủy theo dõi truyện thành công"
        });

    } catch (error) {
        console.error("POST Follow Demo Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}
