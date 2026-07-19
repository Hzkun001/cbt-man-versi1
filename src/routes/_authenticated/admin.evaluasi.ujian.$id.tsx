import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { sesiRepo, ujianRepo, usersRepo, soalRepo } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { visibleUjians } from "@/lib/cbt/access";

export const Route = createFileRoute("/_authenticated/admin/evaluasi/ujian/$id")({
  component: EvaluasiUjianList,
});

function EvaluasiUjianList() {
  const { id } = useParams({ from: "/_authenticated/admin/evaluasi/ujian/$id" });
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const visibleIds = new Set(visibleUjians(user).map((u) => u.id));
  
  if (!visibleIds.has(id)) {
    return <div className="py-20 text-center text-sm text-slate-500">No access or exam not found.</div>;
  }

  const ujian = ujianRepo.byId(id);
  if (!ujian) return <div className="py-20 text-center text-sm text-slate-500">Exam not found.</div>;

  const sesis = sesiRepo.all().filter((s) => s.status === "selesai" && s.ujianId === id);
  const users = usersRepo.all();
  const soals = soalRepo.all();
  const soalSet = new Set(soals.filter((s) => s.tipe === "essay").map((s) => s.id));

  const items = sesis
    .map((s) => {
      const essays = s.jawaban.filter((j) => soalSet.has(j.soalId));
      const belum = essays.filter((j) => typeof j.skor !== "number").length;
      return { sesi: s, total: essays.length, belum };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.belum - a.belum);

  const totalBelum = items.reduce((acc, curr) => acc + curr.belum, 0);

  return (
    <div className="mx-auto max-w-4xl py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link to="/admin/evaluasi" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors">
          ← Back to Inbox
        </Link>
      </div>
      
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
          {ujian.nama}
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {totalBelum > 0 
            ? `${totalBelum} tasks remaining from ${items.filter(x => x.belum > 0).length} students.` 
            : "All answers graded."}
        </p>
      </div>

      <div className="border-t border-slate-200 dark:border-zinc-800">
        {items.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400 dark:text-zinc-500">
            No submissions with essays found.
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map(({ sesi, total, belum }) => {
              const u = users.find((x) => x.id === sesi.pesertaId);
              const isWarning = belum > 0;

              return (
                <div
                  key={sesi.id}
                  onClick={() => navigate({ to: '/admin/evaluasi/$id', params: { id: sesi.id } })}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/30 transition-colors -mx-4 px-4 rounded-md cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate({ to: '/admin/evaluasi/$id', params: { id: sesi.id } });
                    }
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-sm text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {u?.namaLengkap || "Peserta Anonim"}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 font-mono">
                      {u?.username}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 mt-2 sm:mt-0">
                    <div className="text-xs text-slate-500">
                      {total - belum} / {total} graded
                    </div>
                    {isWarning ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500 w-24 justify-end">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                        {belum} pending
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-zinc-600 w-24 justify-end flex">
                        Cleared
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
