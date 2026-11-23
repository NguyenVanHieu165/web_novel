"use client";

import { useRef, type RefObject } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  defaultReaderSettings,
  getReaderStyleVariables,
  readerFontSizeMax,
  readerFontSizeMin,
  readerLineHeights,
  readerThemeTokens,
  type ReaderSettings,
} from "@/lib/reader-settings";

export interface ReaderSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  settings: ReaderSettings;
  onSettingsChange: (update: Partial<ReaderSettings>) => void;
}

const themeOptions = [
  { value: "light", label: "Sáng" },
  { value: "sepia", label: "Giấy ngà" },
  { value: "mint", label: "Xanh dịu" },
  { value: "dark", label: "Ban đêm" },
] as const;

const widthOptions = [
  { value: "narrow", label: "Hẹp" },
  { value: "standard", label: "Vừa" },
  { value: "wide", label: "Rộng" },
] as const;

const controlStyles = "min-h-11 rounded-xl border border-[var(--reader-border)] px-3 py-2 text-sm font-semibold hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--reader-surface)] disabled:cursor-not-allowed disabled:opacity-40";

export default function ReaderSettingsPanel({ open, onOpenChange, triggerRef, settings, onSettingsChange }: ReaderSettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isDark = settings.theme === "dark";
  const styleVariables = getReaderStyleVariables(settings);
  const activeTextColor = styleVariables["--reader-content-text"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        style={styleVariables}
        data-reader-theme={settings.theme}
        className={`${isDark ? "dark" : ""} !w-full !max-w-md gap-0 overflow-y-auto overscroll-contain border-[var(--reader-border)] !bg-[var(--reader-surface)] !text-[var(--reader-text)] motion-reduce:!animate-none motion-reduce:!transition-none`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (triggerRef?.current) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <SheetHeader className="border-b border-[var(--reader-border)] pr-14">
          <SheetTitle className="!text-[var(--reader-text)]">Cài đặt đọc</SheetTitle>
          <SheetDescription className="!text-[var(--reader-text)] opacity-70">Thay đổi có hiệu lực ngay và được lưu trên trình duyệt này.</SheetDescription>
        </SheetHeader>

        <SheetClose asChild>
          <button ref={closeRef} type="button" aria-label="Đóng cài đặt đọc" className={`absolute right-3 top-3 p-2 ${controlStyles}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </SheetClose>

        <div className="space-y-7 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Màu trang</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={settings.theme === option.value}
                  onClick={() => onSettingsChange({ theme: option.value })}
                  style={{ backgroundColor: readerThemeTokens[option.value].paper, color: readerThemeTokens[option.value].text }}
                  className={`${controlStyles} ${settings.theme === option.value ? "ring-2 ring-[var(--reader-accent)] ring-offset-2 ring-offset-[var(--reader-surface)]" : ""}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Cỡ chữ</legend>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Giảm cỡ chữ" disabled={settings.fontSize <= readerFontSizeMin} onClick={() => onSettingsChange({ fontSize: settings.fontSize - 1 })} className={controlStyles}>
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <output className="min-w-14 text-center text-sm font-bold tabular-nums" aria-live="polite" aria-label="Cỡ chữ hiện tại">{settings.fontSize} px</output>
              <button type="button" aria-label="Tăng cỡ chữ" disabled={settings.fontSize >= readerFontSizeMax} onClick={() => onSettingsChange({ fontSize: settings.fontSize + 1 })} className={controlStyles}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <label className="sr-only" htmlFor="reader-font-size-range">Cỡ chữ từ {readerFontSizeMin} đến {readerFontSizeMax} px</label>
            <input id="reader-font-size-range" type="range" min={readerFontSizeMin} max={readerFontSizeMax} step={1} value={settings.fontSize} onChange={(event) => onSettingsChange({ fontSize: Number(event.target.value) })} className="h-11 w-full cursor-pointer accent-[var(--reader-accent)]" />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Kiểu chữ</legend>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" aria-pressed={settings.fontFamily === "sans"} onClick={() => onSettingsChange({ fontFamily: "sans" })} className={`font-(family-name:--font-reader-sans) ${controlStyles} ${settings.fontFamily === "sans" ? "ring-2 ring-[var(--reader-accent)]" : ""}`}>Không chân</button>
              <button type="button" aria-pressed={settings.fontFamily === "serif"} onClick={() => onSettingsChange({ fontFamily: "serif" })} className={`font-(family-name:--font-reader-serif) ${controlStyles} ${settings.fontFamily === "serif" ? "ring-2 ring-[var(--reader-accent)]" : ""}`}>Có chân</button>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Màu chữ nội dung</legend>
            <div className="flex items-center gap-3">
              <label htmlFor="reader-text-color" className={`flex flex-1 items-center justify-between gap-3 ${controlStyles}`}>
                <span>Tùy chọn</span>
                <input
                  id="reader-text-color"
                  name="reader-text-color"
                  type="color"
                  value={activeTextColor}
                  onChange={(event) => onSettingsChange({ textColor: event.target.value as ReaderSettings["textColor"] })}
                  className="h-8 w-12 cursor-pointer rounded border border-[var(--reader-border)] bg-transparent p-0.5"
                />
              </label>
              <button type="button" aria-pressed={settings.textColor === "auto"} onClick={() => onSettingsChange({ textColor: "auto" })} className={`${controlStyles} ${settings.textColor === "auto" ? "ring-2 ring-[var(--reader-accent)]" : ""}`}>
                Theo giao diện
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Giãn dòng</legend>
            <div className="grid grid-cols-4 gap-2">
              {readerLineHeights.map((height) => (
                <button key={height} type="button" aria-label={`Giãn dòng ${height}`} aria-pressed={settings.lineHeight === height} onClick={() => onSettingsChange({ lineHeight: height })} className={`tabular-nums ${controlStyles} ${settings.lineHeight === height ? "ring-2 ring-[var(--reader-accent)]" : ""}`}>{height}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-bold">Độ rộng khung đọc</legend>
            <div className="grid grid-cols-3 gap-2">
              {widthOptions.map(({ value, label }) => (
                <button key={value} type="button" aria-pressed={settings.width === value} onClick={() => onSettingsChange({ width: value })} className={`${controlStyles} ${settings.width === value ? "ring-2 ring-[var(--reader-accent)]" : ""}`}>{label}</button>
              ))}
            </div>
          </fieldset>

          <section aria-label="Xem trước kiểu đọc" className="rounded-xl border border-[var(--reader-border)] bg-[var(--reader-paper)] p-4 text-[var(--reader-text)]">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide opacity-70">Xem trước</h2>
            <p style={{ color: activeTextColor, fontSize: settings.fontSize, lineHeight: settings.lineHeight, fontFamily: styleVariables["--reader-font-family"] }}>
              Nắng sớm len qua ô cửa, trải những vệt sáng êm dịu lên trang sách. Bạn có thể chọn cách đọc thoải mái nhất cho mình.
            </p>
          </section>

          <button type="button" onClick={() => onSettingsChange(defaultReaderSettings)} className={`flex w-full items-center justify-center gap-2 ${controlStyles}`}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Khôi phục mặc định
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
