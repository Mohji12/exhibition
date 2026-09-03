import { Navigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic =
    pathname === "/" || pathname.startsWith("/join") || pathname.startsWith("/e/");
  const isAdmin = pathname.startsWith("/admin");

  // Avoid mounting protected pages (and their API calls) before session hydrate.
  if (!ready) {
    if (isPublic) return children;
    return <div className="min-h-screen bg-[image:var(--gradient-brand)]" />;
  }

  if (!session && !isPublic) {
    return <Navigate to="/" />;
  }

  if (session && pathname === "/") {
    return <Navigate to={session.user.role === "Admin" ? "/admin" : "/capture"} />;
  }

  if (isAdmin && session?.user.role !== "Admin") {
    return <Navigate to="/capture" />;
  }

  return children;
}
