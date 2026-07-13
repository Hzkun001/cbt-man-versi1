import { useState, useEffect } from "react";
import { loadPublicBootConfig } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  redirectUrl?: string;
}

export function LoginModal({ isOpen, onClose, redirectUrl }: LoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [appName, setAppName] = useState("CBT-MAN");
  const [pesanLogin, setPesanLogin] = useState("Selamat datang di aplikasi ujian online");
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void loadPublicBootConfig()
      .then((config) => {
        if (!active) return;
        setAppName(config.appName);
        setPesanLogin(config.pesanLogin);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [isOpen]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(username.trim(), password);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal masuk");
        return;
      }
      toast.success("Berhasil masuk");

      const fallback = res.role === "peserta" ? "/peserta" : "/admin";
      const redirect = redirectUrl?.startsWith("/")
        ? new URL(redirectUrl, window.location.origin)
        : undefined;
      window.location.href = redirect?.origin === window.location.origin ? redirect.href : fallback;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data sesi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="text-center sm:text-center flex flex-col items-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground font-sans">
            Z
          </div>
          <DialogTitle className="mt-3 text-2xl font-sans">Masuk ke {appName}</DialogTitle>
          <DialogDescription className="text-center font-sans">{pesanLogin}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-2 font-sans">
          <div className="space-y-2">
            <Label htmlFor="modal-u">Username</Label>
            <Input
              id="modal-u"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modal-p">Password</Label>
            <Input
              id="modal-p"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full cursor-pointer" disabled={busy}>
            {busy ? "Memverifikasi…" : "Masuk"}
          </Button>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Akun demo:</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                Admin: <code>admin / admin123</code>
              </li>
              <li>
                Guru: <code>guru / guru123</code>
              </li>
              <li>
                Siswa: <code>siswa1 / siswa1123</code> (… s/d siswa5)
              </li>
            </ul>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
