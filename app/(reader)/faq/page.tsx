import type { Metadata } from "next";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Câu Hỏi Thường Gặp",
  description: "Giải đáp các câu hỏi thường gặp khi đọc và quản lý tài khoản trên La Ca Truyện.",
};

const QUESTIONS = [
  ["Tôi có cần tài khoản để đọc truyện không?", "Bạn có thể đọc các chương miễn phí mà không cần đăng nhập. Tài khoản giúp lưu lịch sử, theo dõi truyện và sử dụng các tính năng cá nhân."],
  ["Làm sao tiếp tục chương đang đọc?", "Sau khi đăng nhập, lịch sử và tiến độ đọc sẽ giúp bạn quay lại chương gần nhất trên các thiết bị."],
  ["Tôi cần làm gì khi audio không phát?", "Hãy tải lại trang, kiểm tra kết nối mạng và thử lại sau. Bạn vẫn có thể dùng giọng đọc của trình duyệt nếu dịch vụ audio tạm thời gián đoạn."],
] as const;

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 pb-16">
      <PageHeader><PageHeaderContent><PageHeaderTitle className="text-3xl sm:text-4xl">Câu Hỏi Thường Gặp</PageHeaderTitle><PageHeaderDescription>Thông tin nhanh để bạn sử dụng La Ca Truyện thuận tiện hơn.</PageHeaderDescription></PageHeaderContent></PageHeader>
      <div className="space-y-4">
        {QUESTIONS.map(([question, answer]) => (
          <Card key={question}>
            <CardHeader><CardTitle className="text-lg">{question}</CardTitle></CardHeader>
            <CardContent><p className="leading-7 text-muted-foreground">{answer}</p></CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
