"use client";

import { useEffect, useState } from "react";
import { 
    BookOpen, 
    Users, 
    Bell, 
    CheckCircle2, 
    BookmarkPlus, 
    Loader2, 
    AlertTriangle, 
    DollarSign, 
    ShieldAlert, 
    Send 
} from "lucide-react";
import { toast, Toaster } from "sonner";

type DemoCategory = "follow" | "report" | "transaction" | "system";

export default function FollowDemoPage() {
    // Dữ liệu lấy từ API
    const [stories, setStories] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState<boolean>(true);
    
    // Tab phân loại muốn demo
    const [activeDemo, setActiveDemo] = useState<DemoCategory>("follow");
    const [submitting, setSubmitting] = useState<boolean>(false);

    // Form dữ liệu loại: Follow
    const [selectedStory, setSelectedStory] = useState<string>("");
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [followedState, setFollowedState] = useState<boolean>(false);

    // Form dữ liệu loại: Report
    const [reportUser, setReportUser] = useState<string>("Độc giả ẩn danh");
    const [reportStory, setReportStory] = useState<string>("");
    const [reportReason, setReportReason] = useState<string>("Nội dung chương bị trùng lặp, lặp lại nhiều dòng");

    // Form dữ liệu loại: Transaction
    const [transactionUser, setTransactionUser] = useState<string>("Độc giả VIP");
    const [transactionAmount, setTransactionAmount] = useState<string>("50000");

    // Form dữ liệu loại: System
    const [systemEvent, setSystemEvent] = useState<string>("Cảnh báo quá tải RAM (92%)");

    // Độ ưu tiên giả lập (Khẩn cấp, Cảnh báo, Thành công, Bình thường)
    const [priority, setPriority] = useState<string>("normal");

    // Tự động gán độ ưu tiên phù hợp khi chuyển Tab demo
    useEffect(() => {
        if (activeDemo === "follow") setPriority("normal");
        else if (activeDemo === "report") setPriority("warning");
        else if (activeDemo === "transaction") setPriority("success");
        else if (activeDemo === "system") setPriority("warning");
    }, [activeDemo]);

    useEffect(() => {
        const fetchDemoData = async () => {
            try {
                setLoadingData(true);
                const response = await fetch("/api/demo/follow-notifications");
                const resData = await response.json();
                if (resData.success) {
                    setStories(resData.stories || []);
                    setUsers(resData.users || []);
                    if (resData.stories.length > 0) {
                        setSelectedStory(resData.stories[0].idTruyen.toString());
                        setReportStory(resData.stories[0].tenTruyen);
                    }
                    if (resData.users.length > 0) {
                        setSelectedUser(resData.users[0].idTaiKhoan.toString());
                    }
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

    // Cập nhật tên truyện mặc định khi đổi trong dropdown report
    const handleReportStoryChange = (storyIdStr: string) => {
        const selected = stories.find(s => s.idTruyen.toString() === storyIdStr);
        if (selected) {
            setReportStory(selected.tenTruyen);
        }
    };

    const handleSendNotification = async () => {
        setSubmitting(true);
        try {
            let bodyPayload: any = { category: activeDemo, priority: priority };

            if (activeDemo === "follow") {
                if (!selectedStory || !selectedUser) {
                    toast.warning("Vui lòng chọn đầy đủ Truyện và Người dùng");
                    setSubmitting(false);
                    return;
                }
                bodyPayload.idTruyen = Number(selectedStory);
                bodyPayload.idTaiKhoan = Number(selectedUser);
            } else if (activeDemo === "report") {
                if (!reportUser.trim() || !reportStory.trim()) {
                    toast.warning("Vui lòng điền tên người gửi và tên truyện");
                    setSubmitting(false);
                    return;
                }
                bodyPayload.username = reportUser;
                bodyPayload.storyName = reportStory;
                bodyPayload.reportReason = reportReason;
            } else if (activeDemo === "transaction") {
                if (!transactionUser.trim() || !transactionAmount) {
                    toast.warning("Vui lòng điền tên tài khoản và số tiền");
                    setSubmitting(false);
                    return;
                }
                bodyPayload.username = transactionUser;
                bodyPayload.amount = Number(transactionAmount);
            } else if (activeDemo === "system") {
                if (!systemEvent.trim()) {
                    toast.warning("Vui lòng điền tên sự kiện hệ thống");
                    setSubmitting(false);
                    return;
                }
                bodyPayload.systemEvent = systemEvent;
            }

            const response = await fetch("/api/demo/follow-notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            });

            const resData = await response.json();
            if (resData.success) {
                if (activeDemo === "follow") {
                    if (resData.action === "follow") {
                        setFollowedState(true);
                        toast.success("Đã gửi thông báo theo dõi thành công!");
                    } else {
                        setFollowedState(false);
                        toast.info("Đã hủy theo dõi truyện.");
                    }
                } else {
                    toast.success(resData.message || "Gửi thông báo giả lập thành công!");
                }
            } else {
                toast.error(resData.message || "Gửi giả lập thất bại");
            }
        } catch (error) {
            console.error("Simulation error:", error);
            toast.error("Lỗi mạng khi kết nối tới API");
        } finally {
            setSubmitting(false);
        }
    };

    // Lấy tông màu chủ đạo cho tab đang chọn
    const getDemoThemeClasses = () => {
        switch (activeDemo) {
            case "report":
                return {
                    primary: "bg-red-600 hover:bg-red-700",
                    accent: "border-red-500 text-red-600 bg-red-50",
                    bg: "from-red-50/50 via-slate-50 to-slate-100"
                };
            case "transaction":
                return {
                    primary: "bg-emerald-600 hover:bg-emerald-700",
                    accent: "border-emerald-500 text-emerald-600 bg-emerald-50",
                    bg: "from-emerald-50/50 via-slate-50 to-slate-100"
                };
            case "system":
                return {
                    primary: "bg-purple-600 hover:bg-purple-700",
                    accent: "border-purple-500 text-purple-600 bg-purple-50",
                    bg: "from-purple-50/50 via-slate-50 to-slate-100"
                };
            case "follow":
            default:
                return {
                    primary: "bg-blue-600 hover:bg-blue-700",
                    accent: "border-blue-500 text-blue-600 bg-blue-50",
                    bg: "from-blue-50/50 via-slate-50 to-slate-100"
                };
        }
    };

    const theme = getDemoThemeClasses();

    return (
        <div className={`min-h-screen bg-gradient-to-br ${theme.bg} flex items-center justify-center p-6 font-sans transition-all duration-500`}>
            <Toaster position="top-right" richColors />
            
            <div className="w-full max-w-xl bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/50 p-8 flex flex-col space-y-6">
                
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-blue-50 text-blue-600 rounded-2xl mb-2">
                        <Bell size={28} className="animate-bounce" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Giả Lập Hệ Thống Thông Báo</h1>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        Chọn phân loại và nhập thông tin để bắn thông báo WebSocket thời gian thực sang trang quản trị Admin.
                    </p>
                </div>

                {/* THANH TABS CHỌN KIỂU GIẢ LẬP */}
                <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-2xl text-xs font-bold">
                    {[
                        { key: "follow", label: "Theo dõi", icon: <BookmarkPlus size={14} /> },
                        { key: "report", label: "Báo cáo", icon: <AlertTriangle size={14} /> },
                        { key: "transaction", label: "Giao dịch", icon: <DollarSign size={14} /> },
                        { key: "system", label: "Hệ thống", icon: <ShieldAlert size={14} /> },
                    ].map((btn) => (
                        <button
                            key={btn.key}
                            onClick={() => {
                                setActiveDemo(btn.key as DemoCategory);
                                setFollowedState(false);
                            }}
                            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-1 rounded-xl transition-all cursor-pointer ${
                                activeDemo === btn.key
                                    ? "bg-white text-gray-800 shadow"
                                    : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {btn.icon}
                            <span>{btn.label}</span>
                        </button>
                    ))}
                </div>

                {loadingData ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                        <Loader2 className="animate-spin text-blue-600" size={32} />
                        <span className="text-xs text-gray-400 font-bold">Đang tải dữ liệu mẫu...</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* FORM THEO DÕI TRUYỆN */}
                        {activeDemo === "follow" && (
                            <div className="space-y-4 animate-in fade-in-50 duration-200">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Users size={13} className="text-blue-500" />
                                        Chọn Độc Giả Gửi Lượt Theo Dõi
                                    </label>
                                    <select
                                        value={selectedUser}
                                        onChange={(e) => {
                                            setSelectedUser(e.target.value);
                                            setFollowedState(false);
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-semibold"
                                    >
                                        {users.map((u) => (
                                            <option key={u.idTaiKhoan} value={u.idTaiKhoan}>
                                                {u.tenTaiKhoan} (ID: #{u.idTaiKhoan})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <BookOpen size={13} className="text-blue-500" />
                                        Chọn Truyện Muốn Theo Dõi
                                    </label>
                                    <select
                                        value={selectedStory}
                                        onChange={(e) => {
                                            setSelectedStory(e.target.value);
                                            setFollowedState(false);
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-semibold"
                                    >
                                        {stories.map((s) => (
                                            <option key={s.idTruyen} value={s.idTruyen}>
                                                {s.tenTruyen} (ID: #{s.idTruyen})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* FORM BÁO CÁO VI PHẠM */}
                        {activeDemo === "report" && (
                            <div className="space-y-4 animate-in fade-in-50 duration-200">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tên người báo cáo</label>
                                        <input
                                            type="text"
                                            value={reportUser}
                                            onChange={(e) => setReportUser(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-semibold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Chọn truyện bị báo cáo</label>
                                        <select
                                            onChange={(e) => handleReportStoryChange(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-semibold"
                                        >
                                            {stories.map((s) => (
                                                <option key={s.idTruyen} value={s.idTruyen}>
                                                    {s.tenTruyen}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Lý do báo cáo vi phạm</label>
                                    <input
                                        type="text"
                                        value={reportReason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-semibold"
                                    />
                                </div>
                            </div>
                        )}

                        {/* FORM GIAO DỊCH NẠP TIỀN */}
                        {activeDemo === "transaction" && (
                            <div className="space-y-4 animate-in fade-in-50 duration-200">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tên người nạp</label>
                                        <input
                                            type="text"
                                            value={transactionUser}
                                            onChange={(e) => setTransactionUser(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Số tiền nạp (VND)</label>
                                        <select
                                            value={transactionAmount}
                                            onChange={(e) => setTransactionAmount(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold"
                                        >
                                            <option value="20000">20.000 đ</option>
                                            <option value="50000">50.000 đ</option>
                                            <option value="100000">100.000 đ</option>
                                            <option value="500000">500.000 đ</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* FORM CẢNH BÁO HỆ THỐNG */}
                        {activeDemo === "system" && (
                            <div className="space-y-4 animate-in fade-in-50 duration-200">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sự kiện hệ thống</label>
                                    <select
                                        value={systemEvent}
                                        onChange={(e) => setSystemEvent(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-semibold"
                                    >
                                        <option value="Cảnh báo quá tải RAM (92%)">⚠️ Cảnh báo quá tải RAM (92%)</option>
                                        <option value="Tiến hành bảo trì Server lúc 02:00 sáng mai">⚙️ Tiến hành bảo trì Server lúc 02:00 sáng mai</option>
                                        <option value="Backup Database tự động hoàn tất">💾 Backup Database tự động hoàn tất</option>
                                        <option value="Ghi nhận lỗi Endpoint /api/admin/chapters [500]">🛑 Lỗi Endpoint /api/admin/chapters [500]</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* CHỌN ĐỘ ƯU TIÊN (Priority) - Không hiện ở Tab Theo Dõi vì follow luôn là normal */}
                        {activeDemo !== "follow" && (
                            <div className="space-y-1.5 animate-in fade-in-50 duration-200">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                    Độ ưu tiên thông báo
                                </label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 text-gray-700 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-semibold"
                                >
                                    <option value="normal">⚪ Thông thường (Normal)</option>
                                    <option value="success">🟢 Thành công (Success - Nên dùng cho Giao dịch)</option>
                                    <option value="warning">🟡 Cảnh báo (Warning)</option>
                                    <option value="urgent">🔴 Khẩn cấp (Urgent - Nên dùng cho Báo lỗi/Quá tải)</option>
                                </select>
                            </div>
                        )}

                        {/* Nút bấm Kích hoạt thông báo */}
                        <div className="pt-4">
                            <button
                                onClick={handleSendNotification}
                                disabled={submitting || (activeDemo === "follow" && (stories.length === 0 || users.length === 0))}
                                className={`w-full py-4 px-6 rounded-2xl font-bold text-white shadow-lg transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 hover:shadow-xl cursor-pointer ${theme.primary} ${
                                    submitting ? "opacity-50 cursor-not-allowed shadow-none" : ""
                                }`}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        <span>Đang gửi giả lập...</span>
                                    </>
                                ) : activeDemo === "follow" && followedState ? (
                                    <>
                                        <CheckCircle2 size={20} />
                                        <span>Đang Theo Dõi (Click để Hủy)</span>
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        <span>Phát Thông Báo Giả Lập</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer Notes */}
                <div className="text-center text-[11px] text-gray-400 pt-4 border-t border-slate-100 flex flex-col gap-1">
                    <span>💡 Hãy mở đồng thời trang <b>Admin Notifications</b> để kiểm tra bộ lọc và phân loại.</span>
                </div>
            </div>
        </div>
    );
}
