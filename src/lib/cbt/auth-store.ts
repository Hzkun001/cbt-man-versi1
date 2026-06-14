import { create } from "zustand";
import { hydrateRepos } from "./repos";
import { loginServer, logoutServer, validateSessionServer } from "@/lib/server/repos/functions";
import type { Role, User } from "./types";

type AuthState = {
  userId: string | null;
  user: User | null;
  setUser: (user: User | null) => void;
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; role?: Role }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Tidak ada lagi persist localStorage. Cookie httpOnly + row Session
// (src/lib/server/db/session.ts) adalah single source of truth autentikasi.
// Store ini hanya cache render, diisi oleh `validateSessionServer` di beforeLoad.
export const useAuthStore = create<AuthState>()((set, get) => ({
  userId: null,
  user: null,
  setUser: (user) => set({ user, userId: user?.id ?? null }),
  login: async (username, password) => {
    await hydrateRepos();
    const res = await loginServer({ data: { username, password } });
    if (!res.ok) return res;
    set({ userId: res.user.id, user: res.user });
    return { ok: true, role: res.user.role };
  },
  logout: async () => {
    // Invalidasi sesi server-side (hapus row Session + clear cookie) sebelum clear state client.
    try {
      await logoutServer();
    } catch (err) {
      // Cookie/Session server mungkin masih aktif; tetap clear state client + log (spec I/O matrix).
      console.error("logoutServer gagal; sesi mungkin masih aktif", err);
    }
    set({ userId: null, user: null });
  },
  refresh: async () => {
    // Re-validasi otoritatif dari server (cookie → Session) dan perbarui cache render.
    try {
      const { user } = await validateSessionServer();
      get().setUser(user);
    } catch {
      get().setUser(null);
    }
  },
}));
