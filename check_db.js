import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== KIỂM TRA DATABASE ===");
  try {
    const totalAccounts = await prisma.taiKhoan.count();
    console.log("Tổng số tài khoản trong DB:", totalAccounts);

    const accounts = await prisma.taiKhoan.findMany({ take: 5 });
    console.log("Top 5 tài khoản:", accounts.map(a => `ID: ${a.idTaiKhoan}, Username: ${a.tenTaiKhoan}`));

    const totalNotifications = await prisma.thongBao.count();
    console.log("Tổng số thông báo trong DB:", totalNotifications);

    const notifications = await prisma.thongBao.findMany({ take: 10, orderBy: { idThongBao: "desc" } });
    console.log("10 thông báo gần nhất:", notifications);
  } catch (error) {
    console.error("Lỗi truy vấn database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
