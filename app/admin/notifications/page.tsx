"use client";

import { useEffect, useState } from "react";
import { Bell, Trash2, ArrowLeft, Calendar, User, BookOpen, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItem {
    id: string;
    title: string;
    message: string;
    timestamp: string;
    data?: {
        idTruyen?: number;
        tenTruyen?: string;
        tenTaiKhoan?: string;
        idTaiKhoan?: number;
    };
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    // 1. Chỉ đọc dữ liệu từ localStorage khi component đã mount trên Client (Tránh lỗi Hydration Next.js)
    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("novel_admin_notifications");
        if (stored) {
            try {
                setNotifications(JSON.parse(stored));
            } catch (e) {
                console.error("Lỗi đọc dữ liệu thông báo từ localStorage", e);
            }
        }
    }, []);

    // 2. Lắng nghe sự kiện thông báo thời gian thực từ Sidebar
    useEffect(() => {
        const handleNewFollow = (event: any) => {
            const socketNotification = event.detail;
            
            const newNotification: NotificationItem = {
                id: Math.random().toString(36).substring(2, 9),
                title: socketNotification.title || "Thông báo mới",
                message: socketNotification.message,
                timestamp: new Date().toISOString(),
                data: socketNotification.data
            };

            setNotifications((prev) => {
                const updated = [newNotification, ...prev];
                localStorage.setItem("novel_admin_notifications", JSON.stringify(updated));
                return updated;
            });
        };

        window.addEventListener("new-follow-event", handleNewFollow);
        return () => {
            window.removeEventListener("new-follow-event", handleNewFollow);
        };
    }, []);

    // 3. Xóa tất cả thông báo
    const handleClearAll = () => {
        if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?")) {
            setNotifications([]);
            localStorage.removeItem("novel_admin_notifications");
        }
    };

    // Định dạng hiển thị thời gian
    const formatTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                day: "2-digit",
                month: "2-digit"
            });
        } catch {
            return "Vừa xong";
        }
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-pulse text-gray-400">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => router.push("/admin/dashboard")}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 cursor-pointer"
                        title="Quay lại Bảng điều khiển"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Bell size={24} className="text-blue-600" />
                            Trung tâm Thông báo
                        </h1>
                        <p className="text-sm text-gray-500">
                            Danh sách các sự kiện tương tác thời gian thực từ độc giả.
                        </p>
                    </div>
                </div>

                {notifications.length > 0 && (
                    <button
                        onClick={handleClearAll}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors duration-200 cursor-pointer"
                    >
                        <Trash2 size={14} />
                        Xóa tất cả
                    </button>
                )}
            </div>

            {/* List Notifications */}
            {notifications.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                        <Inbox size={32} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-bold text-gray-700 text-lg">Chưa có thông báo nào</h3>
                        <p className="text-sm text-gray-400 max-w-xs mx-auto">
                            Khi có độc giả theo dõi truyện, các thông báo thời gian thực sẽ hiển thị tại trang này.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/demo/follow")}
                        className="px-5 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-sm rounded-xl transition-all duration-200 cursor-pointer"
                    >
                        Đến trang Demo để tạo thử thông báo
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {notifications.map((notif) => (
                        <div 
                            key={notif.id}
                            className="bg-white border border-gray-100 hover:border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow transition-all duration-200 flex gap-4 relative group"
                        >
                            {/* Icon Indicator */}
                            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Bell size={20} className="animate-wiggle" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                    <h4 className="font-bold text-gray-800 text-base">{notif.title}</h4>
                                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                        <Calendar size={12} />
                                        {formatTime(notif.timestamp)}
                                    </span>
                                </div>
                                
                                <p className="text-sm text-gray-600 leading-relaxed">{notif.message}</p>

                                {/* Meta details if available */}
                                {notif.data && (
                                    <div className="flex flex-wrap gap-4 pt-1 text-xs text-gray-400">
                                        {notif.data.tenTaiKhoan && (
                                            <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                <User size={12} className="text-slate-400" />
                                                Độc giả: <b>{notif.data.tenTaiKhoan}</b> (ID: #{notif.data.idTaiKhoan})
                                            </span>
                                        )}
                                        {notif.data.tenTruyen && (
                                            <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                <BookOpen size={12} className="text-slate-400" />
                                                Truyện: <b>{notif.data.tenTruyen}</b> (ID: #{notif.data.idTruyen})
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
