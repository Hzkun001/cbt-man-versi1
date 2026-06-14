import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/cbt/hash";
import type {
  AppConfig,
  Group,
  Modul,
  NavKey,
  Soal,
  SesiUjian,
  TokenUjian,
  Topik,
  Ujian,
  User,
} from "@/lib/cbt/types";
import { prisma } from "@/lib/server/db/prisma";
import { parseJson, stringifyJson, toBigInt, toNumber } from "@/lib/server/db/json";
import { uid } from "@/lib/server/db/id";
import { createSeedDataset, seedDatabase } from "@/lib/server/db/seed-shared.mjs";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteSessionsForUser,
  readSessionToken,
  setSessionCookie,
  validateSession,
} from "@/lib/server/db/session";

export type Snapshot = {
  users: User[];
  groups: Group[];
  modul: Modul[];
  topik: Topik[];
  soal: Soal[];
  ujian: Ujian[];
  token: TokenUjian[];
  sesi: SesiUjian[];
  config: AppConfig;
};

export type PublicBootConfig = Pick<AppConfig, "appName" | "appDeskripsi" | "pesanLogin">;

type UserRow = Awaited<ReturnType<typeof prisma.user.findMany>>[number];
type SoalRow = Awaited<ReturnType<typeof prisma.soal.findMany>>[number] & {
  jawaban: { id: string; detail: string; benar: boolean }[];
};
type SnapshotRows = {
  users: UserRow[];
  groups: Group[];
  modul: Modul[];
  topik: Topik[];
  soal: SoalRow[];
  ujian: Awaited<ReturnType<typeof prisma.ujian.findMany>>;
  token: Awaited<ReturnType<typeof prisma.tokenUjian.findMany>>;
  sesi: Awaited<ReturnType<typeof prisma.sesiUjian.findMany>>;
  config: Awaited<ReturnType<typeof prisma.appConfig.findUnique>>;
};

const roleSchema = z.enum(["admin", "operator", "peserta"]);
const entitySchema = z.enum(["users", "groups", "modul", "topik", "soal", "ujian", "token", "sesi"]);
const upsertUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(3),
  namaLengkap: z.string().min(1),
  role: roleSchema,
  allowedTopikIds: z.array(z.string()).default([]),
  groupId: z.string().min(1).optional(),
  detail: z.string().optional(),
  aktif: z.boolean(),
  createdAt: z.number().optional(),
  newPassword: z.string().min(1).optional(),
});

const DEFAULT_OPERATOR_ROLE_ACCESS = [
  "dashboard",
  "peserta",
  "modul",
  "files",
  "ujian",
  "hasil",
  "evaluasi",
  "laporan",
  "leaderboard",
] as const;

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    namaLengkap: row.namaLengkap,
    role: row.role,
    allowedTopikIds: parseJson(row.allowedTopikIds, []),
    groupId: row.groupId ?? undefined,
    detail: row.detail ?? undefined,
    aktif: row.aktif,
    createdAt: Number(row.createdAt),
  };
}

function publicUser(row: UserRow): User {
  return { ...mapUser(row), passwordHash: "" };
}

function mapSoal(row: SoalRow): Soal {
  return {
    id: row.id,
    topikId: row.topikId,
    detail: row.detail,
    tipe: row.tipe,
    kesulitan: row.kesulitan,
    audioFileId: row.audioFileId ?? undefined,
    audioPlayOnce: row.audioPlayOnce,
    jawaban: row.jawaban.map((item) => ({ id: item.id, detail: item.detail, benar: item.benar })),
    pembahasan: row.pembahasan,
    createdAt: Number(row.createdAt),
  };
}

function mapUjian(row: Awaited<ReturnType<typeof prisma.ujian.findMany>>[number]): Ujian {
  return {
    id: row.id,
    nama: row.nama,
    deskripsi: row.deskripsi,
    durasiMenit: row.durasiMenit,
    poinBenar: row.poinBenar,
    poinSalah: row.poinSalah,
    poinKosong: row.poinKosong,
    beginAt: toNumber(row.beginAt),
    endAt: toNumber(row.endAt),
    tokenAktif: row.tokenAktif,
    ipRange: row.ipRange,
    groupIds: parseJson(row.groupIds, []),
    topicSets: parseJson(row.topicSets, []),
    showResult: row.showResult,
    showResultDetail: row.showResultDetail,
    fullscreenWajib: row.fullscreenWajib,
    maxPindahTab: row.maxPindahTab,
    blokirShortcut: row.blokirShortcut,
    createdBy: row.createdBy,
    createdAt: Number(row.createdAt),
  };
}

