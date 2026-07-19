import { createFileRoute, Link } from "@tanstack/react-router";
import { sesiRepo, ujianRepo, usersRepo, soalRepo } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { visibleUjians } from "@/lib/cbt/access";

export const Route = createFileRoute("/_authenticated/admin/evaluasi")({
  component: EvaluasiList,
});

function EvaluasiList() {
  const user = useAuthStore((s) => s.user);
  const visibleIds = new Set(visibleUjians(user).map((u) => u.id));
  const sesis = sesiRepo.all().filter((s) => s.status === "selesai" && visibleIds.has(s.ujianId));
  const ujians = ujianRepo.all();
  const soals = soalRepo.all();
  const soalSet = new Set(soals.filter((s) => s.tipe === "essay").map((s) => s.id));

  const ujianMap = new Map<string, { ujian: any, totalSesi: number, belumSesi: number, totalEssay: number, belumEssay: number }>();

  sesis.forEach(s => {
    const essays = s.jawaban.filter((j) => soalSet.has(j.soalId));
    if (essays.length === 0) return;

    const belumCount = essays.filter((j) => typeof j.skor !== "number").length;
    
    if (!ujianMap.has(s.ujianId)) {
      const u = ujians.find(x => x.id === s.ujianId);
      if (!u) return;
      ujianMap.set(s.ujianId, { ujian: u, totalSesi: 0, belumSesi: 0, totalEssay: 0, belumEssay: 0 });
    }
    
    const entry = ujianMap.get(s.ujianId)!;
    entry.totalSesi += 1;
    entry.totalEssay += essays.length;
    entry.belumEssay += belumCount;
    if (belumCount > 0) {
      entry.belumSesi += 1;
    }
  });

  const items = Array.from(ujianMap.values()).sort((a, b) => b.belumSesi - a.belumSesi);
  const totalBelumSesi = items.reduce((acc, curr) => acc + curr.belumSesi, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">Manual Grading</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {totalBelumSesi > 0 
            ? `${totalBelumSesi} submissions waiting for your review.` 
            : "Inbox zero. All submissions have been graded."}
        </p>
      </div>

      <div className="border-t border-slate-200 dark:border-zinc-800">
        {items.length === 0 ? (
          <div className="py-20 text-center">
            <span className="text-slate-400 dark:text-zinc-500">No pending grading tasks.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map(({ ujian, totalSesi, belumSesi, totalEssay }) => {
              const isWarning = belumSesi > 0;
              return (
                <Link 
                  key={ujian.id} 
                  to="/admin/evaluasi/ujian/$id" 
                  params={{ id: ujian.id }} 
                  className="group flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/30 transition-colors -mx-4 px-4 rounded-md"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-sm text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {ujian.nama}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                      {totalSesi} submissions • {totalEssay} essays total
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 sm:ml-4 mt-2 sm:mt-0">
                    {isWarning ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                        {belumSesi} pending
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-zinc-600">
                        Cleared
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
