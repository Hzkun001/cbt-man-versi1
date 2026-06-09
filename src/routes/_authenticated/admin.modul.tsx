import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { modulRepo, topikRepo, soalRepo } from "@/lib/cbt/repos";
import { uid } from "@/lib/cbt/storage";
import {
  ModulSchema,
  TopikSchema,
  SoalSchema,
  type Modul,
} from "@/lib/cbt/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronRight, Upload, FileText, Download, FileUp, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/cbt/auth-store";
import { visibleModuls, allowedTopikIdSet, isUnrestricted } from "@/lib/cbt/access";

export const Route = createFileRoute("/_authenticated/admin/modul")({
  component: ModulRoute,
});

const BankSchema = z.object({
  app: z.literal("cbtman-bank"),
  version: z.literal(1),
  modul: ModulSchema,
  topik: z.array(TopikSchema),
  soal: z.array(SoalSchema),
});
type Bank = z.infer<typeof BankSchema>;

function ModulRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isIndexRoute = pathname === "/admin/modul" || pathname === "/admin/modul/";

  if (!isIndexRoute) {
    return <Outlet />;
  }

  return <ModulPage />;
}

function ModulPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = isUnrestricted(user);
  const [moduls, setModuls] = useState<Modul[]>(visibleModuls(user));
  const allowedSet = allowedTopikIdSet(user);
  const [nama, setNama] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  function add() {
    if (!canEdit) return;
    if (!nama.trim()) return;
    modulRepo.upsert({ id: uid("m_"), nama: nama.trim(), aktif: true });
    setNama("");
    setModuls(visibleModuls(user));
    toast.success("Modul ditambahkan");
  }
  function remove(id: string) {
    if (!canEdit) return;
    const topiks = topikRepo.all().filter((t) => t.modulId === id);
    if (topiks.length) {
      toast.error("Hapus topik di dalam modul ini dulu");
      return;
    }
    if (!confirm("Hapus modul?")) return;
    modulRepo.remove(id);
    setModuls(visibleModuls(user));
  }

  function exportBank(modul: Modul) {
    const topik = topikRepo.all().filter((t) => t.modulId === modul.id);
    const tIds = new Set(topik.map((t) => t.id));
    const soal = soalRepo.all().filter((s) => tIds.has(s.topikId));
    const bank: Bank = { app: "cbtman-bank", version: 1, modul, topik, soal };
    const blob = new Blob([JSON.stringify(bank, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${modul.nama.replace(/\s+/g, "_")}.bank.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBank(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const bank = BankSchema.parse(raw);
      // Re-id supaya tidak bentrok
      const newModul = { ...bank.modul, id: uid("m_"), nama: bank.modul.nama + " (import)" };
      const idMap: Record<string, string> = {};
      const newTopik = bank.topik.map((t) => {
        const nid = uid("t_");
        idMap[t.id] = nid;
        return { ...t, id: nid, modulId: newModul.id };
      });
      const newSoal = bank.soal.map((s) => ({
        ...s,
        id: uid("s_"),
        topikId: idMap[s.topikId] ?? s.topikId,
        jawaban: s.jawaban.map((j) => ({ ...j, id: uid("j_") })),
      }));
      modulRepo.upsert(newModul);
      newTopik.forEach((t) => topikRepo.upsert(t));
      newSoal.forEach((s) => soalRepo.upsert(s));
      setModuls(visibleModuls(user));
      toast.success(
        `Bank diimport: ${newModul.nama} — ${newTopik.length} topik, ${newSoal.length} soal`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Gagal: format file tidak valid");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Soal — Modul</h1>
          <p className="text-sm text-muted-foreground">
            Modul = mata pelajaran. Pilih untuk mengelola topik & soal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBank(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <FileUp className="mr-1 h-4 w-4" />
            Import Bank JSON
          </Button>
          <Link to="/admin/modul/import">
            <Button variant="outline">
              <Upload className="mr-1 h-4 w-4" />
              Import Excel
            </Button>
          </Link>
          <Link to="/admin/modul/import-word">
            <Button variant="outline">
              <FileText className="mr-1 h-4 w-4" />
              Import Word
            </Button>
          </Link>
        </div>
      </div>

      {canEdit ? (
        <div className="flex max-w-md gap-2">
          <Input
            placeholder="Nama modul baru (mis. Matematika)"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
          <Button onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Tambah
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Anda hanya bisa melihat topik yang diizinkan. Hubungi admin untuk akses lebih.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {moduls.map((m) => {
          const tAll = topikRepo.all().filter((t) => t.modulId === m.id);
          const t = allowedSet ? tAll.filter((x) => allowedSet.has(x.id)) : tAll;
          const tIds = new Set(t.map((x) => x.id));
          const sCount = soalRepo.all().filter((s) => tIds.has(s.topikId)).length;
          return (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{m.nama}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t.length} topik · {sCount} soal
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Export bank soal"
                      onClick={() => exportBank(m)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <Link
                  to="/admin/modul/$id/topik"
                  params={{ id: m.id }}
                  className="mt-3 inline-flex items-center text-sm text-primary hover:underline"
                >
                  Kelola topik <ChevronRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
        {moduls.length === 0 && <div className="text-muted-foreground">Belum ada modul.</div>}
      </div>
    </div>
  );
}
