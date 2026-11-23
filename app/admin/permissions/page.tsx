import { BookOpen, ShieldCheck, UserRoundPen, Users } from "lucide-react";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page";
import { listAccountRoles, visibleAccounts } from "@/lib/server/account-roles";
import { permissionsQuerySchema } from "@/schemas/admin-roles.schema";
import { PermissionsToolbar } from "@/components/admin/PermissionsToolbar";
import { PermissionsTable } from "@/components/admin/PermissionsTable";
import { PermissionsPagination } from "@/components/admin/PermissionsPagination";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";

const pageSize = 15;
const number = new Intl.NumberFormat("vi-VN");
type Query = Record<string, string | string[] | undefined>;

export default async function PermissionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [actor, params] = await Promise.all([requireAdminPage(), searchParams]);
  const parsed = permissionsQuerySchema.safeParse(params);
  const { q: term = "", tab = "all", page = 1, role: roleId } = parsed.success ? parsed.data : {};
  const roles = await listAccountRoles();
  const roleIdsFor = (name: string) => roles.filter((role) => role.tenVaiTro === name).map((role) => role.idVaiTro);
  const filters = {
    all: {},
    admin: { vaiTroNguoiDung: { some: { idVaiTro: { in: roleIdsFor("admin") } } } },
    author: { vaiTroNguoiDung: { some: { idVaiTro: { in: roleIdsFor("author") } } } },
    basic: { vaiTroNguoiDung: { none: { idVaiTro: { notIn: roleIdsFor("user") } } } },
  } satisfies Record<string, Prisma.TaiKhoanWhereInput>;
  const where: Prisma.TaiKhoanWhereInput = {
    AND: [
      visibleAccounts,
      roleId ? { vaiTroNguoiDung: { some: { idVaiTro: roleId } } } : filters[tab],
      ...(term ? [{ OR: [
        { tenTaiKhoan: { contains: term } },
        { email: { contains: term } },
        { hoSoCaNhan: { is: { ho_ten: { contains: term } } } },
      ] }] : []),
    ],
  };
  const countByRole = (filter: Prisma.TaiKhoanWhereInput) =>
    prisma.taiKhoan.count({ where: { AND: [visibleAccounts, filter] } });
  const allCount = countByRole(filters.all);
  const [members, admins, authors, basic, total] = await Promise.all([
    allCount, countByRole(filters.admin), countByRole(filters.author), countByRole(filters.basic),
    !term && !roleId && tab === "all" ? allCount : prisma.taiKhoan.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const accounts = await prisma.taiKhoan.findMany({
    where,
    select: {
      idTaiKhoan: true,
      tenTaiKhoan: true,
      email: true,
      trangThai: true,
      hoSoCaNhan: { select: { ho_ten: true, anh: true } },
      vaiTroNguoiDung: { select: { idVaiTro: true }, orderBy: { idVaiTro: "asc" } },
    },
    orderBy: { idTaiKhoan: "asc" },
    take: pageSize,
    skip: (currentPage - 1) * pageSize,
  });
  const stats = [
    { title: "Tổng thành viên", value: members, icon: Users, tone: "bg-muted text-muted-foreground" },
    { title: "Quản trị viên", value: admins, icon: ShieldCheck, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
    { title: "Tác giả", value: authors, icon: UserRoundPen, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    { title: "Chỉ có quyền cơ bản", value: basic, icon: BookOpen, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  ];

  return (
    <div className="space-y-5 text-foreground">
      <PageHeader><PageHeaderContent><PageHeaderTitle>Quản lý phân quyền</PageHeaderTitle><PageHeaderDescription>Xem và cập nhật vai trò của từng tài khoản hoặc nhiều tài khoản cùng lúc.</PageHeaderDescription></PageHeaderContent></PageHeader>
      <dl aria-label="Thống kê vai trò" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {stats.map(({ title, value, icon: Icon, tone }) => (
          <Card key={title} className="py-0"><CardContent className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</dt>
              <dd className="text-xl leading-tight font-semibold tabular-nums">{number.format(value)}</dd>
            </div>
          </CardContent></Card>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Một thành viên có thể thuộc nhiều nhóm vai trò. Quyền cơ bản gồm tài khoản chỉ có vai trò Độc giả hoặc chưa được gán vai trò.
      </p>
      <section aria-label="Danh sách tài khoản" className="min-w-0 rounded-xl border border-border bg-card shadow-xs">
        <PermissionsToolbar term={term} tab={tab} roleId={roleId} />
        <PermissionsTable
          key={JSON.stringify([currentPage, term, tab, roleId])}
          actorId={actor.idTaiKhoan}
          roles={roles}
          accounts={accounts.map((account) => ({
            id: account.idTaiKhoan,
            name: account.hoSoCaNhan?.ho_ten.trim() || account.tenTaiKhoan,
            username: account.tenTaiKhoan,
            email: account.email,
            avatar: account.hoSoCaNhan?.anh ?? null,
            status: account.trangThai,
            roleIds: account.vaiTroNguoiDung.map(({ idVaiTro }) => idVaiTro),
          }))}
        />
        <PermissionsPagination
          page={currentPage}
          pageCount={pageCount}
          filters={{ term, tab, roleId }}
          first={total ? (currentPage - 1) * pageSize + 1 : 0}
          last={(currentPage - 1) * pageSize + accounts.length}
          total={total}
        />
      </section>
    </div>
  );
}
