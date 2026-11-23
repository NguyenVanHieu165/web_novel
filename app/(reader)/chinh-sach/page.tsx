import type { Metadata } from "next";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Chính Sách Bảo Mật",
  description: "Chính sách bảo mật và xử lý dữ liệu trên La Ca Truyện.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 pb-16">
      <PageHeader><PageHeaderContent><PageHeaderTitle className="text-3xl sm:text-4xl">Chính Sách Bảo Mật</PageHeaderTitle><PageHeaderDescription>Cập nhật ngày 23/11/2026</PageHeaderDescription></PageHeaderContent></PageHeader>
      <Card><CardContent className="space-y-6 leading-7 text-muted-foreground">
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Dữ liệu được sử dụng</CardTitle></CardHeader><p>La Ca Truyện xử lý thông tin cần thiết để xác thực tài khoản, lưu lịch sử đọc, cung cấp tính năng cá nhân và bảo vệ dịch vụ.</p></section>
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Bảo vệ dữ liệu</CardTitle></CardHeader><p>Thông tin nhạy cảm được xử lý ở phía máy chủ. Bạn không nên chia sẻ mật khẩu, mã đăng nhập hoặc thông tin phiên với bất kỳ ai.</p></section>
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Liên hệ</CardTitle></CardHeader><p>Nếu có câu hỏi về dữ liệu cá nhân, hãy liên hệ qua địa chỉ email được công bố ở chân trang.</p></section>
      </CardContent></Card>
    </main>
  );
}
