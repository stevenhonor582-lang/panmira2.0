"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users as UsersIcon, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { UserEditDialog } from "../_components/user-edit-dialog";
import { UserDeleteDialog } from "../_components/user-delete-dialog";
import type { User, UserListResponse, UserUpdate } from "../_components/types";

const ROLE_TONE: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  employee: "secondary",
  invited: "outline",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "超管",
  employee: "员工",
  invited: "邀请中",
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api<UserListResponse>("/api/auth/users");
      setUsers(r.users ?? []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = async (user: User, data: UserUpdate) => {
    await api(`/api/auth/users/${user.id}`, { method: "PUT", body: data });
    await load();
  };

  const handleDelete = async (user: User) => {
    await api(`/api/auth/users/${user.id}`, { method: "DELETE" });
    await load();
  };

  const initials = (name: string) =>
    name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          返回设置
        </Link>
      </div>

      <header className="flex items-center gap-2 space-y-1">
        <UsersIcon className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">用户管理</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} 个用户 · 编辑角色 / 启停 / 删除
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              还没有用户
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[10px]">{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <div className="leading-tight">
                          <div className="font-medium text-sm">{u.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_TONE[u.role] ?? "outline"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "secondary"}>
                        {u.isActive ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {u.tenantId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => { setEditing(u); setEditOpen(true); }}>编辑</Button>
                        <Button variant="destructive" size="sm" onClick={() => { setDeleting(u); setDeleteOpen(true); }}>删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserEditDialog
        user={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleUpdate}
      />
      <UserDeleteDialog
        user={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