function mapToken(row: Awaited<ReturnType<typeof prisma.tokenUjian.findMany>>[number]): TokenUjian {
  return {
    id: row.id,
    ujianId: row.ujianId,
    kode: row.kode,
    dipakaiOleh: row.dipakaiOleh ?? undefined,
    dipakaiAt: toNumber(row.dipakaiAt),
  };
}

function mapSesi(row: Awaited<ReturnType<typeof prisma.sesiUjian.findMany>>[number]): SesiUjian {
  return {
    id: row.id,
    ujianId: row.ujianId,
    pesertaId: row.pesertaId,
    status: row.status,
    mulaiAt: toNumber(row.mulaiAt),
    selesaiAt: toNumber(row.selesaiAt),
    endsAt: toNumber(row.endsAt),
    soalIds: parseJson(row.soalIds, []),
    jawabanOrder: parseJson(row.jawabanOrder, {}),
    jawaban: parseJson(row.jawaban, []),
    pelanggaran: row.pelanggaran,
    skorTotal: row.skorTotal ?? undefined,
    maxSkor: row.maxSkor ?? undefined,
    gradedAt: toNumber(row.gradedAt),
    gradedBy: row.gradedBy ?? undefined,
    createdAt: Number(row.createdAt),
  };
}

function buildConfig(config: SnapshotRows["config"]): AppConfig {
  return {
    appName: config?.appName ?? "CBT-MAN",
    appDeskripsi: config?.appDeskripsi ?? "Aplikasi ujian berbasis komputer",
    pesanLogin: config?.pesanLogin ?? "Selamat datang di aplikasi ujian online",
    mobileLock: config?.mobileLock ?? false,
    multiDevice: config?.multiDevice ?? false,
    roleAccess: parseJson(config?.roleAccess, {
      operator: [...DEFAULT_OPERATOR_ROLE_ACCESS],
    }),
  };
}

function buildPublicBootConfig(config: SnapshotRows["config"]): PublicBootConfig {
  const full = buildConfig(config);
  return {
    appName: full.appName,
    appDeskripsi: full.appDeskripsi,
    pesanLogin: full.pesanLogin,
  };
}

async function loadSnapshotRows(): Promise<SnapshotRows> {
  const [users, groups, modul, topik, soal, ujian, token, sesi, config] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.group.findMany({ orderBy: { nama: "asc" } }),
    prisma.modul.findMany({ orderBy: { nama: "asc" } }),
    prisma.topik.findMany({ orderBy: { nama: "asc" } }),
    prisma.soal.findMany({ include: { jawaban: true }, orderBy: { createdAt: "asc" } }),
    prisma.ujian.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.tokenUjian.findMany({ orderBy: { kode: "asc" } }),
    prisma.sesiUjian.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appConfig.findUnique({ where: { id: "app" } }),
  ]);

  return { users, groups, modul, topik, soal, ujian, token, sesi, config };
}

function adminSnapshot(rows: SnapshotRows): Snapshot {
  return {
    users: rows.users.map(publicUser),
    groups: rows.groups,
    modul: rows.modul,
    topik: rows.topik,
    soal: rows.soal.map(mapSoal),
    ujian: rows.ujian.map(mapUjian),
    token: rows.token.map(mapToken),
    sesi: rows.sesi.map(mapSesi),
    config: buildConfig(rows.config),
  };
}

function operatorSnapshot(rows: SnapshotRows, caller: UserRow): Snapshot {
  const unrestricted = (caller.allowedTopikIds?.length ?? 0) === 0;
  const allowedTopikIds = unrestricted ? null : new Set(parseJson<string[]>(caller.allowedTopikIds, []));
  const topik = allowedTopikIds ? rows.topik.filter((item) => allowedTopikIds.has(item.id)) : rows.topik;
  const topikIds = new Set(topik.map((item) => item.id));
  const modulIds = new Set(topik.map((item) => item.modulId));
  const modul = unrestricted ? rows.modul : rows.modul.filter((item) => modulIds.has(item.id));
  const soal = unrestricted ? rows.soal : rows.soal.filter((item) => topikIds.has(item.topikId));
  const ujian = unrestricted
    ? rows.ujian
    : rows.ujian.filter((item) => parseJson<{ topikId: string }[]>(item.topicSets, []).some((set) => topikIds.has(set.topikId)));
  const ujianIds = new Set(ujian.map((item) => item.id));
  const sesi = rows.sesi.filter((item) => ujianIds.has(item.ujianId));
  const token = rows.token.filter((item) => ujianIds.has(item.ujianId));
  const visibleGroupIds = new Set(ujian.flatMap((item) => parseJson<string[]>(item.groupIds, [])));
  const visiblePesertaIds = new Set(sesi.map((item) => item.pesertaId));
  const includeAllPeserta = ujian.some((item) => parseJson<string[]>(item.groupIds, []).length === 0);
  const users = rows.users.filter((item) => {
    if (item.id === caller.id) return true;
    if (item.role !== "peserta") return false;
    if (includeAllPeserta) return true;
    if (visiblePesertaIds.has(item.id)) return true;
    return item.groupId ? visibleGroupIds.has(item.groupId) : false;
  });

  return {
    users: users.map(publicUser),
    groups: rows.groups,
    modul,
    topik,
    soal: soal.map(mapSoal),
    ujian: ujian.map(mapUjian),
    token: token.map(mapToken),
    sesi: sesi.map(mapSesi),
    config: buildConfig(rows.config),
  };
}

