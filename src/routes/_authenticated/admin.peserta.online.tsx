import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { sesiRepo, ujianRepo, usersRepo } from "@/lib/cbt/repos";
import { Activity, AlertTriangle, Users, Timer, CheckCircle2, Search, MonitorPlay } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/peserta/online")({
  component: OnlinePage,
});

function fmtSisa(ms: number): string {
  if (ms <= 0) return "00:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function OnlinePage() {
  const [, tick] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { sesis, ujians, users, totalPelanggaran, avgProgress } = useMemo(() => {
    const rawSesis = sesiRepo.all().filter((s) => s.status === "sedang");
    const ujians = ujianRepo.all();
    const users = usersRepo.all();

    let violations = 0;
    let totalPct = 0;

    const enriched = rawSesis.map((s) => {
      const u = users.find((x) => x.id === s.pesertaId);
      const ex = ujians.find((x) => x.id === s.ujianId);
      const dijawab = s.jawaban.filter((j) => j.jawabanIds.length > 0 || j.jawabanEssay.length > 0).length;
      const totalSoal = s.soalIds.length || 1;
      const progress = (dijawab / totalSoal) * 100;
      
      violations += s.pelanggaran;
      totalPct += progress;

      return { s, u, ex, dijawab, totalSoal, progress };
    });

    const filtered = enriched.filter(({ u, ex }) => 
      (u?.namaLengkap || "").toLowerCase().includes(search.toLowerCase()) ||
      (ex?.nama || "").toLowerCase().includes(search.toLowerCase())
    );

    return {
      sesis: filtered,
      ujians,
      users,
      totalPelanggaran: violations,
      avgProgress: rawSesis.length > 0 ? totalPct / rawSesis.length : 0
    };
  }, [tick, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      
      {/* Functional Feature Heading */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Sistem Pengawasan Aktif
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Pantau Ujian Live</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Monitoring real-time aktivitas peserta, pelacakan progres, dan deteksi anomali.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/30">
            <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Sesi Aktif</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">
              {sesis.length} <span className="text-sm font-semibold text-slate-400">peserta</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center border border-rose-100 dark:border-rose-800/30">
            <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Pelanggaran</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">
              {totalPelanggaran} <span className="text-sm font-semibold text-slate-400">insiden</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/30">
            <CheckCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Rata-rata Progress</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">
              {Math.round(avgProgress)}%
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 px-1 uppercase tracking-wider">Daftar Peserta Live</h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Cari nama atau ujian..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-sm rounded-xl focus-visible:ring-emerald-500"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
          {sesis.map(({ s, u, ex, dijawab, totalSoal, progress }) => {
            const sisaMs = s.endsAt ? Math.max(0, s.endsAt - Date.now()) : 0;
            const isCritical = sisaMs > 0 && sisaMs < 300000;
            
            return (
              <div key={s.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                <div className="flex items-center gap-4 min-w-0 md:w-1/3">
                  <div className="hidden sm:flex h-10 w-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-slate-700">
                    <Users className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{u?.namaLengkap ?? "Unknown"}</h3>
                    <div className="text-[12px] font-medium text-slate-500 truncate mt-0.5">{ex?.nama ?? "Unknown Exam"}</div>
                  </div>
                </div>

                <div className="flex-1 w-full max-w-xs md:max-w-md">
                  <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    <span>Progress Pengerjaan</span>
                    <span className="text-slate-700 dark:text-slate-300">{dijawab} / {totalSoal} Soal</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-full h-2 overflow-hidden shadow-inner">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 md:w-1/4 justify-between md:justify-end">
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Sisa Waktu</div>
                    <div className={`font-mono text-sm font-bold flex items-center justify-end gap-1.5 ${isCritical ? 'text-rose-600 animate-pulse' : 'text-slate-900 dark:text-slate-100'}`}>
                      <Timer className="h-4 w-4" />
                      {fmtSisa(sisaMs)}
                    </div>
                  </div>

                  <div className="w-24 text-right">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Status</div>
                    {s.pelanggaran > 0 ? (
                      <div className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                        {s.pelanggaran} INSIDEN
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        AMAN
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {sesis.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <MonitorPlay className="h-12 w-12 text-slate-200 dark:text-slate-800 mb-4" />
              <p className="text-slate-500 font-medium text-sm">Tidak ada peserta yang sedang aktif.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
