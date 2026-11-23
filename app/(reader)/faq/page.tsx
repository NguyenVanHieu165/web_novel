import type { Metadata } from "next";

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
      <header className="space-y-3">
        <h1 className="text-pretty text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">Câu Hỏi Thường Gặp</h1>
        <p className="text-slate-600 dark:text-zinc-400">Thông tin nhanh để bạn sử dụng La Ca Truyện thuận tiện hơn.</p>
      </header>
      <div className="space-y-4">
        {QUESTIONS.map(([question, answer]) => (
          <section key={question} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">{question}</h2>
            <p className="mt-2 leading-7 text-slate-600 dark:text-zinc-300">{answer}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
