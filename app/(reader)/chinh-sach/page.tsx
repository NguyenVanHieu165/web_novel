import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính Sách Bảo Mật",
  description: "Chính sách bảo mật và xử lý dữ liệu trên La Ca Truyện.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 pb-16">
      <header className="space-y-3">
        <h1 className="text-pretty text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">Chính Sách Bảo Mật</h1>
        <p className="text-slate-500 dark:text-zinc-400">Cập nhật ngày 23/11/2026</p>
      </header>
      <div className="space-y-6 leading-7 text-slate-700 dark:text-zinc-300">
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Dữ liệu được sử dụng</h2><p className="mt-2">La Ca Truyện xử lý thông tin cần thiết để xác thực tài khoản, lưu lịch sử đọc, cung cấp tính năng cá nhân và bảo vệ dịch vụ.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Bảo vệ dữ liệu</h2><p className="mt-2">Thông tin nhạy cảm được xử lý ở phía máy chủ. Bạn không nên chia sẻ mật khẩu, mã đăng nhập hoặc thông tin phiên với bất kỳ ai.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Liên hệ</h2><p className="mt-2">Nếu có câu hỏi về dữ liệu cá nhân, hãy liên hệ qua địa chỉ email được công bố ở chân trang.</p></section>
      </div>
    </main>
  );
}