function pesertaSnapshot(rows: SnapshotRows, caller: UserRow): Snapshot {
  const ujian = rows.ujian.filter((item) => {
    const groupIds = parseJson<string[]>(item.groupIds, []);
    return groupIds.length === 0 || (!!caller.groupId && groupIds.includes(caller.groupId));
  });
  const ujianIds = new Set(ujian.map((item) => item.id));
  const sesi = rows.sesi.filter((item) => item.pesertaId === caller.id && ujianIds.has(item.ujianId));
  const soalIds = new Set(sesi.flatMap((item) => parseJson<string[]>(item.soalIds, [])));
  const soal = rows.soal.filter((item) => soalIds.has(item.id));
  const token = rows.token.filter((item) => ujianIds.has(item.ujianId));

  return {
    users: [publicUser(caller)],
    groups: [],
    modul: [],
    topik: [],
    soal: soal.map(mapSoal),
    ujian: ujian.map(mapUjian),
    token: token.map(mapToken),
    sesi: sesi.map(mapSesi),
    config: buildConfig(rows.config),
  };
}

async function buildSnapshotForUser(caller: UserRow): Promise<Snapshot> {
  const rows = await loadSnapshotRows();
  if (caller.role === "admin") return adminSnapshot(rows);
  if (caller.role === "operator") return operatorSnapshot(rows, caller);
  return pesertaSnapshot(rows, caller);
}

type MutationAction = "upsert" | "remove" | "bulkSet";

type MutationAuthResult = { ok: true } | { ok: false; error: string };

const OPERATOR_SESSION_KEYS: NavKey[] = ["ujian", "hasil", "evaluasi", "laporan", "leaderboard"];

function allowedTopikIdsForCaller(caller: UserRow): Set<string> | null {
  if (caller.role === "admin") return null;
  if (caller.role !== "operator") return new Set();
  const ids = parseJson<string[]>(caller.allowedTopikIds, []);
  if (ids.length === 0) return null;
  return new Set(ids);
}

async function operatorAccessKeys(): Promise<Set<NavKey>> {
  const config = await prisma.appConfig.findUnique({ where: { id: "app" } });
  const roleAccess = buildConfig(config).roleAccess;
  return new Set((roleAccess.operator ?? []) as NavKey[]);
}

async function operatorHasNav(caller: UserRow, key: NavKey): Promise<boolean> {
  if (caller.role !== "operator") return false;
  const keys = await operatorAccessKeys();
  return keys.has(key);
}

async function operatorHasAnyNav(caller: UserRow, keys: NavKey[]): Promise<boolean> {
  if (caller.role !== "operator") return false;
  const allowed = await operatorAccessKeys();
  return keys.some((key) => allowed.has(key));
}

function operatorCanTouchTopikId(caller: UserRow, topikId: string): boolean {
  const allowed = allowedTopikIdsForCaller(caller);
  if (!allowed) return true;
  return allowed.has(topikId);
}

function operatorCanTouchTopicSets(caller: UserRow, topicSets: Ujian["topicSets"]): boolean {
  return topicSets.every((item) => operatorCanTouchTopikId(caller, item.topikId));
}

async function operatorCanTouchModul(caller: UserRow, modulId: string): Promise<boolean> {
  const allowed = allowedTopikIdsForCaller(caller);
  if (!allowed) return true;
  const count = await prisma.topik.count({ where: { modulId, id: { in: [...allowed] } } });
  return count > 0;
}

async function operatorCanTouchSoal(caller: UserRow, soalId: string): Promise<boolean> {
  const soal = await prisma.soal.findUnique({ where: { id: soalId }, select: { topikId: true } });
  return !!soal && operatorCanTouchTopikId(caller, soal.topikId);
}

