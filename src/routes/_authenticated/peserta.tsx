import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { configRepo } from "@/lib/cbt/repos";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/peserta")({
  beforeLoad: ({ context }) => {
    const user = (context as { user: { role: string } }).user;
    if (user.role !== "peserta") throw redirect({ to: "/admin" });
  },
  component: PesertaLayout,
});

function PesertaLayout() {
  const user = useAuthStore((s) => s.user)!;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const appName = configRepo.get().appName;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              Z
            </span>
            {appName}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.namaLengkap}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-1 h-4 w-4" /> Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
