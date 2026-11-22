export default function ChapterCountBadges({ count, vipCount }: { count?: number; vipCount?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${count === 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
        {count === undefined ? "Chưa cập nhật" : `${count.toLocaleString("vi-VN")} chương`}
      </span>
      {(vipCount ?? 0) > 0 && <span className="rounded-full bg-fuchsia-100 px-2 py-1 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{vipCount?.toLocaleString("vi-VN")} VIP</span>}
    </span>
  );
}