async function operatorCanTouchUjian(caller: UserRow, ujianId: string): Promise<boolean> {
  const ujian = await prisma.ujian.findUnique({ where: { id: ujianId }, select: { topicSets: true } });
  if (!ujian) return false;
  const topicSets = parseJson<Ujian["topicSets"]>(ujian.topicSets, []);
  return operatorCanTouchTopicSets(caller, topicSets);
}

async function pesertaCanTouchUjian(caller: UserRow, ujianId: string): Promise<boolean> {
  if (caller.role !== "peserta") return false;
  const ujian = await prisma.ujian.findUnique({ where: { id: ujianId }, select: { groupIds: true } });
  if (!ujian) return false;
  const groupIds = parseJson<string[]>(ujian.groupIds, []);
  return groupIds.length === 0 || (!!caller.groupId && groupIds.includes(caller.groupId));
}

async function requireCaller(): Promise<UserRow | null> {
  await seedIfNeeded();
  return validateSession(readSessionToken());
}

async function requireAdminResult(): Promise<MutationAuthResult> {
  const caller = await requireCaller();
  if (!caller || caller.role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

async function authorizeMutation(caller: UserRow | null, entity: z.infer<typeof entitySchema>, action: MutationAction, payload: unknown): Promise<MutationAuthResult> {
  if (!caller) return { ok: false, error: "Forbidden" };
  if (caller.role === "admin") return { ok: true };

  if (entity === "users" || entity === "groups") return { ok: false, error: "Forbidden" };
  if (action === "bulkSet") return { ok: false, error: "Forbidden" };

  if (caller.role === "operator") {
    if (entity === "modul") {
      if (!(await operatorHasNav(caller, "modul"))) return { ok: false, error: "Forbidden" };
      if (action === "remove") {
        const id = String((payload as { id?: string }).id ?? "");
        return (await operatorCanTouchModul(caller, id)) ? { ok: true } : { ok: false, error: "Forbidden" };
      }
      return allowedTopikIdsForCaller(caller) === null ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    if (entity === "topik") {
      if (!(await operatorHasNav(caller, "modul"))) return { ok: false, error: "Forbidden" };
      return allowedTopikIdsForCaller(caller) === null ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    if (entity === "soal") {
      if (!(await operatorHasNav(caller, "modul"))) return { ok: false, error: "Forbidden" };
      if (action === "remove") {
        const id = String((payload as { id?: string }).id ?? "");
        return (await operatorCanTouchSoal(caller, id)) ? { ok: true } : { ok: false, error: "Forbidden" };
      }
      const item = payload as Soal;
      return operatorCanTouchTopikId(caller, item.topikId) ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    if (entity === "ujian") {
      if (!(await operatorHasNav(caller, "ujian"))) return { ok: false, error: "Forbidden" };
      if (action === "remove") {
        const id = String((payload as { id?: string }).id ?? "");
        return (await operatorCanTouchUjian(caller, id)) ? { ok: true } : { ok: false, error: "Forbidden" };
      }
      const item = payload as Ujian;
      return operatorCanTouchTopicSets(caller, item.topicSets) ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    if (entity === "token") {
      if (!(await operatorHasNav(caller, "ujian"))) return { ok: false, error: "Forbidden" };
      const id = action === "remove" ? undefined : (payload as TokenUjian).ujianId;
      if (id) return (await operatorCanTouchUjian(caller, id)) ? { ok: true } : { ok: false, error: "Forbidden" };
      const existing = await prisma.tokenUjian.findUnique({ where: { id: String((payload as { id?: string }).id ?? "") }, select: { ujianId: true } });
      return existing && (await operatorCanTouchUjian(caller, existing.ujianId)) ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    if (entity === "sesi") {
      if (!(await operatorHasAnyNav(caller, OPERATOR_SESSION_KEYS))) return { ok: false, error: "Forbidden" };
      const ujianId = action === "remove"
        ? (await prisma.sesiUjian.findUnique({ where: { id: String((payload as { id?: string }).id ?? "") }, select: { ujianId: true } }))?.ujianId
        : (payload as SesiUjian).ujianId;
      return ujianId && (await operatorCanTouchUjian(caller, ujianId)) ? { ok: true } : { ok: false, error: "Forbidden" };
    }

    return { ok: false, error: "Forbidden" };
  }

  if (caller.role === "peserta") {
    if (entity === "token" && action === "upsert") {
      const item = payload as TokenUjian;
      if (item.dipakaiOleh !== caller.id) return { ok: false, error: "Forbidden" };
      if (!(await pesertaCanTouchUjian(caller, item.ujianId))) return { ok: false, error: "Forbidden" };
      const existing = await prisma.tokenUjian.findUnique({ where: { id: item.id } });
      if (!existing) return { ok: false, error: "Forbidden" };
      if (existing.ujianId !== item.ujianId || existing.kode !== item.kode) return { ok: false, error: "Forbidden" };
      if (existing.dipakaiOleh && existing.dipakaiOleh !== caller.id) return { ok: false, error: "Forbidden" };
      return { ok: true };
    }

    if (entity === "sesi" && action === "upsert") {
      const item = payload as SesiUjian;
      if (item.pesertaId !== caller.id) return { ok: false, error: "Forbidden" };
      if (!(await pesertaCanTouchUjian(caller, item.ujianId))) return { ok: false, error: "Forbidden" };
      const existing = await prisma.sesiUjian.findUnique({ where: { id: item.id }, select: { pesertaId: true, ujianId: true } });
      if (existing && (existing.pesertaId !== caller.id || existing.ujianId !== item.ujianId)) {
        return { ok: false, error: "Forbidden" };
      }
      return { ok: true };
    }
  }

  return { ok: false, error: "Forbidden" };
}

let seedPromise: Promise<void> | null = null;

function seedIfNeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const count = await prisma.user.count();
      if (count > 0) return;

      const dataset = await createSeedDataset({
        uid,
        now: Date.now(),
        hashPassword,
      });

      await seedDatabase({
        prisma,
        dataset,
        stringifyJson,
      });
    })().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

export const getCbtSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  await seedIfNeeded();
  const caller = await validateSession(readSessionToken());
  if (!caller) throw new Error("Unauthorized");
  return buildSnapshotForUser(caller);
});

export const getPublicBootConfigServer = createServerFn({ method: "GET" }).handler(async () => {
  await seedIfNeeded();
  const config = await prisma.appConfig.findUnique({ where: { id: "app" } });
  return buildPublicBootConfig(config);
});

export const ensureSeedServer = createServerFn({ method: "POST" }).handler(async () => {
  await seedIfNeeded();
  return { ok: true as const };
});

export const loginServer = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    await seedIfNeeded();
    const user = await prisma.user.findUnique({ where: { username: data.username } });
    if (!user) return { ok: false as const, error: "Username tidak ditemukan" };
    if (!user.aktif) return { ok: false as const, error: "Akun dinonaktifkan" };
    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) return { ok: false as const, error: "Password salah" };
    const token = await createSession(user.id);
    setSessionCookie(token);
    return { ok: true as const, user: publicUser(user) };
  });

