# Analisis Codebase CBT-MAN

---

## 1. Struktur Project

```
cbt-man-versi1/
├── prisma/
│   ├── schema.prisma          # Schema database (SQLite + Prisma ORM)
│   ├── dev.db                 # SQLite dev database
│   ├── migrations/            # Migration history
│   └── seed.mjs               # Seed script (Web Crypto API + Prisma)
├── src/
│   ├── lib/
│   │   ├── server/            # Server-only code (TanStack Start server functions)
│   │   │   ├── db/            # Prisma client, ID generation, JSON helpers, session, seed
│   │   │   ├── repos/         # Server repository functions (functions.ts ~1400 lines)
│   │   │   └── files/         # File handling functions
│   │   ├── cbt/               # Client-side CBT domain logic
│   │   │   ├── auth-store.ts  # Zustand auth store (login/logout/refresh)
│   │   │   ├── repos.ts       # Client-side in-memory repo cache + optimistic mutations
│   │   │   ├── types.ts       # Zod schemas + TypeScript types (domain models)
│   │   │   ├── exam.ts        # Exam session logic (build/start/grade)
│   │   │   ├── access.ts      # Participant assignment guards
│   │   │   ├── availability.ts# Exam window availability checks
│   │   │   └── storage.ts     # ID generation helper
│   │   ├── api/               # API utilities
│   │   ├── utils.ts           # cn() classnames helper
│   │   ├── config.server.ts   # Server-only config
│   │   └── error-*.ts         # Error handling utilities
│   ├── routes/                # TanStack Router file-based routes
│   │   ├── __root.tsx         # Root layout + QueryClient + Toaster
│   │   ├── _authenticated.tsx # Auth guard (server session validation)
│   │   ├── login.tsx          # Login page (redirects if already authed)
│   │   ├── index.tsx          # Landing page
│   │   ├── api.files.$id.ts   # File download endpoint
│   │   ├── _authenticated/
│   │   │   ├── admin.tsx      # Admin layout + sidebar + RBAC nav
│   │   │   ├── admin.*        # Admin CRUD: users, modul, topik, soal, ujian, hasil, laporan
│   │   │   ├── peserta.tsx    # Peserta layout
│   │   │   └── peserta.ujian.* # Peserta: daftar ujian, kerjakan, hasil
│   ├── components/
│   │   ├── ui/                # shadcn/ui components (Radix + Tailwind)
│   │   └── cbt/               # CBT-specific components (RichEditor, AudioPlayer)
│   ├── hooks/
│   │   └── use-mobile.tsx     # Mobile breakpoint hook
│   ├── styles.css             # Tailwind v4 + CSS variables
│   ├── router.tsx             # Router factory + QueryClient
│   ├── server.ts              # TanStack Start server entry
│   └── start.ts               # Client entry point
├── public/                    # Static assets
├── tests/                     # Node test runner tests
├── scripts/                   # Build/CI scripts
├── .github/                   # GitHub Actions CI
├── package.json               # Dependencies + scripts
├── vite.config.ts             # Vite + TanStack Router plugin
├── tsconfig.json              # TypeScript config (strict)
├── eslint.config.js           # ESLint flat config
├── .prettierrc                # Prettier config
└── bunfig.toml                # Bun config
```

---

## 2. Teknologi yang Digunakan

| Kategori | Teknologi | Versi | Catatan |
|----------|-----------|-------|---------|
| **Runtime** | Bun / Node.js | Latest | `bunfig.toml` present |
| **Framework** | TanStack Start (React 19) | 1.167+ | SSR/SSG + file-based routing |
| **Router** | TanStack Router | 1.168+ | Type-safe, loader pattern |
| **State (Server)** | TanStack Query | 5.83+ | Server state caching |
| **State (Client)** | Zustand | 5.0+ | Auth store + UI state |
| **Database** | Prisma ORM + SQLite | 6.16+ | Schema-first, type-safe |
| **Auth** | Custom session (httpOnly cookie + Prisma Session table) | - | 256-bit opaque tokens, sliding expiry |
| **Validation** | Zod | 3.24+ | Schema-first types + server fn validators |
| **Styling** | Tailwind CSS v4 + shadcn/ui (Radix) | 4.2+ | CSS variables, class-variance-authority |
| **Forms** | React Hook Form + @hookform/resolvers | 7.71+ | Zod resolvers |
| **Rich Text** | Custom (isomorphic-dompurify + contenteditable) | - | `RichView`/`RichEditor` components |
| **Charts** | Recharts | 2.15+ | Laporan/analisis |
| **Testing** | Node `--test` runner | Native | `tests/unit/*.test.mjs` |
| **Lint/Format** | Biome (via config) + ESLint + Prettier | - | Mixed config |
| **Build** | Vite 7 + TS 5.8 | - | `vite-tsconfig-paths` |

