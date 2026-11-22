export default function ChapterLoading() {
  return (
    <section
      role="status" aria-label="Đang tải chương truyện"
      className="min-h-[75vh] rounded-2xl px-5 py-8 sm:px-8"
      style={{ backgroundColor: "var(--reader-bg, #fcfbf9)", color: "var(--reader-text, #1e293b)" }}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <p className="text-center text-sm opacity-70">Đang tải chương…</p>
        <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
          <div className="mx-auto mb-10 h-8 w-2/3 rounded-lg bg-current opacity-10" />
          {[100, 96, 90, 100, 72, 100, 96, 86, 100, 70, 100, 94].map((width, index) => (
            <div key={index} className="h-4 rounded bg-current opacity-10" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </section>
  );
}
