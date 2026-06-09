import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { readPersistedAuthSnapshot, useAuthStore } from "@/lib/cbt/auth-store";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: ({ location }) => {
    const { user } = useAuthStore.getState();
    const persisted = readPersistedAuthSnapshot();
    const activeUser = user ?? persisted.user;
    if (!activeUser) {
      throw redirect({ to: "/login", search: { redirect: location.href } as never });
    }
    return { user: activeUser };
  },
  component: () => <Outlet />,
});
