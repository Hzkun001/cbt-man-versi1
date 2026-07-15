import { createServerFn } from "@tanstack/react-start";
import { ipInRanges } from "@/lib/cbt/cidr";
import { getRequestIP, getRequestHeaders } from "@tanstack/start-server-core";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { checkRateLimit, clearRateLimit } from "@/lib/cbt/rate-limit";

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
import { Prisma } from "@prisma/client";
import {
	parseJson,
	stringifyJson,
	toBigInt,
	toNumber,
} from "@/lib/server/db/json";

import {
	createSeedDataset,
	seedDatabase,
} from "@/lib/server/db/seed-shared.mjs";
import { writeAuditLog } from "@/lib/server/db/audit";
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	deleteSessionsForUser,
	readSessionToken,
	setSessionCookie,
	validateSession,
	getDeviceFingerprint,
} from "@/lib/server/db/session";

import {
	Snapshot,
	PublicBootConfig,
	UserRow,
	SoalRow,
	SnapshotRows,
	roleSchema,
	entitySchema,
	upsertUserSchema,
	DEFAULT_OPERATOR_ROLE_ACCESS,
	mapUser,
	publicUser,
	mapSoal,
	mapUjian,
	mapToken,
	mapSesi,
	buildConfig,
	buildPublicBootConfig
} from "./mappers";
export * from "./mappers";

export * from "./snapshot";
import { buildSnapshotForUser } from "./snapshot";


type MutationAction = "upsert" | "remove" | "bulkSet";

type MutationAuthResult = { ok: true } | { ok: false; error: string };

const OPERATOR_SESSION_KEYS: NavKey[] = [
	"ujian",
	"hasil",
	"evaluasi",
	"laporan",
	"leaderboard",
];

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

async function operatorHasAnyNav(
	caller: UserRow,
	keys: NavKey[],
): Promise<boolean> {
	if (caller.role !== "operator") return false;
	const allowed = await operatorAccessKeys();
	return keys.some((key) => allowed.has(key));
}

function operatorCanTouchTopikId(caller: UserRow, topikId: string): boolean {
	const allowed = allowedTopikIdsForCaller(caller);
	if (!allowed) return true;
	return allowed.has(topikId);
}

function operatorCanTouchTopicSets(
	caller: UserRow,
	topicSets: Ujian["topicSets"],
): boolean {
	return topicSets.every((item) =>
		operatorCanTouchTopikId(caller, item.topikId),
	);
}

async function operatorCanTouchModul(
	caller: UserRow,
	modulId: string,
): Promise<boolean> {
	const allowed = allowedTopikIdsForCaller(caller);
	if (!allowed) return true;
	const count = await prisma.topik.count({
		where: { modulId, id: { in: [...allowed] } },
	});
	return count > 0;
}

async function operatorCanTouchSoal(
	caller: UserRow,
	soalId: string,
): Promise<boolean> {
	const soal = await prisma.soal.findUnique({
		where: { id: soalId },
		select: { topikId: true },
	});
	return !!soal && operatorCanTouchTopikId(caller, soal.topikId);
}

async function operatorCanTouchUjian(
	caller: UserRow,
	ujianId: string,
): Promise<boolean> {
	const ujian = await prisma.ujian.findUnique({
		where: { id: ujianId },
		select: { topicSets: true },
	});
	if (!ujian) return false;
	const topicSets = parseJson<Ujian["topicSets"]>(ujian.topicSets, []);
	return operatorCanTouchTopicSets(caller, topicSets);
}

async function pesertaCanTouchUjian(
	caller: UserRow,
	ujianId: string,
): Promise<boolean> {
	if (caller.role !== "peserta") return false;
	const ujian = await prisma.ujian.findUnique({
		where: { id: ujianId },
		select: { groupIds: true },
	});
	if (!ujian) return false;
	const groupIds = parseJson<string[]>(ujian.groupIds, []);
	return (
		groupIds.length === 0 ||
		(!!caller.groupId && groupIds.includes(caller.groupId))
	);
}

function localUid(prefix = ""): string {
  const random = randomBytes(10).toString("base64url").slice(0, 16);
  return prefix + random;
}