export const validateSessionServer = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await seedIfNeeded();
    const userRow = await validateSession(readSessionToken());
    return { user: userRow ? publicUser(userRow) : null };
  } catch {
    return { user: null };
  }
});

export const logoutServer = createServerFn({ method: "POST" }).handler(async () => {
  await seedIfNeeded();
  await deleteSession(readSessionToken());
  clearSessionCookie();
  return { ok: true as const };
});

export const revokeUserSessionsServer = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const caller = await requireCaller();
    if (!caller || caller.role !== "admin") {
      return { ok: false as const, error: "Forbidden", deleted: 0 };
    }
    const deleted = await deleteSessionsForUser(data.userId);
    return { ok: true as const, deleted };
  });

export const upsertUserServer = createServerFn({ method: "POST" })
  .validator(upsertUserSchema)
  .handler(async ({ data }) => {
    try {
      await seedIfNeeded();
      const caller = await validateSession(readSessionToken());
      if (!caller || caller.role !== "admin") {
        return { ok: false as const, error: "Forbidden" };
      }

      const existing = await prisma.user.findUnique({ where: { id: data.id } });
      if (!existing && !data.newPassword) {
        return { ok: false as const, error: "Password wajib diisi untuk akun baru" };
      }

      const passwordHash = data.newPassword
        ? await hashPassword(data.newPassword)
        : existing?.passwordHash ?? "";

      const saved = await prisma.user.upsert({
        where: { id: data.id },
        update: {
          username: data.username,
          passwordHash,
          namaLengkap: data.namaLengkap,
          role: data.role,
          allowedTopikIds: stringifyJson(data.allowedTopikIds),
          groupId: data.groupId ?? null,
          detail: data.detail ?? null,
          aktif: data.aktif,
        },
        create: {
          id: data.id,
          username: data.username,
          passwordHash,
          namaLengkap: data.namaLengkap,
          role: data.role,
          allowedTopikIds: stringifyJson(data.allowedTopikIds),
          groupId: data.groupId ?? null,
          detail: data.detail ?? null,
          aktif: data.aktif,
          createdAt: BigInt(data.createdAt ?? Date.now()),
        },
      });

      if (existing?.aktif === true && data.aktif === false) {
        await deleteSessionsForUser(data.id);
      }

      return { ok: true as const, user: publicUser(saved) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const mutateEntity = createServerFn({ method: "POST" })
  .validator(
    z.object({
      entity: entitySchema,
      action: z.enum(["upsert", "remove", "bulkSet"]),
      payload: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await seedIfNeeded();
      const caller = await requireCaller();
      const { entity, action, payload } = data;
      const auth = await authorizeMutation(caller, entity, action, payload);
      if (!auth.ok) return { ok: false as const, error: auth.error };
      if (entity === "users") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.user.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.user.deleteMany();
            for (const item of payload as User[]) {
              await tx.user.create({
                data: {
                  ...item,
                  allowedTopikIds: stringifyJson(item.allowedTopikIds),
                  groupId: item.groupId ?? null,
                  detail: item.detail ?? null,
                  createdAt: BigInt(item.createdAt),
                },
              });
            }
          } else {
            const item = payload as User;
            const prev = await tx.user.findUnique({
              where: { id: item.id },
              select: { aktif: true, passwordHash: true },
            });
            if (!prev && !item.passwordHash) {
              throw new Error("Password wajib diisi untuk akun baru");
            }
            const nextPasswordHash = item.passwordHash || prev?.passwordHash || "";
            await tx.user.upsert({
              where: { id: item.id },
              update: {
                username: item.username,
                passwordHash: nextPasswordHash,
                namaLengkap: item.namaLengkap,
                role: item.role,
                allowedTopikIds: stringifyJson(item.allowedTopikIds),
                groupId: item.groupId ?? null,
                detail: item.detail ?? null,
                aktif: item.aktif,
                createdAt: BigInt(item.createdAt),
              },
              create: {
                id: item.id,
                username: item.username,
                passwordHash: nextPasswordHash,
                namaLengkap: item.namaLengkap,
                role: item.role,
                allowedTopikIds: stringifyJson(item.allowedTopikIds),
                groupId: item.groupId ?? null,
                detail: item.detail ?? null,
                aktif: item.aktif,
                createdAt: BigInt(item.createdAt),
              },
            });
            if (prev?.aktif === true && item.aktif === false) {
              await tx.session.deleteMany({ where: { userId: item.id } });
            }
          }
        });
      }
      if (entity === "groups") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.group.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.group.deleteMany();
            await tx.group.createMany({ data: payload as Group[] });
          } else
            await tx.group.upsert({ where: { id: payload.id }, update: payload, create: payload });
        });
      }
      if (entity === "modul") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.modul.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.modul.deleteMany();
            await tx.modul.createMany({ data: payload as Modul[] });
          } else
            await tx.modul.upsert({ where: { id: payload.id }, update: payload, create: payload });
        });
      }
      if (entity === "topik") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.topik.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.topik.deleteMany();
            await tx.topik.createMany({ data: payload as Topik[] });
          } else
            await tx.topik.upsert({ where: { id: payload.id }, update: payload, create: payload });
        });
      }
      if (entity === "soal") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.soal.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.jawaban.deleteMany();
            await tx.soal.deleteMany();
            for (const item of payload as Soal[]) {
              await tx.soal.create({
                data: {
                  id: item.id,
                  topikId: item.topikId,
                  detail: item.detail,
                  tipe: item.tipe,
                  kesulitan: item.kesulitan,
                  audioFileId: item.audioFileId ?? null,
                  audioPlayOnce: item.audioPlayOnce,
                  pembahasan: item.pembahasan,
                  createdAt: BigInt(item.createdAt),
                  jawaban: { create: item.jawaban },
                },
              });
            }
          } else {
            const item = payload as Soal;
            await tx.soal.upsert({
              where: { id: item.id },
              update: {
                topikId: item.topikId,
                detail: item.detail,
                tipe: item.tipe,
                kesulitan: item.kesulitan,
                audioFileId: item.audioFileId ?? null,
                audioPlayOnce: item.audioPlayOnce,
                pembahasan: item.pembahasan,
                createdAt: BigInt(item.createdAt),
              },
              create: {
                id: item.id,
                topikId: item.topikId,
                detail: item.detail,
                tipe: item.tipe,
                kesulitan: item.kesulitan,
                audioFileId: item.audioFileId ?? null,
                audioPlayOnce: item.audioPlayOnce,
                pembahasan: item.pembahasan,
                createdAt: BigInt(item.createdAt),
              },
            });
            await tx.jawaban.deleteMany({ where: { soalId: item.id } });
            await tx.jawaban.createMany({
              data: item.jawaban.map((jawaban) => ({ ...jawaban, soalId: item.id })),
            });
          }
        });
      }
      if (entity === "ujian") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.ujian.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.ujian.deleteMany();
            for (const item of payload as Ujian[]) {
              await tx.ujian.create({
                data: {
                  ...item,
                  beginAt: toBigInt(item.beginAt),
                  endAt: toBigInt(item.endAt),
                  groupIds: stringifyJson(item.groupIds),
                  topicSets: stringifyJson(item.topicSets),
                  createdAt: BigInt(item.createdAt),
                },
              });
            }
          } else {
            const item = payload as Ujian;
            await tx.ujian.upsert({
              where: { id: item.id },
              update: {
                ...item,
                beginAt: toBigInt(item.beginAt),
                endAt: toBigInt(item.endAt),
                groupIds: stringifyJson(item.groupIds),
                topicSets: stringifyJson(item.topicSets),
                createdAt: BigInt(item.createdAt),
              },
              create: {
                ...item,
                beginAt: toBigInt(item.beginAt),
                endAt: toBigInt(item.endAt),
                groupIds: stringifyJson(item.groupIds),
                topicSets: stringifyJson(item.topicSets),
                createdAt: BigInt(item.createdAt),
              },
            });
          }
        });
      }
      if (entity === "token") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove")
            await tx.tokenUjian.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.tokenUjian.deleteMany();
            await tx.tokenUjian.createMany({
              data: (payload as TokenUjian[]).map((item) => ({
                ...item,
                dipakaiOleh: item.dipakaiOleh ?? null,
                dipakaiAt: toBigInt(item.dipakaiAt),
              })),
            });
          } else {
            const item = payload as TokenUjian;
            await tx.tokenUjian.upsert({
              where: { id: item.id },
              update: {
                ujianId: item.ujianId,
                kode: item.kode,
                dipakaiOleh: item.dipakaiOleh ?? null,
                dipakaiAt: toBigInt(item.dipakaiAt),
              },
              create: {
                id: item.id,
                ujianId: item.ujianId,
                kode: item.kode,
                dipakaiOleh: item.dipakaiOleh ?? null,
                dipakaiAt: toBigInt(item.dipakaiAt),
              },
            });
          }
        });
      }
      if (entity === "sesi") {
        await prisma.$transaction(async (tx) => {
          if (action === "remove") await tx.sesiUjian.delete({ where: { id: String(payload.id) } });
          else if (action === "bulkSet") {
            await tx.sesiUjian.deleteMany();
            await tx.sesiUjian.createMany({
              data: (payload as SesiUjian[]).map((item) => ({
                ...item,
                mulaiAt: toBigInt(item.mulaiAt),
                selesaiAt: toBigInt(item.selesaiAt),
                endsAt: toBigInt(item.endsAt),
                soalIds: stringifyJson(item.soalIds),
                jawabanOrder: stringifyJson(item.jawabanOrder),
                jawaban: stringifyJson(item.jawaban),
                gradedAt: toBigInt(item.gradedAt),
                gradedBy: item.gradedBy ?? null,
                createdAt: BigInt(item.createdAt),
              })),
            });
          } else {
            const item = payload as SesiUjian;
            await tx.sesiUjian.upsert({
              where: { id: item.id },
              update: {
                ujianId: item.ujianId,
                pesertaId: item.pesertaId,
                status: item.status,
                mulaiAt: toBigInt(item.mulaiAt),
                selesaiAt: toBigInt(item.selesaiAt),
                endsAt: toBigInt(item.endsAt),
                soalIds: stringifyJson(item.soalIds),
                jawabanOrder: stringifyJson(item.jawabanOrder),
                jawaban: stringifyJson(item.jawaban),
                pelanggaran: item.pelanggaran,
                skorTotal: item.skorTotal ?? null,
                maxSkor: item.maxSkor ?? null,
                gradedAt: toBigInt(item.gradedAt),
                gradedBy: item.gradedBy ?? null,
                createdAt: BigInt(item.createdAt),
              },
              create: {
                id: item.id,
                ujianId: item.ujianId,
                pesertaId: item.pesertaId,
                status: item.status,
                mulaiAt: toBigInt(item.mulaiAt),
                selesaiAt: toBigInt(item.selesaiAt),
                endsAt: toBigInt(item.endsAt),
                soalIds: stringifyJson(item.soalIds),
                jawabanOrder: stringifyJson(item.jawabanOrder),
                jawaban: stringifyJson(item.jawaban),
                pelanggaran: item.pelanggaran,
                skorTotal: item.skorTotal ?? null,
                maxSkor: item.maxSkor ?? null,
                gradedAt: toBigInt(item.gradedAt),
                gradedBy: item.gradedBy ?? null,
                createdAt: BigInt(item.createdAt),
              },
            });
          }
        });
      }
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const saveConfigServer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      appName: z.string(),
      appDeskripsi: z.string(),
      pesanLogin: z.string(),
      mobileLock: z.boolean(),
      multiDevice: z.boolean(),
      roleAccess: z.record(z.string(), z.array(z.string())),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const auth = await requireAdminResult();
      if (!auth.ok) return { ok: false as const, error: auth.error };
      await prisma.appConfig.upsert({
        where: { id: "app" },
        update: { ...data, roleAccess: stringifyJson(data.roleAccess) },
        create: { id: "app", ...data, roleAccess: stringifyJson(data.roleAccess) },
      });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const importBackupServer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      users: z.array(z.any()),
      groups: z.array(z.any()),
      modul: z.array(z.any()),
      topik: z.array(z.any()),
      soal: z.array(z.any()),
      ujian: z.array(z.any()),
      token: z.array(z.any()),
      sesi: z.array(z.any()),
      config: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await requireAdminResult();
    if (!auth.ok) return { ok: false as const, error: auth.error };
    await prisma.$transaction(async (tx) => {
      await tx.jawaban.deleteMany();
      await tx.sesiUjian.deleteMany();
      await tx.tokenUjian.deleteMany();
      await tx.soal.deleteMany();
      await tx.ujian.deleteMany();
      await tx.topik.deleteMany();
      await tx.modul.deleteMany();
      await tx.user.deleteMany();
      await tx.group.deleteMany();
      await tx.appConfig.deleteMany();

      if (data.groups.length) await tx.group.createMany({ data: data.groups as Group[] });
      if (data.modul.length) await tx.modul.createMany({ data: data.modul as Modul[] });
      if (data.topik.length) await tx.topik.createMany({ data: data.topik as Topik[] });
      for (const item of data.users as User[]) {
        await tx.user.create({
          data: {
            ...item,
            allowedTopikIds: stringifyJson(item.allowedTopikIds),
            groupId: item.groupId ?? null,
            detail: item.detail ?? null,
            createdAt: BigInt(item.createdAt),
          },
        });
      }
      for (const item of data.soal as Soal[]) {
        await tx.soal.create({
          data: {
            id: item.id,
            topikId: item.topikId,
            detail: item.detail,
            tipe: item.tipe,
            kesulitan: item.kesulitan,
            audioFileId: item.audioFileId ?? null,
            audioPlayOnce: item.audioPlayOnce,
            pembahasan: item.pembahasan,
            createdAt: BigInt(item.createdAt),
            jawaban: { create: item.jawaban },
          },
        });
      }
      for (const item of data.ujian as Ujian[]) {
        await tx.ujian.create({
          data: {
            ...item,
            beginAt: toBigInt(item.beginAt),
            endAt: toBigInt(item.endAt),
            groupIds: stringifyJson(item.groupIds),
            topicSets: stringifyJson(item.topicSets),
            createdAt: BigInt(item.createdAt),
          },
        });
      }
      if (data.token.length) {
        await tx.tokenUjian.createMany({
          data: (data.token as TokenUjian[]).map((item) => ({
            ...item,
            dipakaiOleh: item.dipakaiOleh ?? null,
            dipakaiAt: toBigInt(item.dipakaiAt),
          })),
        });
      }
      if (data.sesi.length) {
        await tx.sesiUjian.createMany({
          data: (data.sesi as SesiUjian[]).map((item) => ({
            ...item,
            mulaiAt: toBigInt(item.mulaiAt),
            selesaiAt: toBigInt(item.selesaiAt),
            endsAt: toBigInt(item.endsAt),
            soalIds: stringifyJson(item.soalIds),
            jawabanOrder: stringifyJson(item.jawabanOrder),
            jawaban: stringifyJson(item.jawaban),
            gradedAt: toBigInt(item.gradedAt),
            gradedBy: item.gradedBy ?? null,
            createdAt: BigInt(item.createdAt),
          })),
        });
      }
      await tx.appConfig.create({
        data: {
          id: "app",
          ...data.config,
          roleAccess: stringifyJson((data.config as AppConfig).roleAccess),
        },
      });
    });

    return { ok: true as const };
  });

export const resetAllDataServer = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await requireAdminResult();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  await prisma.$transaction(async (tx) => {
    await tx.jawaban.deleteMany();
    await tx.sesiUjian.deleteMany();
    await tx.tokenUjian.deleteMany();
    await tx.soal.deleteMany();
    await tx.ujian.deleteMany();
    await tx.topik.deleteMany();
    await tx.modul.deleteMany();
    await tx.user.deleteMany();
    await tx.group.deleteMany();
    await tx.appConfig.deleteMany();
  });

  return { ok: true as const };
});
