import Link from "next/link";
import { BookX } from "lucide-react";

export default function ReaderNotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <BookX className="h-12 w-12 text-blue-500" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Không tìm thấy nội dung</h1>
      <p className="text-sm leading-6 opacity-75">Truyện hoặc chương bạn tìm có thể đã được chuyển hoặc gỡ bỏ. Hãy thử tìm lại bằng tên truyện.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/tim-kiem" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">Tìm truyện</Link>
        <Link href="/" className="rounded-xl border px-5 py-3 text-sm font-semibold hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">Về trang chủ</Link>
      </div>
    </section>
  );
}
