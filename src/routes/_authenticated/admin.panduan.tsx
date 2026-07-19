import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { configRepo } from "@/lib/cbt/repos";
import {
  ChevronDown,
  ChevronRight,
  LogIn,
  BookOpen,
  FileText,
  Users,
  PlayCircle,
  PenLine,
  BarChart3,
  Upload,
  GraduationCap,
  CreditCard,
  Download,
  Settings,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/panduan")({
  component: PanduanPage,
});

// ponytail: static content, no CMS needed
const sections = [
  {
    id: "getting-started",
    title: "Alur Kerja Utama",
    description: "Langkah-langkah dasar untuk menjalankan ujian dari awal hingga selesai.",
    items: [
      {
        id: "login",
        icon: LogIn,
        title: "1. Login & Navigasi Dashboard",
        steps: [
          "Buka halaman login aplikasi dan masukkan username serta password yang telah diberikan.",
          "Setelah berhasil login, Anda akan diarahkan ke Dashboard (Command Center).",
          "Dashboard menampilkan ringkasan status sistem: ujian yang sedang berlangsung, tugas yang memerlukan perhatian, dan metrik database.",
          "Gunakan sidebar di sebelah kiri untuk berpindah antar menu. Sidebar dikelompokkan berdasarkan fungsi: Data Induk, Manajemen Ujian, Monitoring, Pasca Ujian, dan Sistem.",
        ],
      },
      {
        id: "bank-soal",
        icon: BookOpen,
        title: "2. Membuat Bank Soal",
        steps: [
          "Buka menu Bank Soal di sidebar.",
          "Buat Modul baru — modul adalah wadah/folder untuk mengelompokkan soal berdasarkan mata kuliah atau topik.",
          "Di dalam modul, buat satu atau lebih Topik untuk mengkategorikan soal lebih lanjut.",
          "Klik pada topik, lalu tambahkan soal satu per satu. Setiap soal terdiri dari: teks pertanyaan, pilihan jawaban (untuk PG), kunci jawaban, dan bobot nilai.",
          "Tipe soal yang didukung: Pilihan Ganda (PG), Pilihan Ganda Kompleks, dan Essay.",
          "Tip: Anda juga bisa mengimpor soal secara massal dari file Excel atau Word (lihat bagian Fitur Pendukung).",
        ],
      },
      {
        id: "paket-ujian",
        icon: FileText,
        title: "3. Menyusun Paket Ujian",
        steps: [
          "Buka menu Paket Ujian di sidebar.",
          "Klik tombol \"+ Buat Ujian\" untuk membuat paket ujian baru.",
          "Isi detail ujian: nama ujian, durasi (dalam menit), dan tanggal pelaksanaan (jadwal mulai & selesai).",
          "Tambahkan soal ke dalam paket ujian dari bank soal yang sudah tersedia.",
          "Atur urutan soal: berurutan (fixed) atau diacak (random) per peserta.",
          "Atur peserta yang berhak mengikuti ujian — bisa per individu atau per grup.",
        ],
      },
      {
        id: "jadwal-token",
        icon: Settings,
        title: "4. Mengatur Jadwal & Token",
        steps: [
          "Di halaman Editor Ujian, atur jadwal mulai (beginAt) dan jadwal selesai (endAt).",
          "Peserta hanya bisa mengakses ujian di dalam rentang waktu yang telah ditentukan.",
          "Buka tab Token untuk mengaktifkan dan membagikan token akses ujian.",
          "Token berfungsi sebagai kode akses tambahan — peserta harus memasukkan token yang benar sebelum memulai ujian.",
          "Tip: Bagikan token di ruang ujian, bukan di luar ruangan, untuk menjaga keamanan.",
        ],
      },
      {
        id: "pantau-ujian",
        icon: PlayCircle,
        title: "5. Memantau Ujian Secara Live",
        steps: [
          "Buka menu Pantau Ujian Live di sidebar saat ujian sedang berlangsung.",
          "Halaman ini menampilkan daftar peserta yang sedang online beserta progress real-time mereka.",
          "Informasi yang tersedia: nama peserta, waktu mulai, jumlah soal yang sudah dijawab, dan status koneksi.",
          "Gunakan kolom pencarian untuk menemukan peserta tertentu.",
          "Tip: Halaman ini otomatis refresh setiap beberapa detik tanpa perlu reload manual.",
        ],
      },
      {
        id: "evaluasi-hasil",
        icon: PenLine,
        title: "6. Evaluasi Essay & Melihat Hasil",
        steps: [
          "Setelah ujian selesai, buka menu Evaluasi Essay di sidebar.",
          "Halaman ini menampilkan daftar ujian yang memiliki soal essay yang belum dinilai.",
          "Klik pada ujian, lalu klik pada peserta untuk membaca jawaban essay mereka.",
          "Berikan skor untuk setiap jawaban essay dan klik Simpan.",
          "Setelah semua essay dinilai, buka menu Analitik & Laporan untuk melihat rekap nilai keseluruhan.",
        ],
      },
    ],
  },
  {
    id: "fitur-pendukung",
    title: "Fitur Pendukung",
    description: "Fitur tambahan untuk mempercepat persiapan dan administrasi ujian.",
    items: [
      {
        id: "import-soal",
        icon: Upload,
        title: "Import Soal dari Excel / Word",
        steps: [
          "Buka Bank Soal → pilih modul → klik tombol Import.",
          "Pilih format file: Excel (.xlsx) atau Word (.docx).",
          "Untuk Excel: ikuti template kolom yang disediakan (nomor, pertanyaan, opsi A-E, kunci, bobot).",
          "Untuk Word: tulis soal dengan format penomoran standar. Sistem akan mendeteksi struktur soal secara otomatis.",
          "Review hasil parsing sebelum mengkonfirmasi import.",
        ],
      },
      {
        id: "manajemen-peserta",
        icon: Users,
        title: "Manajemen Peserta & Grup",
        steps: [
          "Buka menu Akun Peserta di sidebar untuk mengelola data mahasiswa.",
          "Tambah peserta secara manual atau import dari Excel.",
          "Gunakan fitur Grup untuk mengelompokkan peserta berdasarkan kelas, angkatan, atau mata kuliah.",
          "Grup memudahkan penugasan ujian — Anda bisa meng-assign satu grup ke sebuah ujian sekaligus.",
        ],
      },
      {
        id: "cetak-kartu",
        icon: CreditCard,
        title: "Cetak Kartu Peserta",
        steps: [
          "Buka menu Akun Peserta → Cetak Kartu Peserta.",
          "Pilih peserta yang ingin dicetak kartunya (bisa pilih semua atau sebagian).",
          "Kartu berisi: nama, NIM/username, dan password default.",
          "Cetak dan distribusikan kartu ke peserta sebagai kredensial login mereka.",
        ],
      },
      {
        id: "backup-restore",
        icon: Download,
        title: "Backup & Restore Data",
        steps: [
          "Buka menu Backup & Tools di sidebar.",
          "Klik \"Unduh Backup\" untuk mengekspor seluruh database ke file JSON.",
          "Simpan file backup di tempat yang aman (flashdisk, cloud storage).",
          "Untuk memulihkan data: klik \"Pilih Berkas JSON\" → pilih file backup → review data → klik Terapkan Restore.",
          "PERINGATAN: Restore akan menimpa seluruh data yang ada saat ini.",
        ],
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ & Troubleshooting",
    description: "Pertanyaan yang sering diajukan dan solusi masalah umum.",
    items: [
      {
        id: "faq-login",
        icon: HelpCircle,
        title: "Peserta tidak bisa login",
        steps: [
          "Pastikan username dan password yang dimasukkan sudah benar (perhatikan huruf besar/kecil).",
          "Cek apakah akun peserta sudah terdaftar di menu Akun Peserta.",
          "Jika peserta lupa password, admin bisa mereset password dari halaman data peserta.",
          "Pastikan peserta menggunakan browser yang didukung (Chrome, Firefox, Edge versi terbaru).",
        ],
      },
      {
        id: "faq-token",
        icon: HelpCircle,
        title: "Token tidak berfungsi",
        steps: [
          "Pastikan token yang dimasukkan peserta persis sama (case-sensitive).",
          "Cek apakah ujian sudah memasuki waktu pelaksanaan (di antara beginAt dan endAt).",
          "Pastikan token sudah diaktifkan di halaman Editor Ujian → tab Token.",
          "Jika masih bermasalah, coba generate token baru.",
        ],
      },
      {
        id: "faq-soal",
        icon: HelpCircle,
        title: "Soal tidak muncul di ujian",
        steps: [
          "Pastikan soal sudah ditambahkan ke dalam paket ujian (bukan hanya di bank soal).",
          "Cek apakah peserta sudah di-assign ke ujian tersebut.",
          "Pastikan ujian sudah dijadwalkan dan saat ini berada dalam rentang waktu pelaksanaan.",
          "Coba refresh halaman ujian atau logout lalu login kembali.",
        ],
      },
      {
        id: "faq-reset-password",
        icon: HelpCircle,
        title: "Bagaimana reset password peserta?",
        steps: [
          "Buka menu Akun Peserta.",
          "Cari peserta yang ingin di-reset passwordnya.",
          "Klik edit pada peserta tersebut.",
          "Ubah field password dan simpan.",
          "Informasikan password baru kepada peserta secara langsung.",
        ],
      },
    ],
  },
];

function PanduanPage() {
  const cfg = configRepo.get();
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const allIds = sections.flatMap((s) => s.items.map((i) => i.id));
    setOpenItems(new Set(allIds));
  }

  function collapseAll() {
    setOpenItems(new Set());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            Panduan Penggunaan
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Referensi lengkap cara menggunakan {cfg.appName} — dari persiapan soal hingga evaluasi hasil ujian.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={expandAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Buka Semua
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            onClick={collapseAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Tutup Semua
          </button>
        </div>
      </div>

      {/* Table of Contents */}
      <nav className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Daftar Isi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sections.map((section) => (
            <div key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-sm font-semibold text-slate-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {section.title}
              </a>
              <ul className="mt-1.5 space-y-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-zinc-300 transition-colors leading-relaxed"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Sections */}
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {section.title}
            </h2>
            <p className="text-sm text-slate-500">{section.description}</p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {section.items.map((item) => {
              const isOpen = openItems.has(item.id);
              const Icon = item.icon;
              return (
                <div key={item.id} id={item.id}>
                  <button
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pl-[52px]">
                      <ol className="space-y-2.5">
                        {item.steps.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Footer */}
      <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <p>Butuh bantuan lebih lanjut? Hubungi administrator sistem Anda.</p>
        <p>{cfg.appName} — v1.2.0</p>
      </div>
    </div>
  );
}
