import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { validateSessionServer } from "@/lib/server/repos/functions";
import { loadPublicBootConfig } from "@/lib/cbt/repos";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableRow,
	TableCell,
} from "@/components/ui/table";
import {
	CalendarDays,
	Clock,
	GraduationCap,
	Timer,
	Sun,
	Moon,
	Globe,
	Monitor,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LoginModal } from "@/components/LoginModal";
import type { Ujian } from "@/lib/cbt/types";

type SearchParams = {
	login?: boolean;
	redirect?: string;
};

function getExamStatus(beginAt: number | undefined, endAt: number | undefined, now: number) {
	if (!beginAt || !endAt) return { text: "Belum Ditentukan", color: "text-slate-500" };

	if (now > endAt) {
		return {
			text: "Ujian Sudah Berlalu",
			color:
				"bg-red-500/10 text-red-600 dark:text-red-400 border-red-200/50 dark:border-red-900/30",
		};
	} else if (now >= beginAt && now <= endAt) {
		return {
			text: "Ujian Sedang Berlangsung",
			color:
				"bg-green-500/10 text-green-600 dark:text-green-400 border-green-200/50 dark:border-green-900/30",
		};
	} else {
		return {
			text: "Ujian Akan Berlangsung",
			color:
				"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30",
		};
	}
}

function getExamCountdown(beginAt: number | undefined, endAt: number | undefined, now: number) {
	if (!beginAt || !endAt) return { text: "—", color: "text-slate-400 dark:text-slate-500 font-medium" };

	if (now > endAt) {
		return {
			text: "—",
			color: "text-slate-400 dark:text-slate-500 font-medium",
		};
	} else if (now >= beginAt && now <= endAt) {
		const diffSeconds = Math.floor((endAt - now) / 1000);
		const hours = Math.floor(diffSeconds / 3600);
		const minutes = Math.floor((diffSeconds % 3600) / 60);
		const seconds = diffSeconds % 60;

		const formatted = [
			hours > 0 ? String(hours).padStart(2, "0") : null,
			String(minutes).padStart(2, "0"),
			String(seconds).padStart(2, "0"),
		]
			.filter(Boolean)
			.join(":");

		return {
			text: `${formatted} (Sisa)`,
			color:
				"text-green-600 dark:text-green-400 font-bold font-mono animate-pulse",
		};
	} else {
		const diffSeconds = Math.floor((beginAt - now) / 1000);
		const hours = Math.floor(diffSeconds / 3600);
		const minutes = Math.floor((diffSeconds % 3600) / 60);
		const seconds = diffSeconds % 60;

		const formatted = [
			hours > 0 ? String(hours).padStart(2, "0") : null,
			String(minutes).padStart(2, "0"),
			String(seconds).padStart(2, "0"),
		]
			.filter(Boolean)
			.join(":");

		return {
			text: `${formatted} (Mulai)`,
			color: "text-amber-600 dark:text-amber-400 font-bold font-mono",
		};
	}
}

// Server function to get today's exams
const getTodaysExams = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async () => {
		const { getTodaysExamsServer } = await import("@/lib/server/exams");
		return getTodaysExamsServer();
	});

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
	validateSearch: (search: Record<string, unknown>): SearchParams => {
		return {
			login: search.login === true || search.login === "true" || undefined,
			redirect:
				typeof search.redirect === "string" ? search.redirect : undefined,
		};
	},
	beforeLoad: async () => {
		const { user } = await validateSessionServer();
		if (user) {
			throw redirect({ to: user.role === "peserta" ? "/peserta" : "/admin" });
		}
	},
	loader: async () => {
		return getTodaysExams({ data: {} });
	},
	component: Landing,
});

