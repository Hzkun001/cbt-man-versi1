import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ujianRepo, sesiRepo, tokenRepo } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { findOrCreateSesi, startSesi } from "@/lib/cbt/exam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RichView } from "@/components/cbt/RichEditor";
import { Clock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/peserta/ujian/$id")({
  component: PreUjian,
});

function PreUjian() {
  const { id } = useParams({ from: "/_authenticated/peserta/ujian/$id" });
  const user = useAuthStore((s) => s.user);
  const ujian = ujianRepo.byId(id);

  if (!user) return <div>Pengguna tidak ditemukan</div>;
  if (!ujian) return <div>Ujian tidak ditemukan</div>;

  return <PreUjianContent user={user} ujian={ujian} />;
}

function PreUjianContent({ user, ujian }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>; ujian: NonNullable<ReturnType<typeof ujianRepo.byId>> }) {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [agree, setAgree] = useState(false);
  const tokenInputId = `token-ujian-${ujian.id}`;

  const sesiSelesai = sesiRepo
    .all()
    .find((s) => s.ujianId === ujian.id && s.pesertaId === user.id && s.status === "selesai");

  async function mulai() {
    if (!agree) { toast.error("Centang persetujuan dulu"); return; }
    if (ujian.tokenAktif) {
      const kode = token.trim().toUpperCase();
      if (kode.length === 0) { toast.error("Masukkan token"); return; }
      const tokenRow = tokenRepo.all().find(
        (t) => t.ujianId === ujian.id && t.kode.toUpperCase() === kode,
      );
      if (!tokenRow) { toast.error("Token tidak valid untuk ujian ini"); return; }
      if (tokenRow.dipakaiOleh && tokenRow.dipakaiOleh !== user.id) {
        toast.error("Token sudah dipakai peserta lain");
        return;
      }
      if (!tokenRow.dipakaiOleh) {
        tokenRepo.upsert({ ...tokenRow, dipakaiOleh: user.id, dipakaiAt: Date.now() });
      }
    }
    if (ujian.fullscreenWajib) {
      try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    }
    const sesi = findOrCreateSesi(ujian.id, user.id);
    const started = sesi.status === "sedang" ? sesi : startSesi(sesi, ujian);
    sesiRepo.upsert(started);
    navigate({ to: "/peserta/ujian/$id/kerjakan", params: { id: ujian.id } });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link to="/peserta" className="text-sm text-muted-foreground hover:underline">← Daftar ujian</Link>
      <h1 className="text-2xl font-semibold tracking-tight">{ujian.nama}</h1>
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4" />Durasi {ujian.durasiMenit} menit · {ujian.topicSets.reduce((a, b) => a + b.jumlah, 0)} soal</div>
        <RichView html={ujian.deskripsi || "<p><em>Tidak ada deskripsi.</em></p>"} />
        {sesiSelesai && (
          <div className="rounded border bg-accent p-3 text-sm">
            Anda sudah menyelesaikan ujian ini. <Link to="/peserta/ujian/$id/hasil" params={{ id: ujian.id }} className="text-primary underline">Lihat hasil</Link>.
          </div>
        )}
        <div className="rounded border border-warning/30 bg-warning/10 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Aturan</div>
          <ul className="ml-5 list-disc text-xs">
            {ujian.fullscreenWajib && <li>Ujian wajib dalam mode fullscreen.</li>}
            {ujian.maxPindahTab > 0 && <li>Pindah tab/aplikasi maksimal {ujian.maxPindahTab}× sebelum auto-submit.</li>}
            {ujian.blokirShortcut && <li>Copy, paste, dan klik kanan dinonaktifkan.</li>}
            <li>Waktu berjalan otomatis sejak Anda menekan "Mulai".</li>
          </ul>
        </div>
        {ujian.tokenAktif && (
          <div>
            <Label htmlFor={tokenInputId}>Token ujian</Label>
            <Input id={tokenInputId} value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          Saya bersedia mengikuti ujian dengan jujur.
        </label>
        <Button className="w-full" onClick={mulai} disabled={!!sesiSelesai}>Mulai Ujian</Button>
      </CardContent></Card>
    </div>
  );
}
