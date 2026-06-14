import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { uid } from "@/lib/server/db/id";
import { prisma } from "@/lib/server/db/prisma";
import { parseJson } from "@/lib/server/db/json";
import { readSessionToken, validateSession } from "@/lib/server/db/session";
import type { NavKey } from "@/lib/cbt/types";

const uploadsDir = resolve(process.cwd(), "data", "uploads");
const DEFAULT_OPERATOR_ROLE_ACCESS: NavKey[] = [
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

type StoredFileRecord = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  extension: string;
};

const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  createdAt: z.number(),
  extension: z.string().default(""),
});

async function ensureUploadsDir() {
  await mkdir(uploadsDir, { recursive: true });
}

function filePath(id: string, extension: string) {
  return join(uploadsDir, `${id}${extension}`);
}

function metaPath(id: string) {
  return join(uploadsDir, `${id}.json`);
}

async function readMeta(id: string): Promise<StoredFileRecord | null> {
  try {
    const raw = await readFile(metaPath(id), "utf8");
    return fileSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function listMetas(): Promise<StoredFileRecord[]> {
  await ensureUploadsDir();
  const entries = await readdir(uploadsDir);
  const metas = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        try {
          const raw = await readFile(join(uploadsDir, entry), "utf8");
          return fileSchema.parse(JSON.parse(raw));
        } catch {
          return null;
        }
      }),
  );

  return metas
    .filter((item): item is StoredFileRecord => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function requireCaller() {
  return validateSession(readSessionToken());
}

async function operatorHasFilesAccess() {
  const config = await prisma.appConfig.findUnique({ where: { id: "app" }, select: { roleAccess: true } });
  const operatorAccess = parseJson<Record<string, string[]>>(config?.roleAccess, {
    operator: [...DEFAULT_OPERATOR_ROLE_ACCESS],
  }).operator;
  return new Set((operatorAccess ?? []) as NavKey[]).has("files");
}

async function requireFileManagerAccess() {
  const caller = await requireCaller();
  if (!caller) return { ok: false as const, error: "Forbidden" };
  if (caller.role === "admin") return { ok: true as const, caller };
  if (caller.role === "operator" && (await operatorHasFilesAccess())) return { ok: true as const, caller };
  return { ok: false as const, error: "Forbidden" };
}

async function requireAdmin() {
  const caller = await requireCaller();
  if (!caller || caller.role !== "admin") return { ok: false as const, error: "Forbidden" };
  return { ok: true as const, caller };
}

export const listStoredFiles = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireFileManagerAccess();
  if (!auth.ok) throw new Error(auth.error);
  return listMetas();
});

export const uploadStoredFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      mime: z.string().min(1),
      dataBase64: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await requireFileManagerAccess();
    if (!auth.ok) throw new Error(auth.error);

    await ensureUploadsDir();
    const id = uid("f_");
    const extension = extname(data.name).slice(0, 16);
    const buffer = Buffer.from(data.dataBase64, "base64");
    const meta: StoredFileRecord = {
      id,
      name: data.name,
      mime: data.mime,
      size: buffer.byteLength,
      createdAt: Date.now(),
      extension,
    };

    await writeFile(filePath(id, extension), buffer);
    await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
    return meta;
  });

export const deleteStoredFile = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await requireAdmin();
    if (!auth.ok) return { ok: false as const, error: auth.error };

    const meta = await readMeta(data.id);
    if (!meta) return { ok: true as const };

    await rm(filePath(meta.id, meta.extension), { force: true });
    await rm(metaPath(meta.id), { force: true });
    return { ok: true as const };
  });

export const getStoredFileUrl = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const caller = await requireCaller();
    if (!caller) throw new Error("Forbidden");

    const meta = await readMeta(data.id);
    if (!meta) return null;

    const absPath = filePath(meta.id, meta.extension);
    const info = await stat(absPath);
    if (!info.isFile()) return null;

    const body = await readFile(absPath);
    return {
      mime: meta.mime,
      dataBase64: body.toString("base64"),
    };
  });

const fileBackupSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  createdAt: z.number(),
  extension: z.string(),
  dataBase64: z.string(),
});

export const exportFilesServer = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error(auth.error);

  const metas = await listMetas();
  const files = await Promise.all(
    metas.map(async (meta) => {
      const body = await readFile(filePath(meta.id, meta.extension));
      return { ...meta, dataBase64: body.toString("base64") };
    }),
  );
  return files;
});

export const importFilesServer = createServerFn({ method: "POST" })
  .validator(z.array(fileBackupSchema))
  .handler(async ({ data }) => {
    const auth = await requireAdmin();
    if (!auth.ok) return { ok: false as const, error: auth.error };

    await ensureUploadsDir();
    for (const item of data) {
      if (!/^[A-Za-z0-9_-]+$/.test(item.id)) continue;
      if (item.extension !== "" && !/^\.[A-Za-z0-9]{1,16}$/.test(item.extension)) continue;
      const blobPath = resolve(filePath(item.id, item.extension));
      if (!blobPath.startsWith(uploadsDir + sep)) continue;
      const buffer = Buffer.from(item.dataBase64, "base64");
      await writeFile(blobPath, buffer);
      const meta: StoredFileRecord = {
        id: item.id,
        name: item.name,
        mime: item.mime,
        size: item.size,
        createdAt: item.createdAt,
        extension: item.extension,
      };
      await writeFile(metaPath(item.id), JSON.stringify(meta, null, 2));
    }
    return { ok: true as const };
  });
