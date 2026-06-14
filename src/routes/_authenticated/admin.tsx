import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { configRepo } from "@/lib/cbt/repos";
import { type NavKey } from "@/lib/cbt/types";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  FileText,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  Trophy,
  Wrench,
  FolderOpen,
  PenLine,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    const user = (context as { user: { role: string } }).user;
    if (user.role === "peserta") throw redirect({ to: "/peserta" });
  },
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  key: NavKey;
  exact?: boolean;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, key: "dashboard", exact: true },
  { to: "/admin/users", label: "Pengguna", icon: Users, key: "users", adminOnly: true },
  { to: "/admin/peserta", label: "Peserta", icon: GraduationCap, key: "peserta" },
  { to: "/admin/peserta/online", label: "Peserta Online", icon: Activity, key: "peserta" },
  { to: "/admin/modul", label: "Bank Soal", icon: BookOpen, key: "modul" },
  { to: "/admin/files", label: "File Manager", icon: FolderOpen, key: "files" },
  { to: "/admin/ujian", label: "Paket Ujian", icon: FileText, key: "ujian" },
  { to: "/admin/hasil", label: "Hasil & Riwayat", icon: ClipboardList, key: "hasil" },
  { to: "/admin/evaluasi", label: "Evaluasi Essay", icon: PenLine, key: "evaluasi" },
  { to: "/admin/laporan", label: "Laporan", icon: BarChart3, key: "laporan" },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: Trophy, key: "leaderboard" },
  {
    to: "/admin/pengaturan",
    label: "Pengaturan",
    icon: Settings,
    key: "pengaturan",
    adminOnly: true,
  },
  { to: "/admin/tools", label: "Backup & Tools", icon: Wrench, key: "tools", adminOnly: true },
];

function AdminLayout() {
  const user = useAuthStore((s) => s.user)!;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cfg = configRepo.get();
  const appName = cfg.appName;
  const operatorAccess = (cfg.roleAccess.operator ?? []) as NavKey[];

  const visible = navItems.filter((n) => {
    if (n.adminOnly && user.role !== "admin") return false;
    if (user.role === "operator") return operatorAccess.includes(n.key);
    return true;
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:block">
          <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              Z
            </span>
            {appName}
          </div>
          <nav className="space-y-1 p-3">
            {visible.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to as never}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{user.namaLengkap}</span>
              <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                {user.role}
              </span>
            </div>
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
          </header>
          <main className="flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
