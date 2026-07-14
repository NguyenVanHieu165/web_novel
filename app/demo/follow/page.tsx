"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Users,
  Bell,
  CheckCircle2,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export default function FollowDemoPage() {
  const [stories, setStories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedStory, setSelectedStory] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [followedState, setFollowedState] = useState<boolean>(false);

  useEffect(() => {
    const fetchDemoData = async () => {
      try {
        setLoadingData(true);
        const response = await fetch("/api/demo/follow-notifications");
        const resData = await response.json();
        if (resData.success) {
          setStories(resData.stories || []);
          setUsers(resData.users || []);
          if (resData.stories.length > 0)
            setSelectedStory(resData.stories[0].idTruyen.toString());
          if (resData.users.length > 0)
            setSelectedUser(resData.users[0].idTaiKhoan.toString());
        } else {
          toast.error("Không thể tải danh sách dữ liệu demo");
        }
      } catch (error) {
        console.error("Fetch Demo Data Error:", error);
        toast.error("Lỗi khi kết nối đến API lấy dữ liệu");
      } finally {
        setLoadingData(false);
      }
    };

    fetchDemoData();
  }, []);

  const handleFollowToggle = async () => {
    if (!selectedStory || !selectedUser) {
      toast.warning("Vui lòng chọn đầy đủ Truyện và Người dùng");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/demo/follow-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idTruyen: Number(selectedStory),
          idTaiKhoan: Number(selectedUser),
        }),
      });

      const resData = await response.json();
      if (resData.success) {
        if (resData.action === "follow") {
          setFollowedState(true);
          toast.success("Đã theo dõi truyện thành công!", {
            description: "Thông báo đã được gửi đến kênh WebSocket của Admin.",
          });
        } else {
          setFollowedState(false);
          toast.info("Đã hủy theo dõi truyện.");
        }
      } else {
        toast.error(resData.message || "Xử lý thất bại");
      }
    } catch (error) {
      console.error("Follow Error:", error);
      toast.error("Lỗi kết nối khi gửi yêu cầu theo dõi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-teal-50 flex items-center justify-center p-6 font-sans">
      <Toaster position="top-right" richColors />

      <div className="w-full max-w-lg bg-white/80 backdrop-blur-md rounded-3xl shadow-xl border border-white/50 p-8 flex flex-col space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-100 text-indigo-600 rounded-2xl mb-2">
            <Bell size={28} className="animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
            Demo Theo Dõi Truyện
          </h1>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Giả lập hành động độc giả bấm theo dõi để gửi thông báo thời gian
            thực đến trang quản trị Admin.
          </p>
        </div>
        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <span className="text-sm text-gray-500 font-medium">
              Đang tải dữ liệu mẫu...
            </span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Selector Người dùng */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={14} className="text-indigo-500" />
                1. Chọn Người Dùng (Độc giả)
              </label>
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setFollowedState(false); // Reset state follow test khi đổi
                }}
                className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm font-medium"
              >
                {users.length > 0 ? (
                  users.map((u) => (
                    <option key={u.idTaiKhoan} value={u.idTaiKhoan}>
                      {u.tenTaiKhoan} (ID: #{u.idTaiKhoan})
                    </option>
                  ))
                ) : (
                  <option value="">Không có tài khoản nào</option>
                )}
              </select>
            </div>

            {/* Selector Truyện */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen size={14} className="text-teal-500" />
                2. Chọn Truyện Chữ/Manga
              </label>
              <select
                value={selectedStory}
                onChange={(e) => {
                  setSelectedStory(e.target.value);
                  setFollowedState(false); // Reset state follow test khi đổi
                }}
                className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200 text-sm font-medium"
              >
                {stories.length > 0 ? (
                  stories.map((s) => (
                    <option key={s.idTruyen} value={s.idTruyen}>
                      {s.tenTruyen} (ID: #{s.idTruyen})
                    </option>
                  ))
                ) : (
                  <option value="">Không có truyện nào</option>
                )}
              </select>
            </div>

            {/* Nút bấm Theo dõi */}
            <div className="pt-4">
              <button
                onClick={handleFollowToggle}
                disabled={
                  submitting || stories.length === 0 || users.length === 0
                }
                className={`w-full py-4 px-6 rounded-2xl font-bold text-white shadow-lg transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 hover:shadow-xl cursor-pointer ${
                  submitting
                    ? "bg-slate-400 cursor-not-allowed shadow-none"
                    : followedState
                      ? "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600"
                      : "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800"
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Đang xử lý...</span>
                  </>
                ) : followedState ? (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Đang Theo Dõi (Click để Hủy)</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus size={20} />
                    <span>Bấm Theo Dõi Ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer Notes */}
        <div className="text-center text-xs text-gray-400 pt-4 border-t border-slate-100 flex flex-col gap-1">
          <span>
            💡 Khi bấm theo dõi, một sự kiện sẽ được gửi đến máy chủ Socket.IO.
          </span>
          <span>Hãy mở trang Admin Dashboard để nhận kết quả tức thời.</span>
        </div>
      </div>
    </div>
  );
}
