import { getCbtSnapshot, mutateEntity, saveConfigServer } from "@/lib/server/repos/functions";
import { toast } from "sonner";
import type {
  AppConfig,
  Group,
  Modul,
  NavKey,
  SesiUjian,
  Soal,
  TokenUjian,
  Topik,
  Ujian,
  User,
} from "./types";

type Snapshot = Awaited<ReturnType<typeof getCbtSnapshot>>;

const DEFAULT_OPERATOR_NAV: NavKey[] = [
  "dashboard",
  "peserta",
  "modul",
  "files",
  "ujian",
  "hasil",
  "evaluasi",
  "laporan",
  "leaderboard",
];

const cache = {
  users: [] as User[],
  groups: [] as Group[],
  modul: [] as Modul[],
  topik: [] as Topik[],
  soal: [] as Soal[],
  ujian: [] as Ujian[],
  token: [] as TokenUjian[],
  sesi: [] as SesiUjian[],
  config: {
    appName: "CBT-MAN",
    appDeskripsi: "Aplikasi ujian berbasis komputer",
    pesanLogin: "Selamat datang di aplikasi ujian online",
    mobileLock: false,
    multiDevice: false,
    roleAccess: { operator: DEFAULT_OPERATOR_NAV },
  } as AppConfig,
};

let loadPromise: Promise<void> | null = null;

export function invalidateReposCache(): void {
  loadPromise = null;
}

function applySnapshot(snapshot: Snapshot) {
  cache.users = snapshot.users;
  cache.groups = snapshot.groups;
  cache.modul = snapshot.modul;
  cache.topik = snapshot.topik;
  cache.soal = snapshot.soal;
  cache.ujian = snapshot.ujian;
  cache.token = snapshot.token;
  cache.sesi = snapshot.sesi;
  cache.config = snapshot.config;
}

export async function hydrateRepos(): Promise<void> {
  if (!loadPromise) {
    loadPromise = getCbtSnapshot()
      .then((snapshot) => {
        applySnapshot(snapshot);
      })
      .catch((e) => {
        loadPromise = null;
        throw e;
      });
  }
  await loadPromise;
}

function upsertArrayItem<T extends { id: string }>(list: T[], item: T) {
  const idx = list.findIndex((entry) => entry.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
}

type MutationResult = { ok: boolean; error?: string };

type EntityName = "users" | "groups" | "modul" | "topik" | "soal" | "ujian" | "token" | "sesi";

function notifyMutationFailure(entity: string, error: string): void {
  toast.error(`Gagal menyimpan ${entity}: ${error}`);
  invalidateReposCache();
  void hydrateRepos();
}

function runEntityMutation(
  entity: EntityName,
  action: "upsert" | "remove" | "bulkSet",
  payload: unknown,
): Promise<MutationResult> {
  return mutateEntity({ data: { entity, action, payload } })
    .then((r) => {
      if (!r.ok) notifyMutationFailure(entity, r.error);
      return r;
    })
    .catch((e) => {
      const error = e instanceof Error ? e.message : String(e);
      notifyMutationFailure(entity, error);
      return { ok: false, error };
    });
}

function createRepo<T extends { id: string }>(
  entity: EntityName,
  getList: () => T[],
  setList: (items: T[]) => void,
) {
  let pending: Promise<MutationResult> | null = null;
  function enqueue(action: "upsert" | "remove" | "bulkSet", payload: unknown): void {
    pending = Promise.resolve(pending).then(() => runEntityMutation(entity, action, payload));
  }
  return {
    all(): T[] {
      return getList().slice();
    },
    byId(id: string): T | undefined {
      return getList().find((item) => item.id === id);
    },
    upsert(item: T): T {
      const next = getList().slice();
      upsertArrayItem(next, item);
      setList(next);
      enqueue("upsert", item);
      return item;
    },
    remove(id: string): void {
      setList(getList().filter((item) => item.id !== id));
      enqueue("remove", { id });
    },
    bulkSet(items: T[]): void {
      setList(items.slice());
      enqueue("bulkSet", items);
    },
    async flush(): Promise<MutationResult> {
      const p = pending;
      if (!p) return { ok: true };
      const result = await p;
      if (pending === p) pending = null;
      return result;
    },
  };
}

export const usersRepo = createRepo(
  "users",
  () => cache.users,
  (items) => {
    cache.users = items;
  },
);
export const groupsRepo = createRepo(
  "groups",
  () => cache.groups,
  (items) => {
    cache.groups = items;
  },
);
export const modulRepo = createRepo(
  "modul",
  () => cache.modul,
  (items) => {
    cache.modul = items;
  },
);
export const topikRepo = createRepo(
  "topik",
  () => cache.topik,
  (items) => {
    cache.topik = items;
  },
);
export const soalRepo = createRepo(
  "soal",
  () => cache.soal,
  (items) => {
    cache.soal = items;
  },
);
export const ujianRepo = createRepo(
  "ujian",
  () => cache.ujian,
  (items) => {
    cache.ujian = items;
  },
);
export const tokenRepo = createRepo(
  "token",
  () => cache.token,
  (items) => {
    cache.token = items;
  },
);
export const sesiRepo = createRepo(
  "sesi",
  () => cache.sesi,
  (items) => {
    cache.sesi = items;
  },
);

let configPending: Promise<MutationResult> | null = null;

function runConfigMutation(cfg: AppConfig): Promise<MutationResult> {
  return saveConfigServer({ data: cfg })
    .then((r) => {
      if (!r.ok) notifyMutationFailure("config", r.error);
      return r;
    })
    .catch((e) => {
      const error = e instanceof Error ? e.message : String(e);
      notifyMutationFailure("config", error);
      return { ok: false, error };
    });
}

export const configRepo = {
  get(): AppConfig {
    return cache.config;
  },
  set(cfg: AppConfig): void {
    cache.config = cfg;
    configPending = Promise.resolve(configPending).then(() => runConfigMutation(cfg));
  },
  async flush(): Promise<MutationResult> {
    const p = configPending;
    if (!p) return { ok: true };
    const result = await p;
    if (configPending === p) configPending = null;
    return result;
  },
};