let seedPromise: Promise<void> | null = null;
function seedIfNeeded(): Promise<void> {
	if (!seedPromise) {
		seedPromise = (async () => {
			const count = await prisma.user.count();
			if (count > 0) return;

			const dataset = await createSeedDataset({
				uid: localUid,
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

async function requireCaller(): Promise<UserRow | null> {
	await seedIfNeeded();
	return validateSession(readSessionToken());
}

async function requireAdminResult(): Promise<MutationAuthResult> {
	const caller = await requireCaller();
	if (!caller || caller.role !== "admin")
		return { ok: false, error: "Forbidden" };
	return { ok: true };
}

async function authorizeMutation(
	caller: UserRow | null,
	entity: z.infer<typeof entitySchema>,
	action: MutationAction,
	payload: unknown,
): Promise<MutationAuthResult> {
	if (!caller) return { ok: false, error: "Forbidden" };
	if (caller.role === "admin") return { ok: true };

	if (entity === "users" || entity === "groups")
		return { ok: false, error: "Forbidden" };
	if (action === "bulkSet") return { ok: false, error: "Forbidden" };

	if (caller.role === "operator") {
		if (entity === "modul") {
			if (!(await operatorHasNav(caller, "modul")))
				return { ok: false, error: "Forbidden" };
			if (action === "remove") {
				const id = String((payload as { id?: string }).id ?? "");
				return (await operatorCanTouchModul(caller, id))
					? { ok: true }
					: { ok: false, error: "Forbidden" };
			}
			return allowedTopikIdsForCaller(caller) === null
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		if (entity === "topik") {
			if (!(await operatorHasNav(caller, "modul")))
				return { ok: false, error: "Forbidden" };
			return allowedTopikIdsForCaller(caller) === null
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		if (entity === "soal") {
			if (!(await operatorHasNav(caller, "modul")))
				return { ok: false, error: "Forbidden" };
			if (action === "remove") {
				const id = String((payload as { id?: string }).id ?? "");
				return (await operatorCanTouchSoal(caller, id))
					? { ok: true }
					: { ok: false, error: "Forbidden" };
			}
			const item = payload as Soal;
			return operatorCanTouchTopikId(caller, item.topikId)
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		if (entity === "ujian") {
			if (!(await operatorHasNav(caller, "ujian")))
				return { ok: false, error: "Forbidden" };
			if (action === "remove") {
				const id = String((payload as { id?: string }).id ?? "");
				return (await operatorCanTouchUjian(caller, id))
					? { ok: true }
					: { ok: false, error: "Forbidden" };
			}
			const item = payload as Ujian;
			return operatorCanTouchTopicSets(caller, item.topicSets)
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		if (entity === "token") {
			if (!(await operatorHasNav(caller, "ujian")))
				return { ok: false, error: "Forbidden" };
			const id =
				action === "remove" ? undefined : (payload as TokenUjian).ujianId;
			if (id)
				return (await operatorCanTouchUjian(caller, id))
					? { ok: true }
					: { ok: false, error: "Forbidden" };
			const existing = await prisma.tokenUjian.findUnique({
				where: { id: String((payload as { id?: string }).id ?? "") },
				select: { ujianId: true },
			});
			return existing && (await operatorCanTouchUjian(caller, existing.ujianId))
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		if (entity === "sesi") {
			if (!(await operatorHasAnyNav(caller, OPERATOR_SESSION_KEYS)))
				return { ok: false, error: "Forbidden" };
			const ujianId =
				action === "remove"
					? (
							await prisma.sesiUjian.findUnique({
								where: { id: String((payload as { id?: string }).id ?? "") },
								select: { ujianId: true },
							})
						)?.ujianId
					: (payload as SesiUjian).ujianId;
			return ujianId && (await operatorCanTouchUjian(caller, ujianId))
				? { ok: true }
				: { ok: false, error: "Forbidden" };
		}

		return { ok: false, error: "Forbidden" };
	}

	if (caller.role === "peserta") {
		if (entity === "token" && action === "upsert") {
			// Closed (Issue #9): peserta token writes are single-use claims and must
			// go through the atomic `claimExamToken` server fn. This generic upsert
			// path was a non-atomic findUnique->check->write that two participants
			// could race to double-claim a token, so it is rejected outright.
			return { ok: false, error: "Forbidden" };
		}

		if (entity === "sesi" && action === "upsert") {
			const item = payload as SesiUjian;
			if (item.pesertaId !== caller.id)
				return { ok: false, error: "Forbidden" };
			if (!(await pesertaCanTouchUjian(caller, item.ujianId)))
				return { ok: false, error: "Forbidden" };
			const existing = await prisma.sesiUjian.findUnique({
				where: { id: item.id },
				select: { pesertaId: true, ujianId: true },
			});
			if (
				existing &&
				(existing.pesertaId !== caller.id || existing.ujianId !== item.ujianId)
			) {
				return { ok: false, error: "Forbidden" };
			}
			// IP range enforcement for exam access
			const ujianForIp = await prisma.ujian.findUnique({
				where: { id: item.ujianId },
				select: { ipRange: true },
			});
			if (ujianForIp?.ipRange) {
				const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
				if (!ipInRanges(ip, ujianForIp.ipRange)) {
					return {
						ok: false,
						error: "Akses ditolak: IP Anda tidak diizinkan untuk ujian ini.",
					};
				}
			}
			// Cegah peserta memulai/melanjutkan ujian di luar window beginAt/endAt.
			// Peserta boleh tetap membuat sesi "belum" di luar window, tapi tidak boleh bertransisi ke "sedang".
			if (item.status === "sedang") {
				const ujian = await prisma.ujian.findUnique({
					where: { id: item.ujianId },
					select: { beginAt: true, endAt: true },
				});
				if (ujian) {
					const beginAt = toNumber(ujian.beginAt);
					const endAt = toNumber(ujian.endAt);
					const now = Date.now();
					if (beginAt !== undefined && now < beginAt) {
						return { ok: false, error: "Ujian belum dimulai" };
					}
					if (endAt !== undefined && now > endAt) {
						return { ok: false, error: "Ujian sudah berakhir" };
					}
				}
			}

			return { ok: true };
		}
	}

	return { ok: false, error: "Forbidden" };
}



// ---------------------------------------------------------------------------
// Token exam code generation (Issue #12)
//
// The old client-side path produced 6-char base-36 codes with `Math.random()`
// (~31 bits of entropy, biased, no DB uniqueness check). Tokens are
// exam-access secrets, so we generate them on the server with `randomBytes`
// — the same primitive already used for session tokens in `db/session.ts`.
//
// Charset is uppercase A–Z + digits, intentionally excluding 0/O/1/I/L to
// avoid transcription errors. The alphabet has 31 symbols, so we reduce
// random bytes with `% 31` (rejection sampling keeps the distribution
// uniform; the bias from a power-of-two modulo is irrelevant at this
// alphabet size). `length` defaults to 12 chars → log2(31^12) ≈ 59 bits of
// entropy, well above what 6-char base36 ever provided.
// ---------------------------------------------------------------------------

const TOKEN_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars, no 0/O/1/I/L
const DEFAULT_TOKEN_LENGTH = 12;
const MAX_TOKEN_COLLISION_RETRIES = 5;

function generateTokenCode(length: number = DEFAULT_TOKEN_LENGTH): string {
	// We need at least `length` chars from a 31-symbol alphabet.
	// randomBytes(length) gives us ample raw material; one byte per char is
	// wasteful but keeps the implementation trivial. Each byte is reduced
	// mod 31 so every char maps to a valid alphabet symbol.
	const bytes = randomBytes(length);
	let out = "";
	for (let i = 0; i < length; i++) {
		const byte = bytes[i];
		if (byte === undefined) {
			// Defensive: randomBytes(>=length) should never return undefined here.
			throw new Error("randomBytes returned short buffer");
		}
		out += TOKEN_CHARSET.charAt(byte % TOKEN_CHARSET.length);
	}
	return out;
}

export function isValidTokenCode(code: string): boolean {
	if (code.length === 0) return false;
	for (const ch of code) {
		if (!TOKEN_CHARSET.includes(ch)) return false;
	}
	return true;
}

export const generateExamTokensServer = createServerFn({ method: "POST" })
	.validator(
		z.object({
			ujianId: z.string().min(1),
			jumlah: z.number().int().min(1).max(500),
			length: z.number().int().min(8).max(32).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await seedIfNeeded();
		const uid = localUid;
		const caller = await requireCaller();
		if (!caller) return { ok: false as const, error: "Unauthorized" };
		if (caller.role !== "admin" && caller.role !== "operator") {
			return { ok: false as const, error: "Forbidden" };
		}

		// Operators can only generate tokens for exams they can touch.
		if (caller.role === "operator") {
			if (!(await operatorCanTouchUjian(caller, data.ujianId))) {
				return { ok: false as const, error: "Forbidden" };
			}
		}

		const exam = await prisma.ujian.findUnique({ where: { id: data.ujianId } });
		if (!exam) return { ok: false as const, error: "Ujian tidak ditemukan" };

		const length = data.length ?? DEFAULT_TOKEN_LENGTH;
		const created: TokenUjian[] = [];
		let attempts = 0;
		const maxAttempts = data.jumlah * (1 + MAX_TOKEN_COLLISION_RETRIES);

		while (created.length < data.jumlah && attempts < maxAttempts) {
			const code = generateTokenCode(length);
			attempts++;
			try {
				const row = await prisma.tokenUjian.create({
					data: {
						id: uid("tk_"),
						ujianId: data.ujianId,
						kode: code,
					},
				});
				created.push(mapToken(row));
			} catch (err) {
				// Unique constraint on (ujianId, kode) — retry with a fresh code.
				if (
					err instanceof Prisma.PrismaClientKnownRequestError &&
					err.code === "P2002"
				) {
					continue;
				}
				throw err;
			}
		}

		if (created.length < data.jumlah) {
			return {
				ok: false as const,
				error: `Gagal membuat token unik setelah ${maxAttempts} percobaan; berhasil ${created.length} dari ${data.jumlah}`,
				created: created.length,
			};
		}

		return { ok: true as const, tokens: created };
	});

// ---------------------------------------------------------------------------
// Atomic single-use token claim (Issue #9)
//
// The old flow read the token from the client cache, checked `dipakaiOleh`
// locally, then upserted it back — a read-then-write race where two
// participants could both observe an unused token and both start the exam.
// (The generic peserta `token`/`upsert` path in `authorizeMutation` carried
// the same race and is now closed, so this is the ONLY peserta token-write.)
//
// The fix is a single conditional `updateMany`: only rows that are still
// unused (`dipakaiOleh: null`) OR already owned by this caller are flipped to
// the caller. SQLite serializes the racing writes, so exactly one participant
// matches a row (`count === 1`) and the loser matches nothing (`count === 0`).
// Re-claiming by the same participant is idempotent. The `@@unique([ujianId,
// kode])` constraint keeps the match to a single row, so the success payload
// is built from the values we just wrote — no non-transactional re-read.
// ---------------------------------------------------------------------------
export const claimExamToken = createServerFn({ method: "POST" })
	.validator(
		z.object({
			ujianId: z.string().min(1),
			kode: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const caller = await requireCaller();
		if (!caller) return { ok: false as const, error: "Unauthorized" };
		if (caller.role !== "peserta")
			return { ok: false as const, error: "Forbidden" };
		if (!(await pesertaCanTouchUjian(caller, data.ujianId))) {
			return { ok: false as const, error: "Forbidden" };
		}

		// Rate limit by participant to prevent brute-forcing token codes
		const rateCheck = checkRateLimit(caller.id, "claimToken");
		if (!rateCheck.ok) {
			return { ok: false as const, error: rateCheck.error };
		}

		// Check IP range restriction on exam
		const ujian = await prisma.ujian.findUnique({
			where: { id: data.ujianId },
			select: { ipRange: true },
		});
		if (ujian?.ipRange) {
			const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
			if (!ipInRanges(ip, ujian.ipRange)) {
				return {
					ok: false as const,
					error: "Akses ditolak: IP Anda tidak diizinkan untuk ujian ini.",
				};
			}
		}

		const kode = data.kode.trim().toUpperCase();
		const dipakaiAt = Date.now();

		// Single atomic conditional update: claim only if unused or already ours.
		const result = await prisma.tokenUjian.updateMany({
			where: {
				ujianId: data.ujianId,
				kode,
				OR: [{ dipakaiOleh: null }, { dipakaiOleh: caller.id }],
			},
			data: { dipakaiOleh: caller.id, dipakaiAt: toBigInt(dipakaiAt) },
		});

		if (result.count === 0) {
			// Disambiguate why nothing matched: unknown code vs. taken by someone
			// else. This read only chooses an error message; it never gates the
			// claim (the claim already failed atomically above).
			const existing = await prisma.tokenUjian.findFirst({
				where: { ujianId: data.ujianId, kode },
				select: { id: true },
			});
			if (!existing)
				return {
					ok: false as const,
					error: "Token tidak valid untuk ujian ini",
				};
			return { ok: false as const, error: "Token sudah dipakai peserta lain" };
		}

		// Resolve the immutable row `id` for the client cache patch. The row was
		// just claimed (count >= 1), so a miss here means the exam (and its
		// cascade-deleted tokens) was removed in the gap between the update and
		// this read — the claim is moot, so report a transient failure rather
		// than fabricate an id that would push a phantom row into the cache.
		const claimedId = await prisma.tokenUjian.findFirst({
			where: { ujianId: data.ujianId, kode },
			select: { id: true },
		});
		if (!claimedId) {
			return {
				ok: false as const,
				error: "Token tidak dapat diklaim, silakan coba lagi",
			};
		}
		const token: TokenUjian = {
			id: claimedId.id,
			ujianId: data.ujianId,
			kode,
			dipakaiOleh: caller.id,
			dipakaiAt,
		};
		clearRateLimit(caller.id, "claimToken");
		return { ok: true as const, token };
	});

export const getCbtSnapshot = createServerFn({ method: "GET" }).handler(
	async () => {
		await seedIfNeeded();
		const caller = await validateSession(readSessionToken());
		if (!caller) throw new Error("Unauthorized");
		return buildSnapshotForUser(caller);
	},
);

// ---------------------------------------------------------------------------
// Direct-URL fetch for the exam editor and token page (Issue #10 must-fix #3).
//
// The client cache (`ujianRepo`) is filtered by `operatorSnapshot` so that a
// restricted operator never sees exams whose `topicSets` are entirely
// outside `allowedTopikIds`. When the operator navigates to a direct URL
// for such an exam, `ujianRepo.byId` returns `undefined` and the route used
// to fall through to a generic "tidak ditemukan" branch — leaving the
// operator unable to tell whether the exam was deleted or just out of
// scope.
//
// This function fetches the ujian **unfiltered by scope** (i.e. the same
// row any admin would see) and applies a coarser visibility predicate:
//   - admin: full access.
//   - operator: must own at least one of the ujian's topic sets
//     (`some` semantics — the operator can see the lock screen, but
//     `ujianTouchesAllowed` uses `every` and will still block edits).
//   - peserta: must be in a group that the ujian is open to.
//
// This avoids leaking exam metadata to users who should never see the
// exam at all, while still letting the legitimate "exists but blocked"
// flow render the lock screen with a clear message.
// ---------------------------------------------------------------------------
export const fetchUjianByIdServer = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().min(1) }))
	.handler(async ({ data }) => {
		await seedIfNeeded();
		const caller = await requireCaller();
		if (!caller) return { ok: false as const, error: "Unauthorized" };

		const row = await prisma.ujian.findUnique({ where: { id: data.id } });
		if (!row) return { ok: false as const, error: "Not found" };

		if (caller.role === "operator") {
			const allowed = allowedTopikIdsForCaller(caller);
			if (allowed) {
				const sets = parseJson<{ topikId: string }[]>(row.topicSets, []);
				const topicIds = new Set(sets.map((s) => s.topikId));
				const any = [...topicIds].some((id) => allowed.has(id));
				if (!any) return { ok: false as const, error: "Forbidden" };
			}
		} else if (caller.role === "peserta") {
			const groupIds = parseJson<string[]>(row.groupIds, []);
			if (
				groupIds.length > 0 &&
				(!caller.groupId || !groupIds.includes(caller.groupId))
			) {
				return { ok: false as const, error: "Forbidden" };
			}
		}

		return { ok: true as const, ujian: mapUjian(row) };
	});

export const getPublicBootConfigServer = createServerFn({
	method: "GET",
}).handler(async () => {
	await seedIfNeeded();
	const config = await prisma.appConfig.findUnique({ where: { id: "app" } });
	return buildPublicBootConfig(config);
});

export const ensureSeedServer = createServerFn({ method: "POST" }).handler(
	async () => {
		await seedIfNeeded();
		return { ok: true as const };
	},
);

export const loginServer = createServerFn({ method: "POST" })
	.validator(
		z.object({ username: z.string().min(1), password: z.string().min(1) }),
	)
	.handler(async ({ data }) => {
		await seedIfNeeded();
		// Rate limit by IP (primary) and username (secondary)
		const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
		const ipCheck = checkRateLimit(ip, "login:ip");
		if (!ipCheck.ok) {
			return { ok: false as const, error: ipCheck.error };
		}
		const userCheck = checkRateLimit(data.username.toLowerCase(), "login:user");
		if (!userCheck.ok) {
			return { ok: false as const, error: userCheck.error };
		}

		const user = await prisma.user.findUnique({
			where: { username: data.username },
		});
		if (!user) return { ok: false as const, error: "Username tidak ditemukan" };
		if (!user.aktif) return { ok: false as const, error: "Akun dinonaktifkan" };
		const ok = await verifyPassword(data.password, user.passwordHash);
		if (!ok) return { ok: false as const, error: "Password salah" };
		// Clear rate limit on successful login
		clearRateLimit(ip, "login:ip");
		clearRateLimit(data.username.toLowerCase(), "login:user");
		const fp = await getDeviceFingerprint();
		const ua = getRequestHeaders().get("user-agent") ?? "";
		const token = await createSession(user.id, ua, fp);
		setSessionCookie(token);
		return { ok: true as const, user: publicUser(user) };
	});

export const validateSessionServer = createServerFn({ method: "POST" }).handler(
	async () => {
		try {
			await seedIfNeeded();
			const userRow = await validateSession(readSessionToken());
			return { user: userRow ? publicUser(userRow) : null };
		} catch {
			return { user: null };
		}
	},
);

export const logoutServer = createServerFn({ method: "POST" }).handler(
	async () => {
		await seedIfNeeded();
		await deleteSession(readSessionToken());
		clearSessionCookie();
		return { ok: true as const };
	},
);

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
				return {
					ok: false as const,
					error: "Password wajib diisi untuk akun baru",
				};
			}

			const passwordHash = data.newPassword
				? await hashPassword(data.newPassword)
				: (existing?.passwordHash ?? "");

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
			return {
				ok: false as const,
				error: err instanceof Error ? err.message : String(err),
			};
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
			// Audit log (fire-and-forget, never blocks primary operation)
			if (caller && entity !== "sesi" && entity !== "token") {
				writeAuditLog({
					userId: caller.id,
					userRole: caller.role,
					action: `${entity}.${action}`,
					entity,
					entityId:
						typeof payload === "object" && payload && "id" in payload
							? String((payload as { id?: unknown }).id ?? "")
							: undefined,
					details: JSON.stringify({ entity, action, hasPayload: !!payload }),
				}).catch(() => undefined);
			}
			if (entity === "users") {
				await prisma.$transaction(async (tx) => {
					if (action === "remove")
						await tx.user.delete({ where: { id: String(payload.id) } });
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
						const nextPasswordHash =
							item.passwordHash || prev?.passwordHash || "";
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
					if (action === "remove")
						await tx.group.delete({ where: { id: String(payload.id) } });
					else if (action === "bulkSet") {
						await tx.group.deleteMany();
						await tx.group.createMany({ data: payload as Group[] });
					} else
						await tx.group.upsert({
							where: { id: payload.id },
							update: payload,
							create: payload,
						});
				});
			}
			if (entity === "modul") {
				await prisma.$transaction(async (tx) => {
					if (action === "remove")
						await tx.modul.delete({ where: { id: String(payload.id) } });
					else if (action === "bulkSet") {
						await tx.modul.deleteMany();
						await tx.modul.createMany({ data: payload as Modul[] });
					} else
						await tx.modul.upsert({
							where: { id: payload.id },
							update: payload,
							create: payload,
						});
				});
			}
			if (entity === "topik") {
				await prisma.$transaction(async (tx) => {
					if (action === "remove")
						await tx.topik.delete({ where: { id: String(payload.id) } });
					else if (action === "bulkSet") {
						await tx.topik.deleteMany();
						await tx.topik.createMany({ data: payload as Topik[] });
					} else
						await tx.topik.upsert({
							where: { id: payload.id },
							update: payload,
							create: payload,
						});
				});
			}
			if (entity === "soal") {
				await prisma.$transaction(async (tx) => {
					if (action === "remove")
						await tx.soal.delete({ where: { id: String(payload.id) } });
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
							data: item.jawaban.map((jawaban) => ({
								...jawaban,
								soalId: item.id,
							})),
						});
					}
				});
			}
			if (entity === "ujian") {
				await prisma.$transaction(async (tx) => {
					if (action === "remove")
						await tx.ujian.delete({ where: { id: String(payload.id) } });
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
					if (action === "remove")
						await tx.sesiUjian.delete({ where: { id: String(payload.id) } });
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
			return {
				ok: false as const,
				error: err instanceof Error ? err.message : String(err),
			};
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
				create: {
					id: "app",
					...data,
					roleAccess: stringifyJson(data.roleAccess),
				},
			});
			return { ok: true as const };
		} catch (err) {
			return {
				ok: false as const,
				error: err instanceof Error ? err.message : String(err),
			};
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

			if (data.groups.length)
				await tx.group.createMany({ data: data.groups as Group[] });
			if (data.modul.length)
				await tx.modul.createMany({ data: data.modul as Modul[] });
			if (data.topik.length)
				await tx.topik.createMany({ data: data.topik as Topik[] });
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
				// Backup imports can contain stale or duplicate token codes. The DB
				// now enforces `@@unique([ujianId, kode])`, so a `createMany` that
				// contains a duplicate would abort the whole transaction. We
				// dedupe in-memory by (ujianId, kode) — keeping the last occurrence
				// — and skip anything that already exists in the destination DB.
				const seen = new Map<string, TokenUjian>();
				for (const t of data.token as TokenUjian[]) {
					seen.set(`${t.ujianId}::${t.kode}`, t);
				}
				const incoming = [...seen.values()];
				const existingKeys = new Set(
					(
						await tx.tokenUjian.findMany({
							where: {
								OR: incoming.map((t) => ({ ujianId: t.ujianId, kode: t.kode })),
							},
							select: { ujianId: true, kode: true },
						})
					).map((row) => `${row.ujianId}::${row.kode}`),
				);
				const toInsert = incoming.filter(
					(t) => !existingKeys.has(`${t.ujianId}::${t.kode}`),
				);
				if (toInsert.length) {
					await tx.tokenUjian.createMany({
						data: toInsert.map((item) => ({
							...item,
							dipakaiOleh: item.dipakaiOleh ?? null,
							dipakaiAt: toBigInt(item.dipakaiAt),
						})),
					});
				}
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

export const getAuditLogsServer = createServerFn({ method: "POST" })
	.validator(
		z.object({
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
			userId: z.string().optional(),
			entity: z.string().optional(),
			action: z.string().optional(),
			dateFrom: z.number().optional(),
			dateTo: z.number().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const caller = await requireCaller();
		if (!caller || caller.role !== "admin") {
			return { ok: false as const, error: "Forbidden", logs: [], total: 0 };
		}
		const where: Record<string, unknown> = {};
		if (data.userId) where.userId = data.userId;
		if (data.entity) where.entity = data.entity;
		if (data.action) where.action = data.action;
		if (data.dateFrom || data.dateTo) {
			where.createdAt = {};
			if (data.dateFrom)
				(where.createdAt as Record<string, Date>).gte = new Date(data.dateFrom);
			if (data.dateTo)
				(where.createdAt as Record<string, Date>).lte = new Date(data.dateTo);
		}
		const [logs, total] = await Promise.all([
			prisma.auditLog.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: (data.page - 1) * data.pageSize,
				take: data.pageSize,
				select: {
					id: true,
					userId: true,
					userRole: true,
					action: true,
					entity: true,
					entityId: true,
					details: true,
					createdAt: true,
				},
			}),
			prisma.auditLog.count({ where }),
		]);
		return { ok: true as const, logs, total };
	});

export const resetAllDataServer = createServerFn({ method: "POST" }).handler(
	async () => {
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
	},
);

export { seedIfNeeded, mapUjian };
