import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { ujianRepo, sesiRepo } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { uid } from "@/lib/cbt/storage";
import type { Ujian } from "@/lib/cbt/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Users, BarChart3, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { visibleUjians } from "@/lib/cbt/access";

export const Route = createFileRoute("/_authenticated/admin/ujian")({
	component: UjianRoute,
});

/**
 * Parent route for `/admin/ujian/*`. When the path is the index
 * (`/admin/ujian`) we render the list view; when the path descends
 * into a child (e.g. `/admin/ujian/$id`, `/admin/ujian/$id/token`)
 * we delegate to the child's component via `<Outlet />`.
 *
 * This is the same pattern used in `admin.modul.tsx` and is required
 * for the child routes to render at all. Without it, `UjianList`
 * would always be shown for any descendant URL because the parent
 * route's component is treated as a layout by TanStack Router.
 */
function UjianRoute() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isIndexRoute =
		pathname === "/admin/ujian" || pathname === "/admin/ujian/";
	if (!isIndexRoute) {
		return <Outlet />;
	}
	return <UjianList />;
}

function UjianList() {
	const user = useAuthStore((s) => s.user)!;
	const [list, setList] = useState<Ujian[]>(visibleUjians(user));

	function add() {
		const u: Ujian = {
			id: uid("ex_"),
			nama: "Ujian Baru",
			deskripsi: "",
			durasiMenit: 30,
			poinBenar: 1,
			poinSalah: 0,
			poinKosong: 0,
			tokenAktif: false,
			ipRange: "",
			groupIds: [],
			topicSets: [],
			showResult: true,
			showResultDetail: false,
			fullscreenWajib: true,
			maxPindahTab: 3,
			blokirShortcut: true,
			mode: "online",
			createdBy: user.id,
			createdAt: Date.now(),
		};
		ujianRepo.upsert(u);
		setList(visibleUjians(user));
		toast.success("Ujian baru dibuat — silakan edit");
	}
	function remove(id: string) {
		if (!confirm("Hapus ujian beserta semua sesi?")) return;
		ujianRepo.remove(id);
		sesiRepo
			.all()
			.filter((s) => s.ujianId === id)
			.forEach((s) => sesiRepo.remove(s.id));
		setList(visibleUjians(user));
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Paket Ujian</h1>
					<p className="text-sm text-muted-foreground">
						Buat dan kelola paket ujian.
					</p>
				</div>
				<Button onClick={add}>
					<Plus className="mr-1 h-4 w-4" />
					Ujian Baru
				</Button>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				{list.map((u) => {
					const sesiCount = sesiRepo
						.all()
						.filter((s) => s.ujianId === u.id).length;
					const soalCount = u.topicSets.reduce((a, b) => a + b.jumlah, 0);
					return (
						<Card key={u.id}>
							<CardContent className="p-4 space-y-2">
								<div className="flex items-start justify-between">
									<div>
										<h3 className="font-medium">{u.nama}</h3>
										<p className="text-xs text-muted-foreground">
											{u.durasiMenit} menit · {soalCount} soal ·{" "}
											{u.groupIds.length} group · {sesiCount} sesi
										</p>
									</div>
									<div className="flex gap-1">
										<Link to="/admin/ujian/$id" params={{ id: u.id }}>
											<Button size="sm" variant="ghost">
												<Pencil className="h-4 w-4" />
											</Button>
										</Link>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => remove(u.id)}
										>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</div>
								</div>
								<div className="flex flex-wrap gap-2 pt-1">
									<Link to="/admin/ujian/$id" params={{ id: u.id }}>
										<Button size="sm" variant="outline">
											Edit
										</Button>
									</Link>
									<Link to="/admin/ujian/$id/token" params={{ id: u.id }}>
										<Button size="sm" variant="outline">
											<KeyRound className="mr-1 h-3 w-3" />
											Token
										</Button>
									</Link>
									<Link to="/admin/ujian/$id/peserta" params={{ id: u.id }}>
										<Button size="sm" variant="outline">
											<Users className="mr-1 h-3 w-3" />
											Peserta
										</Button>
									</Link>
									<Link to="/admin/hasil/$id" params={{ id: u.id }}>
										<Button size="sm" variant="outline">
											Hasil
										</Button>
									</Link>
									<Link to="/admin/leaderboard/$id" params={{ id: u.id }}>
										<Button size="sm" variant="outline">
											<BarChart3 className="mr-1 h-3 w-3" />
											Leaderboard
										</Button>
									</Link>
								</div>
							</CardContent>
						</Card>
					);
				})}
				{list.length === 0 && (
					<div className="text-muted-foreground">Belum ada ujian.</div>
				)}
			</div>
		</div>
	);
}
