import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usersRepo } from "@/lib/cbt/repos";
import { revokeUserSessionsServer } from "@/lib/server/repos/functions";
import { hashPassword } from "@/lib/cbt/hash";
import { uid } from "@/lib/cbt/storage";
import type { Role, User } from "@/lib/cbt/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const [users, setUsers] = useState<User[]>(usersRepo.all().filter((u) => u.role !== "peserta"));
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  function refresh() {
    setUsers(usersRepo.all().filter((u) => u.role !== "peserta"));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Kelola akun admin & operator.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Tambah
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">Username</th>
                <th className="p-3">Nama</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{u.username}</td>
                  <td className="p-3">{u.namaLengkap}</td>
                  <td className="p-3">
                    <span className="rounded bg-accent px-2 py-0.5 text-xs">{u.role}</span>
                  </td>
                  <td className="p-3">{u.aktif ? "Aktif" : "Nonaktif"}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(u);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!confirm("Hapus pengguna ini?")) return;
                        usersRepo.remove(u.id);
                        refresh();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Hentikan semua sesi aktif pengguna ini"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Hentikan semua sesi aktif untuk ${u.username}? Mereka akan keluar paksa pada aktivitas berikutnya.`,
                          )
                        )
                          return;
                        try {
                          const res = await revokeUserSessionsServer({ data: { userId: u.id } });
                          if (res.ok)
                            toast.success(`${res.deleted} sesi dihentikan untuk ${u.username}`);
                          else toast.error(res.error ?? "Gagal menghentikan sesi");
                        } catch {
                          toast.error("Gagal menghentikan sesi");
                        }
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Belum ada pengguna.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <UserDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={refresh} />
    </div>
  );
}

function UserDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: User | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<{
    username: string;
    namaLengkap: string;
    role: Role;
    aktif: boolean;
    password: string;
  }>(() => ({
    username: editing?.username ?? "",
    namaLengkap: editing?.namaLengkap ?? "",
    role: editing?.role ?? "operator",
    aktif: editing?.aktif ?? true,
    password: "",
  }));

  // reset form when editing changes
  useState(() => undefined);
  // re-init when editing changes via open
  if (open && editing && form.username !== editing.username) {
    setForm({
      username: editing.username,
      namaLengkap: editing.namaLengkap,
      role: editing.role,
      aktif: editing.aktif,
      password: "",
    });
  }

  async function save() {
    if (!form.username.trim() || !form.namaLengkap.trim()) {
      toast.error("Username dan nama wajib diisi");
      return;
    }
    if (!editing && !form.password) {
      toast.error("Password wajib diisi untuk akun baru");
      return;
    }
    const passwordHash = form.password ? await hashPassword(form.password) : editing!.passwordHash;

    const user: User = editing
      ? {
          ...editing,
          username: form.username,
          namaLengkap: form.namaLengkap,
          role: form.role,
          aktif: form.aktif,
          passwordHash,
        }
      : {
          id: uid("u_"),
          username: form.username,
          namaLengkap: form.namaLengkap,
          role: form.role,
          aktif: form.aktif,
          passwordHash,
          allowedTopikIds: [],
          createdAt: Date.now(),
        };
    usersRepo.upsert(user);
    toast.success(editing ? "Pengguna diperbarui" : "Pengguna ditambahkan");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Pengguna" : "Pengguna Baru"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Username</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Nama lengkap</Label>
            <Input
              value={form.namaLengkap}
              onChange={(e) => setForm({ ...form, namaLengkap: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operator">Operator (Guru)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{editing ? "Password baru (kosongkan jika tidak diubah)" : "Password"}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={save}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