---

## 3. Arsitektur Saat Ini

### 3.1 Pola Arsitektur: **TanStack Start + Domain-Driven Client Cache**

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ TanStack     │  │ Zustand      │  │ Client Repos         │  │
│  │ Router       │  │ Auth Store   │  │ (in-memory cache)    │  │
│  │ (SSR/CSR)    │  │ (user, role) │  │ optimistic mutations │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                     │               │
│         └────────┬────────┴─────────────────────┘               │
│                  ▼                                              │
│         ┌──────────────────┐                                    │
│         │ TanStack Query   │  (server state cache, invalidation)│
│         └────────┬─────────┘                                    │
└───────────────────┼──────────────────────────────────────────────┘
                    │ Server Functions (RPC over HTTP)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVER (TanStack Start)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ Server Functions│  │ Session Mgmt    │  │ Prisma ORM     │  │
│  │ (createServerFn)│  │ (httpOnly cookie│  │ (SQLite)       │  │
│  │ + Zod validators│  │  + DB Session)  │  │                │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                        └── authorizeMutation()                  │
│                        └── RBAC per role/entity/action          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Alur Autentikasi & Otorisasi

1. **Login** → `loginServer` verifies password (PBKDF2), creates `Session` row, sets httpOnly cookie
2. **Route Guard** (`_authenticated.tsx`) → `validateSessionServer()` reads cookie, validates DB row, sliding refresh
3. **Client Cache Hydration** → `getCbtSnapshot` returns **role-filtered** data (admin/operator/peserta)
4. **Mutation Authorization** → Every `mutateEntity` call passes through `authorizeMutation()` with:
   - Role-based access (admin = full, operator = scoped by `allowedTopikIds` + `roleAccess`, peserta = own sessions only)
   - Entity-level checks (topic ownership, exam topic sets, group assignment)
5. **RBAC Nav** → `configRepo.roleAccess.operator[]` controls sidebar visibility

### 3.3 Domain Models (Prisma Schema)

| Model | Keterangan |
|-------|------------|
| `User` | `role: admin/operator/peserta`, `allowedTopikIds` (operator scope), `groupId` (peserta class) |
| `Group` | Kelas/grup peserta |
| `Modul` → `Topik` → `Soal` → `Jawaban` | Hierarki bank soal |
| `Ujian` | Paket ujian: `topicSets[]` (topik + filter tipe/kesulitan + jumlah), `groupIds`, security settings |
| `TokenUjian` | Kode akses ujian (unique per ujian), atomic claim via `claimExamToken` |
| `SesiUjian` | Sesi peserta: `soalIds[]`, `jawaban[]`, `pelanggaran`, `skorTotal`, `status` |
| `Session` | Server-side login session (httpOnly cookie + DB row) |
| `AppConfig` | Global settings + RBAC matrix |

### 3.4 Client-Side Repository Pattern (`src/lib/cbt/repos.ts`)

- **In-memory cache** per entity (`users`, `modul`, `topik`, `soal`, `ujian`, `token`, `sesi`, `config`)
- **Optimistic updates**: `upsert`/`remove`/`bulkSet` → immediate UI update → enqueue server mutation
- **Sequential mutation queue** per entity (prevents race conditions)
- **Hydration**: `hydrateRepos()` calls `getCbtSnapshot` once per session/role

### 3.5 Exam Flow (Peserta)

```
1. /peserta → list ujian (filtered by groupId)
2. /peserta/ujian/$id → PreUjian (token input, availability check)
3. claimExamToken (atomic DB updateMany with WHERE dipakaiOleh=null OR caller)
4. findOrCreateSesi → buildSesi (select soal per topicSet, shuffle)
5. /peserta/ujian/$id/kerjakan → Timer, anti-cheat (visibilitychange, contextmenu, shortcuts)
6. Auto-save debounced (500ms) + beforeunload flush
7. Submit → gradeSesi (auto-grade PG/multi/BS, essay = manual) → status=selesai
8. /peserta/ujian/$id/hasil → View result
```

