"use client";

import { Users, Wifi, WifiOff } from "lucide-react";

interface CollaborationSwitchProps {
  enabled: boolean;
  onToggle: (val: boolean) => void;
  isConnected: boolean;
  onlineUsers: string[];
  disabled: boolean;
}

export default function CollaborationSwitch({
  enabled,
  onToggle,
  isConnected,
  onlineUsers,
  disabled,
}: CollaborationSwitchProps) {
  return (
    <div className="mb-3 rounded-lg border bg-white p-3 shadow-sm transition-all duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tiêu đề & Trạng thái */}
        <div className="flex items-center gap-2">
          <div className={`rounded-md p-2 ${enabled ? (isConnected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600") : "bg-gray-100 text-gray-500"}`}>
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              Soạn thảo cộng tác (Real-time Collaboration)
            </h4>
            <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
              {enabled ? (
                isConnected ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-600 font-medium">Đang kết nối thời gian thực</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span className="text-amber-600 font-medium">Đang thiết lập kết nối...</span>
                  </>
                )
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                  <span>Chế độ ngoại tuyến (lưu thủ công)</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Switch toggler */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          {disabled ? (
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border">
              Chỉ khả dụng khi sửa chương đã có
            </span>
          ) : (
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              <span className="ml-2 text-xs font-medium text-gray-700">
                {enabled ? "Bật" : "Tắt"}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Danh sách tác giả đang sửa (chỉ hiện khi bật và có người dùng) */}
      {enabled && isConnected && onlineUsers.length > 0 && (
        <div className="mt-3 border-t pt-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Tác giả đang sửa chương:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {onlineUsers.map((user, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-100 shadow-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
                  {user}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
