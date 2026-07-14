"use client";

import { CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";
import { toast } from "sonner";

type ImportError = {
  row: number;
  message: string;
  field?: string;
};

type ImportResultToastProps = {
  type: "success" | "warning" | "error";
  title: string;
  insertedRows?: number;
  errorRows?: number;
  itemName?: string;
  errors?: ImportError[];
  message?: string;
};
export default function ImportResultToast({
  type,
  title,
  insertedRows = 0,
  errorRows = 0,
  itemName = "dữ liệu",
  errors = [],
  message,
}: ImportResultToastProps) {
  const isSuccess = type === "success";
  const isWarning = type === "warning";
  const isError = type === "error";

  const Icon = isSuccess ? CheckCircle : isWarning ? AlertTriangle : XCircle;

  const colorClass = isSuccess
    ? {
        border: "border-green-300",
        bg: "bg-green-50",
        icon: "text-green-600",
        title: "text-green-800",
        text: "text-green-700",
      }
    : isWarning
      ? {
          border: "border-yellow-300",
          bg: "bg-yellow-50",
          icon: "text-yellow-600",
          title: "text-yellow-800",
          text: "text-yellow-700",
        }
      : {
          border: "border-red-300",
          bg: "bg-red-50",
          icon: "text-red-600",
          title: "text-red-800",
          text: "text-red-700",
        };

  return (
    <div
      className={`relative w-[420px] rounded-xl border ${colorClass.border} ${colorClass.bg} p-4 shadow-lg`}
    >
      {/* nút close */}
      <button
        onClick={() => toast.dismiss()}
        className="absolute right-3 top-3 rounded p-1 transition hover:bg-black/10"
      >
        <X size={16} className="text-slate-500" />
      </button>

      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 ${colorClass.icon}`} />

        <div className="flex-1 pr-6">
          <p className={`font-semibold ${colorClass.title}`}>{title}</p>

          {message && (
            <p className={`mt-1 text-sm ${colorClass.text}`}>{message}</p>
          )}

          {!isError && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white p-2">
                <p className="text-slate-500">Đã thêm</p>
                <p className="font-bold text-green-600">{insertedRows}</p>
              </div>

              <div className="rounded-lg bg-white p-2">
                <p className="text-slate-500">Dòng lỗi</p>
                <p className="font-bold text-red-600">{errorRows}</p>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-white p-2 text-sm">
              {errors.map((err, index) => (
                <div key={index} className="border-b py-1 last:border-b-0">
                  <span className="font-semibold text-red-600">
                    Dòng {err.row}:
                  </span>{" "}
                  <span className="text-slate-700">{err.message}</span>
                </div>
              ))}
            </div>
          )}

          {isSuccess && (
            <p className={`mt-2 text-sm ${colorClass.text}`}>
              Đã thêm {insertedRows} {itemName} vào hệ thống.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
