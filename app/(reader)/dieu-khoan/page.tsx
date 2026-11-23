import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều Khoản Sử Dụng",
  description: "Điều khoản sử dụng dịch vụ La Ca Truyện.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 pb-16">
      <header className="space-y-3">
        <h1 className="text-pretty text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">Điều Khoản Sử Dụng</h1>
        <p className="text-slate-500 dark:text-zinc-400">Cập nhật ngày 23/11/2026</p>
      </header>
      <div className="space-y-6 leading-7 text-slate-700 dark:text-zinc-300">
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Sử dụng dịch vụ</h2><p className="mt-2">Bạn chịu trách nhiệm bảo mật tài khoản và sử dụng nền tảng đúng pháp luật, không can thiệp vào hệ thống hoặc quyền truy cập của người khác.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Nội dung & quyền sở hữu</h2><p className="mt-2">Không sao chép, phát tán hoặc khai thác nội dung trái với quyền của tác giả, nhà cung cấp nội dung hoặc nền tảng.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950 dark:text-white">Tài khoản & giao dịch</h2><p className="mt-2">Các thao tác mở khóa nội dung và giao dịch phải xuất phát từ tài khoản của bạn. Hãy liên hệ quản trị viên nếu phát hiện hoạt động bất thường.</p></section>
      </div>
    </main>
  );
}
