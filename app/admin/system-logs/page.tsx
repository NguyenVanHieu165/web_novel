import Link from "next/link";
import { CheckCircle2, Database, Search } from "lucide-react";
import { DatabaseDiagnosticButton } from "@/components/admin/DatabaseDiagnosticButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { FilterBar, FilterBarActions, FilterBarGroup } from "@/components/shared/filter-bar";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { requireAdminPage } from "@/lib/server/admin-page";
import { listSystemLogs, systemLogQuerySchema, type SystemLogLevel } from "@/lib/server/system-log";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Ho_Chi_Minh",
});
const levelVariants: Record<SystemLogLevel, "success" | "warning" | "destructive" | "info"> = {
  info: "success",
  warning: "warning",
  error: "destructive",
  critical: "info",
};
const levelLabels: Record<SystemLogLevel, string> = {
  info: "Thông tin", warning: "Cảnh báo", error: "Lỗi", critical: "Nghiêm trọng",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function details(value: string | null) {
  if (!value) return null;
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value; }
}

function pageHref(raw: Record<string, string | string[] | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const selected = first(value);
    if (selected && key !== "page") params.set(key, selected);
  }
  params.set("page", String(page));
  return `/admin/system-logs?${params.toString()}`;
}

export default async function SystemLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const raw = await searchParams;
  const parsed = systemLogQuerySchema.safeParse({
    page: first(raw.page), limit: first(raw.limit), level: first(raw.level) === "all" ? undefined : first(raw.level),
    source: first(raw.source) === "all" ? undefined : first(raw.source), code: first(raw.code), q: first(raw.q),
  });
  const query = parsed.success ? parsed.data : systemLogQuerySchema.parse({});
  let result: Awaited<ReturnType<typeof listSystemLogs>> | null = null;
  let loadFailed = false;
  try { result = await listSystemLogs(query); }
  catch (error) {
    loadFailed = true;
    console.error("[admin-system-logs-read-failed]", error instanceof Error ? error.name : "UnknownError");
  }
  const meta = result?.meta ?? { page: 1, limit: query.limit, total: 0, totalPage: 1 };

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Nhật ký hệ thống</PageHeaderTitle>
          <PageHeaderDescription>
            Theo dõi lỗi import, checkpoint và chẩn đoán database. Nội dung nhạy cảm, stack trace và credential không được lưu vào giao diện này.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><DatabaseDiagnosticButton /></PageHeaderActions>
      </PageHeader>

      <Card aria-labelledby="checkpoint-health"><CardContent>
        <div className="flex items-start gap-3">
          <Database aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 id="checkpoint-health" className="font-semibold">Chẩn đoán checkpoint</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Nút kiểm tra thực hiện SELECT, INSERT, UPDATE, JSON_EXTRACT và DELETE trên một bản ghi tạm trong transaction. Không đọc hoặc sửa checkpoint import hiện có.
            </p>
          </div>
        </div>
      </CardContent></Card>

      <form method="get">
        <FilterBar>
        <FilterBarGroup className="grid sm:grid-cols-2 xl:grid-cols-5">
        <div className="sm:col-span-2">
          <label htmlFor="log-search" className="mb-1 block text-sm font-medium">Tìm kiếm</label>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <Input id="log-search" name="q" type="search" defaultValue={query.q} autoComplete="off"
              placeholder="Mã lỗi, request ID hoặc job ID…"
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <div>
          <label htmlFor="log-level" className="mb-1 block text-sm font-medium">Mức độ</label>
          <Select name="level" defaultValue={query.level ?? "all"}><SelectTrigger id="log-level" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả</SelectItem>{Object.entries(levelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <label htmlFor="log-source" className="mb-1 block text-sm font-medium">Nguồn</label>
          <Select name="source" defaultValue={query.source ?? "all"}><SelectTrigger id="log-source" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả</SelectItem><SelectItem value="story-import">Import URL</SelectItem><SelectItem value="database-diagnostic">Database</SelectItem><SelectItem value="rate-limit">Rate limit</SelectItem><SelectItem value="system">Hệ thống</SelectItem></SelectContent></Select>
        </div>
        <div>
          <label htmlFor="log-code" className="mb-1 block text-sm font-medium">Mã lỗi</label>
          <Input id="log-code" name="code" defaultValue={query.code} autoComplete="off" spellCheck={false} placeholder="CHECKPOINT_FAILED…" />
        </div>
        </FilterBarGroup>
        <FilterBarActions>
          <Button type="submit" className="flex-1">Lọc nhật ký</Button>
          <Button asChild variant="outline"><Link href="/admin/system-logs">Xóa lọc</Link></Button>
        </FilterBarActions>
        </FilterBar>
      </form>

      {loadFailed ? (
        <ErrorState><ErrorStateTitle>Chưa đọc được bảng nhật ký</ErrorStateTitle><ErrorStateDescription>Kiểm tra trạng thái triển khai database ở môi trường an toàn; không chạy migration trực tiếp trên production.</ErrorStateDescription></ErrorState>
      ) : result?.items.length ? (
        <section aria-label="Danh sách nhật ký" className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3">Mức độ</th><th className="px-4 py-3">Nguồn</th><th className="px-4 py-3">Nội dung</th><th className="px-4 py-3">Đối chiếu</th></tr>
              </thead>
              <tbody className="divide-y">
                {result.items.map((item) => {
                  const level = systemLogLevelSchemaValue(item.mucDo);
                  const formattedDetails = details(item.chiTiet);
                  return <tr key={item.idNhatKy} className="align-top [content-visibility:auto]">
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">{dateTime.format(item.createdAt)}</td>
                    <td className="px-4 py-4"><Badge variant={levelVariants[level]}>{levelLabels[level]}</Badge></td>
                    <td className="px-4 py-4"><p className="font-medium">{item.nguon}</p>{item.maLoi && <code translate="no" className="mt-1 block break-all text-xs text-muted-foreground">{item.maLoi}</code>}</td>
                    <td className="max-w-xl px-4 py-4"><p className="break-words font-medium">{item.thongDiep}</p>{formattedDetails && <details className="mt-2"><summary className="cursor-pointer text-xs text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-ring dark:text-blue-300">Chi tiết đã làm sạch</summary><pre className="mt-2 max-h-80 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{formattedDetails}</pre></details>}{item.taiKhoan && <p className="mt-2 text-xs text-muted-foreground">Thực hiện bởi {item.taiKhoan.tenTaiKhoan} (ID {item.taiKhoan.idTaiKhoan})</p>}</td>
                    <td className="px-4 py-4 text-xs"><dl className="space-y-2">{item.requestId && <div><dt className="text-muted-foreground">Request ID</dt><dd><code translate="no" className="break-all">{item.requestId}</code></dd></div>}{item.jobId && <div><dt className="text-muted-foreground">Job ID</dt><dd><code translate="no" className="break-all">{item.jobId}</code></dd></div>}</dl></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState><EmptyStateIcon><CheckCircle2 /></EmptyStateIcon><EmptyStateTitle>Chưa có nhật ký phù hợp</EmptyStateTitle><EmptyStateDescription>Thử thay đổi bộ lọc hoặc chạy kiểm tra quyền checkpoint.</EmptyStateDescription></EmptyState>
      )}

      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm tabular-nums text-muted-foreground">{meta.total.toLocaleString("vi-VN")} bản ghi · Trang {meta.page}/{meta.totalPage}</p>
        <Pagination className="mx-0 w-auto"><PaginationContent>
          <PaginationItem>
          {meta.page <= 1
            ? <Button type="button" variant="outline" size="sm" disabled>Trang trước</Button>
            : <Button asChild variant="outline" size="sm"><Link href={pageHref(raw, meta.page - 1)}>Trang trước</Link></Button>}
          </PaginationItem><PaginationItem>
          {meta.page >= meta.totalPage
            ? <Button type="button" variant="outline" size="sm" disabled>Trang sau</Button>
            : <Button asChild variant="outline" size="sm"><Link href={pageHref(raw, meta.page + 1)}>Trang sau</Link></Button>}
          </PaginationItem>
        </PaginationContent></Pagination>
      </div>
    </div>
  );
}

function systemLogLevelSchemaValue(value: string): SystemLogLevel {
  return value === "warning" || value === "error" || value === "critical" ? value : "info";
}
