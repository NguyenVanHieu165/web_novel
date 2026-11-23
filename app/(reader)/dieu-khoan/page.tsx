import type { Metadata } from "next";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Điều Khoản Sử Dụng",
  description: "Điều khoản sử dụng dịch vụ La Ca Truyện.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 pb-16">
      <PageHeader><PageHeaderContent><PageHeaderTitle className="text-3xl sm:text-4xl">Điều Khoản Sử Dụng</PageHeaderTitle><PageHeaderDescription>Cập nhật ngày 23/11/2026</PageHeaderDescription></PageHeaderContent></PageHeader>
      <Card><CardContent className="space-y-6 leading-7 text-muted-foreground">
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Sử dụng dịch vụ</CardTitle></CardHeader><p>Bạn chịu trách nhiệm bảo mật tài khoản và sử dụng nền tảng đúng pháp luật, không can thiệp vào hệ thống hoặc quyền truy cập của người khác.</p></section>
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Nội dung & quyền sở hữu</CardTitle></CardHeader><p>Không sao chép, phát tán hoặc khai thác nội dung trái với quyền của tác giả, nhà cung cấp nội dung hoặc nền tảng.</p></section>
        <section><CardHeader className="px-0"><CardTitle className="text-xl text-foreground">Tài khoản & giao dịch</CardTitle></CardHeader><p>Các thao tác mở khóa nội dung và giao dịch phải xuất phát từ tài khoản của bạn. Hãy liên hệ quản trị viên nếu phát hiện hoạt động bất thường.</p></section>
      </CardContent></Card>
    </main>
  );
}
