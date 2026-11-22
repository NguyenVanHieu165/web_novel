import type { PermissionTab } from "@/schemas/admin-roles.schema";

export type PermissionFilters = { term: string; tab: PermissionTab; roleId?: number };

export function permissionsHref({ term, tab, roleId }: PermissionFilters, page = 1) {
  const query = new URLSearchParams();
  if (term.trim()) query.set("q", term.trim());
  if (roleId) query.set("role", String(roleId));
  else if (tab !== "all") query.set("tab", tab);
  if (page > 1) query.set("page", String(page));
  return query.size ? `/admin/permissions?${query}` : "/admin/permissions";
}
