import type { Metadata } from "next";
import ReadingHistory from "@/components/history/ReadingHistory";

export const metadata: Metadata = {
  title: "Lịch sử đọc | WebNovel",
  description: "Tiếp tục đọc các chương từ vị trí bạn đã lưu.",
};

export default function ReadingHistoryPage() {
  return <ReadingHistory />;
}