---

## 4. Masalah Potensial

### 4.1 Keamanan & Otorisasi

| # | Masalah | Lokasi | Severity |
|---|---------|--------|----------|
| 1 | **IP Range (`ipRange`) stored but NOT enforced** — schema has field, UI has no input, Issue #13 marks as "V1 hide-and-document" | `prisma/schema.prisma`, `types.ts` | 🟡 Medium (misleading security theater) |
| 2 | **mobileLock / multiDevice stored but NOT enforced** — UI shows disabled with "Belum diberlakukan" badge | `types.ts`, `ConfigSchema` | 🟡 Medium |
| 3 | **Operator `allowedTopikIds` empty = unrestricted** — implicit "all access" when array empty; should be explicit allow-list | `functions.ts:allowedTopikIdsForCaller()` | 🟡 Medium |
| 4 | **Token generation uses simple modulo bias** — `byte % 31` on 31-char charset has negligible but non-zero bias | `functions.ts:generateTokenCode()` | 🟢 Low |
| 5 | **No rate limiting on login / token claim / mutation endpoints** | `functions.ts` server fns | 🟡 Medium |

### 4.2 Integritas Data & Race Conditions

| # | Masalah | Lokasi | Severity |
|---|---------|--------|----------|
| 6 | **Exam session `buildSesi` uses `Math.random()` shuffle** — not cryptographically secure; deterministic seed not used | `exam.ts:shuffle()` | 🟡 Medium (exam fairness) |
| 7 | **Client-side anti-cheat only** (visibilitychange, contextmenu, keydown) — easily bypassed via DevTools | `peserta.ujian.$id.kerjakan.tsx` | 🟡 Medium |
| 8 | **Debounced session save (500ms) + beforeunload flush** — potential data loss if crash between flushes | `peserta.ujian.$id.kerjakan.tsx:persistSesi()` | 🟡 Medium |
| 9 | **No DB-level unique constraint on `SesiUjian(ujianId, pesertaId)` where status != selesai** — could create duplicate active sessions | `prisma/schema.prisma` | 🟡 Medium |

### 4.3 Arsitektur & Maintainability

| # | Masalah | Lokasi | Severity |
|---|---------|--------|----------|
| 10 | **`functions.ts` = 1400+ lines** — single file handling all mutations, auth, seeding, snapshots, RBAC | `src/lib/server/repos/functions.ts` | 🔴 High |
| 11 | **Client repo pattern duplicates server types** — `types.ts` (Zod) + manual mapping in `functions.ts` | `types.ts` ↔ `functions.ts` | 🟡 Medium |
| 12 | **Optimistic mutations lack rollback UI** — on server error, cache invalidated + rehydrate (full refetch), no per-field revert | `repos.ts:runEntityMutation()` | 🟡 Medium |
| 13 | **Seed logic split across `seed-shared.mjs` + `seed.mjs` + `functions.ts:createSeedDataset`** — three entry points | `prisma/seed.mjs`, `lib/server/db/seed-shared.mjs` | 🟢 Low |
| 14 | **No OpenAPI / tRPC contract** — server functions are ad-hoc RPC; no generated client types | — | 🟢 Low |

### 4.4 UX / Fitur

| # | Masalah | Lokasi | Severity |
|---|---------|--------|----------|
| 15 | **Essay grading UX** — `showResultDetail` toggle exists but no inline grader UI visible in routes | `admin.evaluasi.$id.tsx` (exists but need verify) | 🟡 Medium |
| 16 | **No offline/Service Worker support** — exam interrupted by network loss = data loss risk | — | 🟡 Medium |
| 17 | **Rich editor sanitization** — `isomorphic-dompurify` on client only; server doesn't re-sanitize on import | `lib/cbt/sanitize.ts` (client) | 🟢 Low |

### 4.5 Testing & Observability

| # | Masalah | Severity |
|---|---------|----------|
| 18 | **Only 1 unit test file** (`tests/unit/*.test.mjs`) — no integration/e2e tests | 🔴 High |
| 19 | **No structured logging / error tracking** (Sentry, etc.) — only `console.error` | 🟡 Medium |
| 20 | **No CI test step** in `.github/workflows` (only lint/build) | 🟡 Medium |

---

## 5. Rekomendasi Perbaikan

### 5.1 Prioritas Tinggi (Security & Correctness)