function Landing() {
	const initialData = Route.useLoaderData();
	const { data } = useQuery({
		queryKey: ["todaysExams"],
		queryFn: () => getTodaysExams({ data: {} }),
		initialData,
		refetchInterval: 60000,
	});

	const exams = { online: data?.online ?? [], offline: data?.offline ?? [] };
	const groupsMap = data?.groupsMap ?? {};
	const serverTime = data?.serverTime ?? Date.now();

	const [activeTab, setActiveTab] = useState<"online" | "offline">("online");
	const [theme, setTheme] = useState<"light" | "dark">("light");
	
	const [timeOffset, setTimeOffset] = useState(0);
	const [now, setNow] = useState(Date.now());
	
	useEffect(() => {
		if (serverTime) {
			setTimeOffset(Date.now() - serverTime);
		}
	}, [serverTime]);

	useEffect(() => {
		const updateTime = () => {
			setNow(Date.now() - timeOffset);
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [timeOffset]);

	const timeString = new Date(now).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});

	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	useEffect(() => {
		const stored = localStorage.getItem("theme");
		if (stored === "dark" || stored === "light") {
			setTheme(stored);
			if (stored === "dark") {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		} else {
			const prefersDark = window.matchMedia(
				"(prefers-color-scheme: dark)",
			).matches;
			setTheme(prefersDark ? "dark" : "light");
			if (prefersDark) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		}
	}, []);

	const toggleTheme = () => {
		const nextTheme = theme === "light" ? "dark" : "light";
		setTheme(nextTheme);
		localStorage.setItem("theme", nextTheme);
		if (nextTheme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	};

	const handleCloseModal = () => {
		navigate({
			to: "/",
			search: (prev) => {
				const next = { ...prev };
				delete next.login;
				delete next.redirect;
				return next;
			},
			replace: true,
		});
	};

	const handleOpenLogin = (ujianId: string) => {
		navigate({
			to: "/",
			search: (prev) => ({
				...prev,
				login: true,
				redirect: `/peserta/ujian/${ujianId}`,
			}),
		});
	};

	const handleOpenLoginGeneral = () => {
		navigate({
			to: "/",
			search: (prev) => ({
				...prev,
				login: true,
			}),
		});
	};

	const currentExams = activeTab === "online" ? exams.online : exams.offline;

	return (
		<div className="min-h-screen relative flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden z-0 transition-colors duration-300">
			{/* Top Bar / Header */}
			<header className="w-full bg-[#0b1b3d] text-white px-6 py-3.5 flex items-center justify-between shadow-md relative z-20 font-sans border-b border-white/10">
				<span className="font-bold text-sm sm:text-base tracking-wide">
					CBT-MAN
				</span>
				<div className="flex items-center gap-4">
					<span className="font-mono text-sm sm:text-base font-semibold">
						{timeString}
					</span>
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleTheme}
						className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer flex items-center justify-center transition-all"
						aria-label="Toggle Theme"
					>
						{theme === "dark" ? (
							<Sun className="h-5 w-5 text-amber-300 transition-all" />
						) : (
							<Moon className="h-5 w-5 text-slate-300 transition-all" />
						)}
					</Button>
				</div>
			</header>

			{/* Main Content Area */}
			<main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
				{/* Background Image Layer */}
				<div
					className="absolute inset-0 z-0 pointer-events-none select-none bg-cover bg-center"
					style={{
						backgroundImage: "url('/bg_exam.jpg')",
					}}
				/>

				{/* Dark overlay to dim the background image */}
				<div className="absolute inset-0 z-0 pointer-events-none bg-white/70 dark:bg-slate-950/80 transition-colors duration-300" />

				{/* Grid Pattern overlay for tech texture */}
				<div
					className="absolute inset-0 z-0 pointer-events-none"
					style={{
						backgroundImage:
							"linear-gradient(to right, rgba(99, 102, 241, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(99, 102, 241, 0.05) 1px, transparent 1px)",
						backgroundSize: "24px 24px",
						maskImage:
							"radial-gradient(ellipse 60% 50% at 50% 50%, #000 80%, transparent 100%)",
						WebkitMaskImage:
							"radial-gradient(ellipse 60% 50% at 50% 50%, #000 80%, transparent 100%)",
					}}
				/>

				{/* Decorative Lights */}
				<div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/10 blur-[100px] z-0 pointer-events-none"></div>
				<div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[100px] z-0 pointer-events-none"></div>

				<div className="w-full max-w-6xl bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(15,23,42,0.08)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] p-6 sm:p-8 flex flex-col gap-6 relative z-10 transition-all duration-300">
					{/* Header Section */}
					<div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
						<div className="flex items-center gap-2">
							<CalendarDays className="h-6 w-6 text-primary dark:text-violet-400 animate-pulse" />
							<h1 className="text-2xl font-bold tracking-tight font-sans text-slate-900 dark:text-white">
								Jadwal Ujian Hari Ini
							</h1>
						</div>
						<span className="rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 px-3 py-1 text-sm font-semibold text-slate-700 dark:text-white/95 font-sans">
							{exams.online.length + exams.offline.length} Ujian Hari Ini
						</span>
					</div>

					{/* Online/Offline Tabs */}
					<div className="flex gap-2 border-b border-slate-200 dark:border-white/10 mb-4">
						<button
							className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
								activeTab === "online"
									? "bg-primary text-primary-foreground border-b-2 border-primary"
									: "text-muted-foreground hover:text-foreground"
							}`}
							onClick={() => setActiveTab("online")}
						>
							<span className="flex items-center gap-2">
								<Globe className="h-4 w-4" /> Online ({exams.online.length})
							</span>
						</button>
						<button
							className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
								activeTab === "offline"
									? "bg-primary text-primary-foreground border-b-2 border-primary"
									: "text-muted-foreground hover:text-foreground"
							}`}
							onClick={() => setActiveTab("offline")}
						>
							<span className="flex items-center gap-2">
								<Monitor className="h-4 w-4" /> Offline ({exams.offline.length})
							</span>
						</button>
					</div>

					{/* Table Section */}
					<div className="border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-black/20 shadow-inner">
						<Table>
							<TableHeader className="bg-slate-100/80 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
								<TableRow className="hover:bg-transparent border-slate-200 dark:border-white/10">
									<TableHead className="w-16 text-center font-sans font-bold text-sm sm:text-base py-3 text-slate-600 dark:text-slate-200">
										No
									</TableHead>
									<TableHead className="font-sans font-bold text-sm sm:text-base py-3 text-slate-600 dark:text-slate-200">
										Nama Ujian
									</TableHead>
									<TableHead className="font-sans font-bold text-sm sm:text-base py-3 text-slate-200">
										Program Studi
									</TableHead>
									<TableHead className="font-sans font-bold text-sm sm:text-base py-3 text-slate-200">
										Semester
									</TableHead>
									<TableHead className="font-sans font-bold text-sm sm:text-base py-3 text-slate-200">
										Waktu
									</TableHead>
									<TableHead className="text-center font-sans font-bold text-sm sm:text-base py-3 text-slate-600 dark:text-slate-200">
										Durasi
									</TableHead>
									<TableHead className="text-center font-sans font-bold text-sm sm:text-base py-3 text-slate-600 dark:text-slate-200">
										Countdown
									</TableHead>
									<TableHead className="text-right font-sans font-bold text-sm sm:text-base py-3 pr-6 text-slate-600 dark:text-slate-200">
										Status Ujian
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{currentExams.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={8}
											className="p-6 text-center text-muted-foreground"
										>
											Tidak ada ujian{" "}
											{activeTab === "online" ? "online" : "offline"} hari ini.
										</TableCell>
									</TableRow>
								) : (
									currentExams.map((exam, index) => (
										<TableRow
											key={exam.id}
											className="hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors border-b border-slate-100 dark:border-white/5"
										>
											<TableCell className="text-center font-semibold text-slate-500 dark:text-slate-400 font-sans text-sm sm:text-base py-4">
												{index + 1}
											</TableCell>
											<TableCell className="font-semibold text-slate-800 dark:text-white font-sans text-sm sm:text-base py-4">
												{exam.nama}
											</TableCell>
											<TableCell className="py-4">
												<span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/5 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 font-sans">
													<GraduationCap className="h-3.5 w-3.5 text-primary/70 dark:text-violet-400" />
													{exam.groupIds[0] && groupsMap[exam.groupIds[0]] ? groupsMap[exam.groupIds[0]] : "—"}
												</span>
											</TableCell>
											<TableCell className="font-sans text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap text-sm sm:text-base py-4">
												{exam.durasiMenit} menit
											</TableCell>
											<TableCell className="text-slate-600 dark:text-slate-300 font-semibold font-sans whitespace-nowrap text-sm sm:text-base py-4">
												<span className="flex items-center gap-2 h-14">
													<Clock className="h-4 w-4 text-primary/60 dark:text-violet-400/80" />
													{exam.beginAt
														? new Date(Number(exam.beginAt)).toLocaleTimeString(
																"id-ID",
																{ hour: "2-digit", minute: "2-digit" },
															)
														: "—"}{" "}
													—
													{exam.endAt
														? new Date(Number(exam.endAt)).toLocaleTimeString(
																"id-ID",
																{ hour: "2-digit", minute: "2-digit" },
															)
														: "—"}
												</span>
											</TableCell>
											<TableCell className="text-center text-slate-600 dark:text-slate-300 font-semibold font-sans py-4">
												<span className="inline-flex items-center gap-1.5 bg-primary/5 dark:bg-violet-500/10 px-3 py-1 rounded-lg text-primary dark:text-violet-300 text-xs sm:text-sm font-bold border border-primary/10 dark:border-violet-500/20">
													<Timer className="h-4 w-4" />
													{exam.durasiMenit} menit
												</span>
											</TableCell>
											<TableCell className="text-center py-4">
												{(() => {
													const countdown = getExamCountdown(exam.beginAt, exam.endAt, now);
													return (
														<span
															className={`inline-flex items-center text-sm font-semibold tracking-wider ${countdown.color}`}
														>
															{countdown.text}
														</span>
													);
												})()}
											</TableCell>
											<TableCell className="text-right pr-6 py-4">
												{(() => {
													const status = getExamStatus(exam.beginAt, exam.endAt, now);
													let colorClasses = "";
													if (status.text === "Ujian Sudah Berlalu") {
														colorClasses =
															"bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
													} else if (
														status.text === "Ujian Sedang Berlangsung"
													) {
														colorClasses =
															"bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20 animate-pulse";
													} else {
														colorClasses =
															"bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
													}
													return (
														<span
															className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border whitespace-nowrap ${colorClasses}`}
														>
															{status.text}
														</span>
													);
												})()}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{/* Footer/Login Button Section */}
					<div className="flex justify-center border-t border-slate-200 dark:border-white/10 pt-4">
						{activeTab === "online" ? (
							<Button
								onClick={handleOpenLoginGeneral}
								size="lg"
								className="w-full sm:w-64 cursor-pointer font-bold shadow-lg hover:shadow-violet-500/20 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-sans text-base transition-all py-6 rounded-xl border border-primary/10 dark:border-white/10"
							>
								Login untuk Ujian Online
							</Button>
						) : (
							<div className="text-center text-sm text-muted-foreground py-4">
								Ujian offline dilaksanakan di ruang yang ditentukan. Silakan
								hubungi pengawas ujian.
							</div>
						)}
					</div>
				</div>
			</main>

			<LoginModal
				isOpen={!!search.login}
				onClose={handleCloseModal}
				redirectUrl={search.redirect}
			/>
		</div>
	);
}
