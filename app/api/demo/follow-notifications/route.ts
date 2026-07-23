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

// POST: Thực hiện theo dõi hoặc giả lập các loại thông báo khác và lưu vào Database thực tế
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const category = body.category || "follow";
        const priority = body.priority || "normal";
        const socketServerUrl = process.env.SOCKET_SERVER_URL || "http://localhost:3001";
        const secretToken = process.env.INTERNAL_SECRET_TOKEN || "super-secret-token";

        // Tìm một tài khoản Admin/User ngẫu nhiên làm người nhận thông báo để tránh lỗi khóa ngoại (Foreign Key)
        const firstUser = await prisma.taiKhoan.findFirst({ select: { idTaiKhoan: true } });
        const idTaiKhoanAdmin = firstUser?.idTaiKhoan || 1;

        // 1. GIẢ LẬP THEO DÕI TRUYỆN (FOLLOW) - CÓ TƯƠNG TÁC DB THỰC TẾ
        if (category === "follow") {
            const idTruyen = Number(body.idTruyen);
            const idTaiKhoan = Number(body.idTaiKhoan);

            if (!idTruyen || !idTaiKhoan) {
                return NextResponse.json({ success: false, message: "Thiếu idTruyen hoặc idTaiKhoan" }, { status: 400 });
            }

            const [story, user] = await Promise.all([
                prisma.truyen.findUnique({ where: { idTruyen } }),
                prisma.taiKhoan.findUnique({ where: { idTaiKhoan } })
            ]);

            if (!story || !user) {
                return NextResponse.json({ success: false, message: "Không tìm thấy Truyện hoặc Tài khoản" }, { status: 404 });
            }

            const existingFollow = await prisma.theoDoiTruyen.findUnique({
                where: { idTaiKhoan_idTruyen: { idTaiKhoan, idTruyen } }
            });

            let actionType = "follow";

            if (existingFollow) {
                await prisma.theoDoiTruyen.delete({ where: { idTheoDoiTruyen: existingFollow.idTheoDoiTruyen } });
                actionType = "unfollow";
            } else {
                await prisma.theoDoiTruyen.create({
                    data: { idTruyen, idTaiKhoan, thong_bao_chuong_moi: true }
                });
            }

            // Gọi trigger sang Socket Server nếu là follow
            if (actionType === "follow") {
                const title = "Lượt theo dõi mới! 📖";
                const message = `Độc giả "${user.tenTaiKhoan}" vừa bấm theo dõi truyện "${story.tenTruyen}"`;

                // Lưu vào bảng ThongBao trong Database
                await prisma.thongBao.create({
                    data: {
                        idTaiKhoan: idTaiKhoan, // Độc giả nhận thông báo
                        tieu_de: title,
                        noiDung: message,
                        daDoc: false
                    }
                });

                triggerSocketNotification(socketServerUrl, secretToken, {
                    type: "new-follow",
                    category: "follow",
                    priority: "normal",
                    title,
                    message,
                    data: { idTruyen, tenTruyen: story.tenTruyen, tenTaiKhoan: user.tenTaiKhoan, idTaiKhoan }
                });
            }

            return NextResponse.json({
                success: true,
                action: actionType,
                message: actionType === "follow" ? "Theo dõi truyện thành công" : "Hủy theo dõi truyện thành công"
            });
        }

        // 2. GIẢ LẬP BÁO CÁO VI PHẠM (REPORT)
        if (category === "report") {
            const reportReason = body.reportReason || "Chương bị trùng lặp nội dung";
            const storyName = body.storyName || "Đường Chuyên (Demo)";
            const username = body.username || "Thành viên ẩn danh";
            const title = "Báo cáo vi phạm mới! ⚠️";
            const message = `Độc giả "${username}" báo cáo lỗi truyện "${storyName}"`;

            // Lưu vào bảng ThongBao trong Database
            await prisma.thongBao.create({
                data: {
                    idTaiKhoan: idTaiKhoanAdmin,
                    tieu_de: title,
                    noiDung: message,
                    daDoc: false
                }
            });

            triggerSocketNotification(socketServerUrl, secretToken, {
                type: "new-report",
                category: "report",
                priority: priority,
                title,
                message,
                data: { tenTaiKhoan: username, tenTruyen: storyName, reportReason }
            });

            return NextResponse.json({ success: true, message: "Giả lập gửi báo cáo vi phạm thành công" });
        }

        // 3. GIẢ LẬP GIAO DỊCH NẠP TIỀN (TRANSACTION)
        if (category === "transaction") {
            const amount = Number(body.amount) || 50000;
            const username = body.username || "Độc giả VIP";
            const title = "Giao dịch nạp tiền mới! 💰";
            const message = `Tài khoản "${username}" vừa nạp thành công ${amount.toLocaleString("vi-VN")} đ vào ví`;

            // Lưu vào bảng ThongBao trong Database
            await prisma.thongBao.create({
                data: {
                    idTaiKhoan: idTaiKhoanAdmin,
                    tieu_de: title,
                    noiDung: message,
                    daDoc: false
                }
            });

            triggerSocketNotification(socketServerUrl, secretToken, {
                type: "new-transaction",
                category: "transaction",
                priority: priority,
                title,
                message,
                data: { tenTaiKhoan: username, amount }
            });

            return NextResponse.json({ success: true, message: "Giả lập giao dịch nạp tiền thành công" });
        }

        // 4. GIẢ LẬP SỰ KIỆN HỆ THỐNG (SYSTEM)
        if (category === "system") {
            const systemEvent = body.systemEvent || "Cập nhật thành công Version 2.1.0";
            const title = "Cập nhật hệ thống! 🛡️";
            const message = `Hệ thống vừa ghi nhận sự kiện: ${systemEvent}`;

            // Lưu vào bảng ThongBao trong Database
            await prisma.thongBao.create({
                data: {
                    idTaiKhoan: idTaiKhoanAdmin,
                    tieu_de: title,
                    noiDung: message,
                    daDoc: false
                }
            });

            triggerSocketNotification(socketServerUrl, secretToken, {
                type: "system-alert",
                category: "system",
                priority: priority,
                title,
                message,
                data: { systemEvent }
            });

            return NextResponse.json({ success: true, message: "Giả lập sự kiện hệ thống thành công" });
        }

        return NextResponse.json({ success: false, message: "Category không hợp lệ" }, { status: 400 });

    } catch (error) {
        console.error("POST Follow Demo Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}

// Hàm phụ trợ gửi request sang Socket Server độc lập
function triggerSocketNotification(serverUrl: string, token: string, payload: any) {
    fetch(`${serverUrl}/api/trigger-notification`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    }).then(res => {
        if (!res.ok) console.error(`[Socket Trigger] Returned status ${res.status}`);
    }).catch(err => {
        console.error("[Socket Trigger] Connection failed:", err.message);
    });
}
