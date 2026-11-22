"use client";

import { useRef, useState, type MouseEvent } from "react";
import { ShieldCheck, X } from "lucide-react";
import ReaderAvatar from "@/components/account/ReaderAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RoleAssignmentForm from "@/components/users/RoleAssignmentForm";
import { roleLabel, type RoleOption } from "@/schemas/admin-roles.schema";
import { BulkRoleForm } from "./BulkRoleForm";

type Account = {
  id: number;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
  status: "active" | "locked" | "banned" | null;
  roleIds: number[];
};

const number = new Intl.NumberFormat("vi-VN");
const checkStyle = "size-4 rounded accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const neutral = "bg-muted text-muted-foreground";
const roleTones: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  author: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  user: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
};
const statuses = {
  active: { label: "Hoạt động", tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", dot: "bg-emerald-600" },
  locked: { label: "Bị khóa", tone: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200", dot: "bg-rose-600" },
  banned: { label: "Bị cấm", tone: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200", dot: "bg-rose-600" },
  unset: { label: "Chưa đặt trạng thái", tone: neutral, dot: "bg-muted-foreground" },
};

type Editor = { kind: "account"; account: Account } | { kind: "bulk"; accountIds: number[] };

function AccountIdentity({ account }: { account: Account }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ReaderAvatar url={account.avatar} name={account.name} size={36} />
      <div className="min-w-0">
        <p className="wrap-break-word font-semibold text-foreground">{account.name}</p>
        <p className="wrap-break-word text-xs text-muted-foreground">{account.email}</p>
      </div>
    </div>
  );
}

export function PermissionsTable({ actorId, accounts, roles }: { actorId: number; accounts: Account[]; roles: RoleOption[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const tableRegion = useRef<HTMLDivElement>(null);
  const canSelect = accounts.filter(({ id }) => id !== actorId).map(({ id }) => id);
  const selectedIds = selected.filter((id) => canSelect.includes(id));
  const allSelected = canSelect.length > 0 && canSelect.length === selectedIds.length;
  const rolesById = new Map(roles.map((role) => [role.idVaiTro, role] as const));

  function openEditor(event: MouseEvent<HTMLButtonElement>, value: Editor) {
    trigger.current = event.currentTarget;
    setEditor(value);
  }

  function closeEditor() {
    if (!saving) setEditor(null);
  }

  return (
    <>
      {selectedIds.length > 0 ? (
        <div className="mx-3 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 sm:mx-4">
          <span role="status" className="text-sm font-medium">Đã chọn {number.format(selectedIds.length)} tài khoản</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="min-h-9" onClick={() => {
              setSelected([]);
              tableRegion.current?.focus();
            }}>Bỏ chọn</Button>
            <Button size="sm" className="min-h-9" onClick={(event) => openEditor(event, { kind: "bulk", accountIds: selectedIds })}>
              <ShieldCheck aria-hidden="true" /> Phân quyền hàng loạt
            </Button>
          </div>
        </div>
      ) : null}
      <div ref={tableRegion} role="region" aria-label="Bảng tài khoản, có thể cuộn ngang" tabIndex={0}
        className="overflow-x-auto border-t border-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <Table className="min-w-160 table-fixed">
          <caption className="sr-only">Tài khoản và vai trò</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input type="checkbox" aria-label="Chọn tất cả tài khoản trên trang" checked={allSelected}
                  disabled={!canSelect.length} className={checkStyle}
                  ref={(node) => { if (node) node.indeterminate = selectedIds.length > 0 && !allSelected; }}
                  onChange={(event) => setSelected(event.target.checked ? canSelect : [])} />
              </TableHead>
              <TableHead className="w-[32%]">Người dùng</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead className="w-36">Trạng thái</TableHead>
              <TableHead className="w-32 text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length ? accounts.map((account) => {
              const isSelf = actorId === account.id;
              const checked = selectedIds.includes(account.id);
              const status = statuses[account.status ?? "unset"];
              const accountRoles = account.roleIds.flatMap((id) => rolesById.get(id) ?? []);
              return (
                <TableRow key={account.id} data-selected={checked}>
                  <TableCell>
                    <input type="checkbox" aria-label={`Chọn ${account.name} (${account.email})`}
                      disabled={isSelf} checked={checked} className={checkStyle}
                      onChange={(event) => {
                        const value = event.target.checked;
                        setSelected((current) => value ? [...current, account.id] : current.filter((id) => id !== account.id));
                      }} />
                  </TableCell>
                  <TableCell><AccountIdentity account={account} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {accountRoles.length ? accountRoles.map((role) => (
                        <span key={role.idVaiTro} className={`rounded-full px-2.5 py-1 text-xs font-medium wrap-anywhere ${roleTones[role.tenVaiTro] ?? neutral}`}>
                          {roleLabel(role.tenVaiTro)}
                        </span>
                      )) : <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${neutral}`}>Chưa có vai trò</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.tone}`}>
                      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${status.dot}`} />{status.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {isSelf ? <span className="text-xs text-muted-foreground">Tài khoản của bạn</span> : (
                      <Button
                        size="sm" variant="outline" className="min-h-9 touch-manipulation"
                        aria-label={`Phân quyền cho ${account.username}`}
                        onClick={(event) => openEditor(event, { kind: "account", account })}
                      >Phân quyền</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            }) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">Không tìm thấy tài khoản phù hợp.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Sheet open={editor !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        {editor ? (
          <SheetContent
            side="right" showCloseButton={false}
            className="gap-0 overscroll-contain data-[side=right]:w-full data-[side=right]:sm:max-w-md motion-reduce:animate-none motion-reduce:transition-none"
            style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const button = trigger.current;
              if (button?.isConnected) button.focus();
              else tableRegion.current?.focus();
            }}
            onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <SheetHeader className="gap-2 border-b border-border px-5 pt-5 pb-4 pr-14">
              <SheetTitle className="font-sans text-xl font-semibold">{editor.kind === "account" ? "Phân quyền tài khoản" : "Phân quyền hàng loạt"}</SheetTitle>
              <SheetDescription>{editor.kind === "account" ? "Chọn các vai trò cần cấp cho tài khoản này." : `Áp dụng cho ${number.format(editor.accountIds.length)} tài khoản đã chọn.`}</SheetDescription>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" aria-label="Đóng phân quyền" disabled={saving} className="absolute top-3 right-3">
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </SheetHeader>
            {editor.kind === "account" ? (
              <>
                <div className="border-b border-border px-5 py-4"><AccountIdentity account={editor.account} /></div>
                <RoleAssignmentForm
                  key={editor.account.id} accountId={editor.account.id} roleIds={editor.account.roleIds} roles={roles}
                  onSaving={setSaving} onSaved={() => setEditor(null)}
                />
              </>
            ) : (
              <BulkRoleForm
                accountIds={editor.accountIds} roles={roles} onSaving={setSaving}
                onSaved={() => { setEditor(null); setSelected([]); }}
              />
            )}
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}
