import type { Metadata } from "next";
import Bookshelf from "@/components/story/Bookshelf";

export const metadata: Metadata = {
  title: "Tủ sách của bạn | WebNovel",
  description: "Các truyện bạn đang theo dõi, được lưu trong tài khoản của bạn.",
  robots: { index: false, follow: false },
};

export default function BookshelfPage() {
  return <Bookshelf />;
}
