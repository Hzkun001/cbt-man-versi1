import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { hydrateRepos } from "@/lib/cbt/repos";
import { readPersistedAuthSnapshot, useAuthStore } from "@/lib/cbt/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk — CBT-MAN" },
      { name: "description", content: "Masuk ke aplikasi ujian online CBT-MAN" },
    ],
  }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const { user } = useAuthStore.getState();
    const persisted = readPersistedAuthSnapshot();
    const activeUser = user ?? persisted.user;
    if (activeUser) throw redirect({ to: activeUser.role === "peserta" ? "/peserta" : "/admin" });
  },
  component: LoginPage,
});

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const navigate = useNavigate();

  useEffect(() => {
    void hydrateRepos();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const activeUser = user ?? readPersistedAuthSnapshot().user;
    if (!activeUser) return;

    void navigate({
      to: activeUser.role === "peserta" ? "/peserta" : "/admin",
      replace: true,
    });
  }, [hydrated, navigate, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal masuk");
      return;
    }
    toast.success("Berhasil masuk");
    navigate({ to: res.role === "peserta" ? "/peserta" : "/admin" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-background to-accent/20 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            Z
          </div>
          <CardTitle className="mt-3 text-2xl">Masuk ke CBT-MAN</CardTitle>
          <CardDescription>Admin, guru, dan siswa masuk dari halaman ini</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u">Username</Label>
              <Input id="u" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">Password</Label>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Memverifikasi…" : "Masuk"}
            </Button>
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Akun demo:</p>
              <ul className="mt-1 space-y-0.5">
                <li>Admin: <code>admin / admin123</code></li>
                <li>Guru: <code>guru / guru123</code></li>
                <li>Siswa: <code>siswa1 / siswa1123</code> (… s/d siswa5)</li>
              </ul>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:underline">← Kembali ke beranda</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