| # | Rekomendasi | Estimasi Effort |
|---|-------------|-----------------|
| 1 | **Enforce `ipRange` at middleware/edge** or remove field + UI to avoid false security. Add CIDR parsing + request IP extraction from headers (`x-forwarded-for`) check in `_authenticated.tsx` loader. | 1-2 days |
| 2 | **Enforce `mobileLock` / `multiDevice`** — implement device fingerprinting (UA + screen + IP hash) + session tracking in `Session` table. Gate in `validateSession`. | 3-5 days |
| 3 | **Add DB unique constraint** `SesiUjian @@unique([ujianId, pesertaId]) where status != 'selesai'` (partial index via raw SQL) or application-level lock in `findOrCreateSesi`. | 0.5 day |
| 4 | **Replace `Math.random()` shuffle** with `crypto.getRandomValues`-based Fisher-Yates for exam fairness. | 0.5 day |
| 5 | **Add rate limiting** on `loginServer`, `claimExamToken`, `mutateEntity` using in-memory token bucket (or Redis if scaled). | 1 day |

### 5.2 Prioritas Menengah (Architecture & Maintainability)

| # | Rekomendasi | Estimasi Effort |
|---|-------------|-----------------|
| 6 | **Split `functions.ts`** into per-entity modules: `auth.ts`, `users.ts`, `modul.ts`, `topik.ts`, `soal.ts`, `ujian.ts`, `token.ts`, `sesi.ts`, `config.ts`, `seed.ts`. Use a barrel export. | 2-3 days |
| 7 | **Generate client types from Zod schemas** — single source of truth. Remove manual `mapUser`/`mapSoal` etc. Use `z.infer` + transformers. | 1-2 days |
| 8 | **Add optimistic rollback UI** — on mutation error, show toast with "Undo" that reapplies local change. | 1 day |
| 9 | **Add integration tests** (Vitest + MSW or Playwright) for: login flow, exam start→submit→grade, operator RBAC boundaries. | 3-5 days |
| 10 | **Structured logging** — add `pino` or similar; log auth events, mutation audit trail, errors with correlation IDs. | 1 day |

### 5.3 Prioritas Rendah (Quality of Life)

| # | Rekomendasi | Estimasi Effort |
|---|-------------|-----------------|
| 11 | **Remove dead config fields** (`ipRange`, `mobileLock`, `multiDevice`) if not implementing in V1; or add "V2" badge in UI. | 0.5 day |
| 12 | **Service Worker + IndexedDB offline queue** for exam answers (background sync on reconnect). | 3-5 days |
| 13 | **Server-side HTML sanitization** on import (Word/Excel) using same `dompurify` config. | 0.5 day |
| 14 | **OpenAPI spec generation** from server functions (experimental) or migrate to tRPC for type-safe contracts. | 2-3 days |
| 15 | **Consolidate seed entry points** — single `seed.ts` used by both `prisma db seed` and `ensureSeedServer`. | 0.5 day |

---

## 6. Ringkasan Teknis

| Aspek | Rating | Catatan |
|-------|--------|---------|
| **Arsitektur** | ⭐⭐⭐⭐☆ | Clean separation client/server, good use of TanStack ecosystem |
| **Type Safety** | ⭐⭐⭐⭐⭐ | End-to-end Zod + TypeScript + TanStack Router |
| **Security Model** | ⭐⭐⭐☆☆ | Server-side session + RBAC, but missing enforcement on documented features |
| **Data Integrity** | ⭐⭐⭐☆☆ | Optimistic UI good, but missing DB constraints & crypto-random |
| **Maintainability** | ⭐⭐☆☆☆ | `functions.ts` monolith, duplicate type mappings |
| **Testing** | ⭐☆☆☆☆ | Near-zero coverage |
| **Observability** | ⭐☆☆☆☆ | Console-only logging |

---

## 7. Quick Wins (≤1 hari)

1. **Add crypto shuffle** to `exam.ts` — 5 lines
2. **Add partial unique index** on `SesiUjian(ujianId, pesertaId)` for active sessions — 1 Prisma migration
3. **Remove/hide `ipRange`, `mobileLock`, `multiDevice`** from UI & config schema if not implementing — reduce attack surface
4. **Add rate limiter middleware** wrapper for server functions
5. **Fix token generation bias** — rejection sampling or `crypto.getRandomValues` with larger buffer

---

*Generated: 2026-07-14 | Codebase: cbt-man-versi1*