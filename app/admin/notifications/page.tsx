"use client";

import { useCallback, useEffect, useState, useRef, useSyncExternalStore } from "react";
import {
  Bell,
  Trash2,
  ArrowLeft,
  Calendar,
  User,
  BookOpen,
  Inbox,
  AlertTriangle,
  DollarSign,
  ShieldAlert,
  Bookmark,
  MoreVertical,
  Check,
  CheckCheck,
  EyeOff,
  Search,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/axios";
import type { AdminNotificationResponse } from "@/lib/admin-notification-types";

export type NotificationCategory =
  | "follow"
  | "report"
  | "transaction"
  | "system";
type CategoryTab = "all" | NotificationCategory;
type StatusFilter = "all" | "unread" | "read";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: "urgent" | "warning" | "success" | "normal";
  isRead: boolean;
  timestamp: string;
  data?: {
    idTruyen?: number;
    tenTruyen?: string;
    tenTaiKhoan?: string;
    idTaiKhoan?: number;
    amount?: number;
    reportReason?: string;
    systemEvent?: string;
  };
}

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const mounted = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback((nextPage = 1, append = false) => {
    if (append && requestRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError(false);
    return api.get<AdminNotificationResponse>("/admin/notifications", { params: { page: nextPage, limit: 20 }, signal: controller.signal }).then((res) => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const result = res.data;

      if (result.success) {
        // Ánh xạ dữ liệu từ DB sang cấu trúc hiển thị của UI
        const mappedList: NotificationItem[] = result.data.map((dbItem) => {
          const title = dbItem.tieu_de || "Thông báo mới";
          let category: NotificationCategory = "follow";
          let priority: "urgent" | "warning" | "success" | "normal" = "normal";

          // Nhận diện category và priority từ tiêu đề thông báo
          if (title.includes("⚠️") || title.toLowerCase().includes("báo cáo")) {
            category = "report";
            priority = "warning";
          } else if (title.includes("💰") || title.toLowerCase().includes("giao dịch")) {
            category = "transaction";
            priority = "success";
          } else if (title.includes("🛡️") || title.includes("⚙️") || title.toLowerCase().includes("hệ thống")) {
            category = "system";
            priority = "warning";
          }

          // Trích xuất dữ liệu phụ trợ
          const data: NonNullable<NotificationItem["data"]> = {};
          
          const userMatch = dbItem.noiDung?.match(/(?:Độc giả|Tài khoản)\s+"([^"]+)"/);
          if (userMatch && userMatch[1]) {
            data.tenTaiKhoan = userMatch[1];
          }

          const storyMatch = dbItem.noiDung?.match(/truyện\s+"([^"]+)"/);
          if (storyMatch && storyMatch[1]) {
            data.tenTruyen = storyMatch[1];
          }

          if (category === "report") {
            const reasonMatch = dbItem.noiDung?.match(/lý do:\s*(.*)/i);
            data.reportReason = reasonMatch ? reasonMatch[1] : "Chương lỗi / nội dung lỗi";
          }

          if (category === "transaction") {
            const amountMatch = dbItem.noiDung?.match(/nạp thành công\s+([\d.,]+)\s*đ/);
            if (amountMatch && amountMatch[1]) {
              data.amount = parseInt(amountMatch[1].replace(/[.,]/g, ""));
            }
          }

          return {
            id: dbItem.idThongBao.toString(),
            title: title,
            message: dbItem.noiDung || "",
            category: category,
            priority: priority,
            isRead: !!dbItem.daDoc,
            timestamp: dbItem.createdAt || new Date().toISOString(),
            data: data
          };
        });

        setNotifications((previous) => append ? [...new Map([...previous, ...mappedList].map((item) => [item.id, item])).values()] : mappedList);
        setPage(result.meta.page);
        setHasMore(result.meta.page < result.meta.totalPage);
        setUnreadCount(result.unreadCount);
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      console.error(error);
      setLoadError(true);
      toast.error("Không thể tải thông báo");
    }).finally(() => {
      if (!controller.signal.aborted && version === requestVersion.current) { requestRef.current = null; setLoading(false); }
    });
  }, []);

  // 1. Đọc dữ liệu khi component mount
  useEffect(() => {
    void fetchNotifications();
    return () => { requestRef.current?.abort(); };
  }, [fetchNotifications]);

  // 2. Lắng nghe sự kiện WebSocket cập nhật từ Sidebar (Real-time)
  useEffect(() => {
    const handleNotificationUpdate = () => {
      fetchNotifications();
    };

    window.addEventListener("new-follow-event", handleNotificationUpdate);
    window.addEventListener("notifications-updated", handleNotificationUpdate);
    return () => {
      window.removeEventListener("new-follow-event", handleNotificationUpdate);
      window.removeEventListener(
        "notifications-updated",
        handleNotificationUpdate,
      );
    };
  }, [fetchNotifications]);

  // 3. Đóng menu ngữ cảnh 3 chấm khi click ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 4. Các hàm xử lý sự nghiệp (Actions)

  // Đánh dấu 1 thông báo là đã đọc
  const handleMarkAsRead = async (id: string, isReadState: boolean = true) => {
    try {
      const res = await api.put("/admin/notifications", { id, isRead: isReadState });
      if (res.data.success) {
        setNotifications((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              return { ...item, isRead: isReadState };
            }
            return item;
          })
        );
        // Đồng bộ lại đếm chưa đọc trên Sidebar
        window.dispatchEvent(new CustomEvent("notifications-updated"));
      }
    } catch (e) {
      console.error("Lỗi cập nhật trạng thái đã đọc:", e);
      toast.error("Không thể cập nhật trạng thái đọc");
    }
    setActiveMenuId(null);
  };

  // Đánh dấu tất cả là đã đọc
  const handleMarkAllAsRead = async () => {
    try {
      const res = await api.put("/admin/notifications", { all: true });
      if (res.data.success) {
        setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
        window.dispatchEvent(new CustomEvent("notifications-updated"));
        toast.success("Đã đánh dấu tất cả thông báo là đã đọc!");
      }
    } catch (e) {
      console.error("Lỗi đánh dấu đọc tất cả:", e);
      toast.error("Không thể đánh dấu tất cả đã đọc");
    }
  };

  // Xóa một thông báo cụ thể
  const handleDelete = async (id: string) => {
    try {
      const res = await api.delete(`/admin/notifications?id=${id}`);
      if (res.data.success) {
        setNotifications((prev) => prev.filter((item) => item.id !== id));
        window.dispatchEvent(new CustomEvent("notifications-updated"));
        toast.info("Đã xóa thông báo.");
      }
    } catch (e) {
      console.error("Lỗi xóa thông báo:", e);
    }
    setActiveMenuId(null);
  };

  // Xóa toàn bộ lịch sử thông báo
  const handleClearAll = async () => {
    if (
      window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?")
    ) {
      try {
        const res = await api.delete("/admin/notifications?all=true");
        if (res.data.success) {
          setNotifications([]);
          window.dispatchEvent(new CustomEvent("notifications-updated"));
          toast.success("Đã xóa sạch lịch sử thông báo.");
        }
      } catch (e) {
        console.error("Lỗi xóa tất cả thông báo:", e);
      }
    }
  };

  // 5. Định dạng thời gian

  // Thời gian tương đối (Facebook style)
  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return "Vừa xong";
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHour < 24) return `${diffHour} giờ trước`;
      if (diffDay === 1) return "Hôm qua";
      if (diffDay < 7) return `${diffDay} ngày trước`;

      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "Vừa xong";
    }
  };

  const formatAbsoluteTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  // 6. Bộ lọc và tìm kiếm logic
  const countByCategory = (cat: CategoryTab) => {
    if (cat === "all") return notifications.length;
    return notifications.filter((item) => item.category === cat).length;
  };

  const filteredNotifications = notifications.filter((item) => {
    // Lọc theo Category Tab
    const categoryMatch = activeTab === "all" || item.category === activeTab;

    // Lọc theo Status (Đã đọc / Chưa đọc)
    const statusMatch =
      statusFilter === "all" ||
      (statusFilter === "unread" && !item.isRead) ||
      (statusFilter === "read" && item.isRead);

    // Lọc theo Từ khóa tìm kiếm
    const searchLower = searchTerm.toLowerCase();
    const searchMatch =
      !searchTerm ||
      item.title.toLowerCase().includes(searchLower) ||
      item.message.toLowerCase().includes(searchLower) ||
      item.data?.tenTaiKhoan?.toLowerCase().includes(searchLower) ||
      item.data?.tenTruyen?.toLowerCase().includes(searchLower) ||
      item.data?.reportReason?.toLowerCase().includes(searchLower) ||
      item.data?.systemEvent?.toLowerCase().includes(searchLower);

    return categoryMatch && statusMatch && searchMatch;
  });

  const paginatedNotifications = filteredNotifications;

  // 7. Styling phụ thuộc vào Phân loại (Category) & Độ ưu tiên (Priority)

  // Icons & Colors theo Category
  const getCategoryStyles = (category: NotificationCategory) => {
    switch (category) {
      case "report":
        return {
          icon: <AlertTriangle size={18} />,
          color: "bg-red-50 text-red-600 border-red-100/50",
          hoverColor: "hover:border-red-200",
        };
      case "transaction":
        return {
          icon: <DollarSign size={18} />,
          color: "bg-emerald-50 text-emerald-600 border-emerald-100/50",
          hoverColor: "hover:border-emerald-200",
        };
      case "system":
        return {
          icon: <ShieldAlert size={18} />,
          color: "bg-purple-50 text-purple-600 border-purple-100/50",
          hoverColor: "hover:border-purple-200",
        };
      case "follow":
      default:
        return {
          icon: <Bookmark size={18} />,
          color: "bg-blue-50 text-blue-600 border-blue-100/50",
          hoverColor: "hover:border-blue-200",
        };
    }
  };

  // Màu viền trái theo mức độ ưu tiên
  const getPriorityBorderClass = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "border-l-4 border-l-red-500";
      case "warning":
        return "border-l-4 border-l-amber-500";
      case "success":
        return "border-l-4 border-l-emerald-500";
      case "normal":
      default:
        return "border-l-4 border-l-blue-500";
    }
  };

  const handleLoadMore = () => {
    void fetchNotifications(page + 1, true);
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-gray-400">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 font-sans relative">
      {/* Inject Animation style */}
      <style>{`
                @keyframes slideDownFade {
                    from {
                        opacity: 0;
                        transform: translateY(-12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-new-item {
                    animation: slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 cursor-pointer"
            title="Quay lại Bảng điều khiển"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Bell size={24} className="text-blue-600 animate-pulse" />
              Trung tâm Thông báo <span className="text-sm tabular-nums" aria-live="polite">({unreadCount} chưa đọc)</span>
            </h1>
            <p className="text-xs text-gray-500">
              Quản lý, tìm kiếm và phân loại thông báo từ độc giả thời gian
              thực.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors duration-200 cursor-pointer border border-blue-100/50"
            >
              <CheckCheck size={14} />
              Đánh dấu tất cả đã đọc
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors duration-200 cursor-pointer border border-red-100/50"
            >
              <Trash2 size={14} />
              Xóa tất cả
            </button>
          )}
        </div>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC TRẠNG THÁI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Ô tìm kiếm */}
        <div className="md:col-span-2 relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="🔍 Tìm theo tên độc giả, tên truyện, từ khóa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* 2. Bộ lọc trạng thái */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full bg-white border border-gray-200 text-gray-600 py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold transition-all cursor-pointer"
          >
            <option value="all">👁️ Tất cả trạng thái</option>
            <option value="unread">🔵 Thông báo chưa đọc</option>
            <option value="read">⚪ Thông báo đã đọc</option>
          </select>
        </div>
      </div>

      {/* THANH TABS CHỌN CATEGORY */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
        {[
          { key: "all", label: "Tất cả" },
          { key: "follow", label: "Theo dõi" },
          { key: "report", label: "Báo cáo" },
          { key: "transaction", label: "Giao dịch" },
          { key: "system", label: "Hệ thống" },
        ].map((tab) => {
          const count = countByCategory(tab.key as CategoryTab);
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as CategoryTab);

              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-100"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loadError && <p role="alert" className="text-sm text-red-600">Không thể tải thông báo. <button type="button" onClick={() => void fetchNotifications()} className="underline">Thử lại</button></p>}
      {/* DANH SÁCH THÔNG BÁO */}
      {loading && notifications.length === 0 ? <p role="status">Đang tải thông báo…</p> : paginatedNotifications.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
            <Inbox size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-700 text-base">Hộp thư trống</h3>
            <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
              Không tìm thấy thông báo nào khớp với cấu hình bộ lọc hiện tại của
              bạn.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedNotifications.map((notif) => {
            const styles = getCategoryStyles(notif.category);
            const priorityBorder = getPriorityBorderClass(notif.priority);
            const isMenuOpen = activeMenuId === notif.id;

            return (
              <div
                key={notif.id}
                onClick={() =>
                  !notif.isRead && handleMarkAsRead(notif.id, true)
                }
                className={`bg-white border border-gray-100 ${styles.hoverColor} ${priorityBorder} rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex gap-4 relative group cursor-pointer overflow-visible animate-new-item ${
                  !notif.isRead ? "bg-blue-50/20 border-blue-50" : ""
                }`}
              >
                {/* Chấm xanh báo Chưa đọc */}
                {!notif.isRead && (
                  <div
                    className="absolute top-5 right-12 w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                    title="Chưa đọc"
                  />
                )}

                {/* Icon hiển thị theo Category */}
                <div
                  className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${styles.color}`}
                >
                  {styles.icon}
                </div>

                {/* Nội dung chính */}
                <div className="flex-1 space-y-2 pr-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                    <h4
                      className={`font-bold text-gray-800 text-sm ${!notif.isRead ? "text-blue-900" : ""}`}
                    >
                      {notif.title}
                    </h4>
                    <span
                      className="text-[10px] text-gray-400 flex items-center gap-1 font-medium cursor-help"
                      title={formatAbsoluteTime(notif.timestamp)}
                    >
                      <Calendar size={11} />
                      {formatRelativeTime(notif.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed font-medium">
                    {notif.message}
                  </p>

                  {/* Các tag chi tiết phụ thuộc vào loại dữ liệu */}
                  {notif.data && (
                    <div className="flex flex-wrap gap-2.5 pt-1 text-[11px] text-gray-500 font-bold">
                      {notif.data.tenTaiKhoan && (
                        <span className="flex items-center gap-1 bg-slate-50 border border-slate-100/50 px-2 py-0.5 rounded-lg">
                          <User size={11} className="text-slate-400" />
                          Độc giả:{" "}
                          <span className="text-gray-700">
                            {notif.data.tenTaiKhoan}
                          </span>
                        </span>
                      )}
                      {notif.data.tenTruyen && (
                        <span className="flex items-center gap-1 bg-slate-50 border border-slate-100/50 px-2 py-0.5 rounded-lg">
                          <BookOpen size={11} className="text-slate-400" />
                          Truyện:{" "}
                          <span className="text-gray-700">
                            {notif.data.tenTruyen}
                          </span>
                        </span>
                      )}

                      {/* Tag trạng thái màu đặc biệt */}
                      {notif.category === "transaction" &&
                        notif.data.amount !== undefined && (
                          <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100/50 text-emerald-700 px-2 py-0.5 rounded-lg">
                            💸 nạp {notif.data.amount.toLocaleString("vi-VN")} đ
                            (Thành công)
                          </span>
                        )}
                      {notif.category === "report" &&
                        notif.data.reportReason && (
                          <span className="flex items-center gap-1 bg-red-50 border border-red-100/50 text-red-700 px-2 py-0.5 rounded-lg">
                            ⚠️ Chờ xử lý: {notif.data.reportReason}
                          </span>
                        )}
                      {notif.category === "system" &&
                        notif.data.systemEvent && (
                          <span className="flex items-center gap-1 bg-purple-50 border border-purple-100/50 text-purple-700 px-2 py-0.5 rounded-lg">
                            ⚙️ Hoàn tất: {notif.data.systemEvent}
                          </span>
                        )}
                    </div>
                  )}
                </div>

                {/* MENU 3 CHẤM NGỮ CẢNH (⋮) */}
                <div
                  className="absolute top-4 right-4"
                  onClick={(e) => e.stopPropagation()} // Tránh kích hoạt sự kiện đọc card
                >
                  <button
                    onClick={() =>
                      setActiveMenuId(isMenuOpen ? null : notif.id)
                    }
                    aria-label={`Tùy chọn thông báo: ${notif.title}`}
                    aria-expanded={isMenuOpen}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-30 py-1 text-xs font-bold text-gray-600 animate-in fade-in-50 zoom-in-95 duration-100"
                    >
                      <button
                        onClick={() =>
                          handleMarkAsRead(notif.id, !notif.isRead)
                        }
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      >
                        {notif.isRead ? (
                          <>
                            <EyeOff size={13} className="text-gray-400" />
                            Đánh dấu chưa đọc
                          </>
                        ) : (
                          <>
                            <Check size={13} className="text-blue-500" />
                            Đánh dấu đã đọc
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(notif.id)}
                        className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        Xóa thông báo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NÚT TẢI THÊM THÔNG BÁO (PAGINATION) */}
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            disabled={loading}
            onClick={handleLoadMore}
            className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 font-bold text-xs rounded-xl shadow-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? "Đang tải…" : "Tải thêm thông báo"}
            <ChevronDown size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
