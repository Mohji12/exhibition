import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PageLoader } from "@/components/PageLoader";
import { clearSession, readSession, writeSession } from "@/lib/auth-session";
import type { AuthSession } from "@/lib/types";

type AuthValue = {
  session: AuthSession | null;
  ready: boolean;
  setSession: (session: AuthSession) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionState(readSession());
    setReady(true);

    const onUnauthorized = () => {
      clearSession();
      setSessionState(null);
    };
    window.addEventListener("conninter:unauthorized", onUnauthorized);
    return () => window.removeEventListener("conninter:unauthorized", onUnauthorized);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      setSession: (next) => {
        writeSession(next);
        setSessionState(next);
      },
      logout: () => {
        clearSession();
        setSessionState(null);
      },
    }),
    [session, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Hard redirect avoids TanStack Router startTransition loops with guarded routes. */
function hardRedirect(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  window.location.replace(path);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic =
    pathname === "/" || pathname.startsWith("/join") || pathname.startsWith("/e/");
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    if (!ready) return;

    if (!session && !isPublic) {
      hardRedirect("/");
      return;
    }

    if (session && pathname === "/") {
      hardRedirect(session.user.role === "Admin" ? "/admin" : "/capture");
      return;
    }

    if (isAdmin && session && session.user.role !== "Admin") {
      hardRedirect("/capture");
    }
  }, [ready, session, pathname, isPublic, isAdmin]);

  if (!ready) {
    if (isPublic) return children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Signing you in…" />
      </div>
    );
  }

  if (!session && !isPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Redirecting…" />
      </div>
    );
  }

  if (session && pathname === "/") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Opening booth…" />
      </div>
    );
  }

  if (isAdmin && session?.user.role !== "Admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Redirecting…" />
      </div>
    );
  }

  return children;
}
