import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ujianRepo, sesiRepo, soalRepo } from "@/lib/cbt/repos";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RichView } from "@/components/cbt/RichEditor";
import { AudioPlayer } from "@/components/cbt/AudioPlayer";
import { CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/peserta/ujian/$id/hasil")({
  component: HasilPeserta,
});

function HasilPeserta() {
  const { id } = useParams({ from: "/_authenticated/peserta/ujian/$id/hasil" });
  const user = useAuthStore((s) => s.user)!;
  const ujian = ujianRepo.byId(id);
  const sesi = sesiRepo.all().find((s) => s.ujianId === id && s.pesertaId === user.id && s.status === "selesai");

  if (!ujian || !sesi) return <div>Hasil tidak ditemukan</div>;
  const pct = sesi.maxSkor ? Math.round((sesi.skorTotal! / sesi.maxSkor) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/peserta" className="text-sm text-muted-foreground hover:underline">← Daftar ujian</Link>
      <Card><CardContent className="p-6 text-center space-y-2">
        <h1 className="text-xl font-semibold">{ujian.nama}</h1>
        {ujian.showResult ? (
          <>
            <div className="text-5xl font-bold text-primary">{sesi.skorTotal}</div>
            <div className="text-sm text-muted-foreground">dari {sesi.maxSkor} ({pct}%)</div>
          </>
        ) : (
          <div className="text-muted-foreground">Hasil tidak ditampilkan oleh penyelenggara.</div>
        )}
      </CardContent></Card>

      {ujian.showResult && ujian.showResultDetail && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="font-medium">Pembahasan</h3>
          {sesi.jawaban.map((j, i) => {
            const soal = soalRepo.byId(j.soalId);
            if (!soal) {
              return (
                <div key={i} className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                  Soal #{i + 1} tidak tersedia lagi di bank soal.
                </div>
              );
            }
            const benarIds = soal.jawaban.filter((x) => x.benar).map((x) => x.id);
            const isEssay = soal.tipe === "essay";
            const correct = !isEssay && j.jawabanIds.length === benarIds.length && benarIds.every((id) => j.jawabanIds.includes(id));
            return (
              <div key={i} className="rounded border p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Soal #{i + 1} · {soal.tipe} · {isEssay ? (
                    <span className="text-primary">
                      {typeof j.skor === "number" ? `dinilai (${j.skor})` : "belum dinilai"}
                    </span>
                  ) : correct ? <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />benar</span> : <span className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />salah</span>}
                </div>
                <RichView html={soal.detail} />
                {soal.audioFileId && (
                  <AudioPlayer fileId={soal.audioFileId} playOnce={false} />
                )}
                
                {soal.tipe === "essay" && (
                  <div className="rounded bg-muted/40 p-2 text-xs space-y-1">
                    <div className="font-medium">Jawaban Anda:</div>
                    <RichView html={j.jawabanEssay || "<em>(kosong)</em>"} />
                    {typeof j.skor === "number" && (
                      <div className="text-muted-foreground">Skor: <strong>{j.skor}</strong></div>
                    )}
                  </div>
                )}
                {soal.tipe !== "essay" && (
                  <ul className="ml-4 list-disc text-xs">
                    {soal.jawaban.map((opt) => (
                      <li key={opt.id} className={opt.benar ? "text-success" : j.jawabanIds.includes(opt.id) ? "text-destructive" : ""}>
                        <RichView html={opt.detail} className="inline" />
                        {opt.benar && " ✓"}{j.jawabanIds.includes(opt.id) && " (jawaban Anda)"}
                      </li>
                    ))}
                  </ul>
                )}
                {soal.pembahasan && <div className="rounded bg-muted p-2 text-xs"><strong>Pembahasan:</strong> <RichView html={soal.pembahasan} className="inline" /></div>}
              </div>
            );
          })}
        </CardContent></Card>
      )}

      <div className="text-center"><Link to="/peserta"><Button variant="outline">Kembali ke dashboard</Button></Link></div>
    </div>
  );
}
