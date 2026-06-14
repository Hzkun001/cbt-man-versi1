import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { validateSessionServer } from "@/lib/server/repos/functions";
import { configRepo, hydrateRepos } from "@/lib/cbt/repos";
import { Button } from "@/components/ui/button";
import { GraduationCap, ShieldCheck, ListChecks, Timer } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CBT-MAN — Aplikasi Ujian Berbasis Komputer" },
      {
        name: "description",
        content:
          "Ujian online modern: bank soal, timer, anti-cheat, dan laporan dalam satu aplikasi.",
      },
    ],
  }),
  beforeLoad: async () => {
    // Sudah punya sesi valid (cookie httpOnly)? → langsung ke area sesuai role.
    const { user } = await validateSessionServer();
    if (user) {
      throw redirect({ to: user.role === "peserta" ? "/peserta" : "/admin" });
    }
  },
  component: Landing,
});

function Landing() {
  const [ready, setReady] = useState(false);
  const [appName, setAppName] = useState("CBT-MAN");

  useEffect(() => {
    void hydrateRepos().then(() => {
      setAppName(configRepo.get().appName);
      setReady(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            Z
          </span>
          {appName}
        </div>
        <Button asChild>
          <Link to="/login">Masuk</Link>
        </Button>
      </header>

      <main className="container mx-auto px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Aplikasi CBT modern untuk sekolah Anda
          </h1>
          <p className="mt-5 text-balance text-lg text-muted-foreground">
            Mirror dari CBT-MAN dengan praktik terbaik: bank soal lengkap, multi-tipe soal, timer
            akurat, token ujian, anti-cheat, analisis butir soal, dan leaderboard — dengan data
            utama tersimpan di SQLite lokal.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/login">Mulai sekarang</Link>
            </Button>
          </div>
          {ready && (
            <p className="mt-4 text-sm text-muted-foreground">
              Akun demo: <code>admin / admin123</code> · <code>guru / guru123</code> ·{" "}
              <code>siswa1 / siswa1123</code>
            </p>
          )}
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              i: ListChecks,
              t: "Bank Soal",
              d: "Modul → Topik → Soal dengan rich-text, gambar & rumus.",
            },
            { i: Timer, t: "Timer Akurat", d: "Berbasis waktu absolut, tahan refresh & tab idle." },
            { i: ShieldCheck, t: "Anti-Cheat", d: "Fullscreen, deteksi pindah tab, token ujian." },
            { i: GraduationCap, t: "Analisis", d: "Rekap nilai, butir soal & leaderboard." },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-xl border bg-card p-5 shadow-sm">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-medium">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="container mx-auto px-6 pb-10 pt-6 text-center text-sm text-muted-foreground">
        {appName} · SQLite lokal sebagai sumber data utama (single device). Multi-device opsional di
        tahap berikutnya.
      </footer>
    </div>
  );
}
