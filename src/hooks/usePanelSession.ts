"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type PanelUser = {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "CUSTOMER";
  panelSections?: string[];
};

const clearClientSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("auth");
  window.localStorage.removeItem("user");
};

export const usePanelSession = () => {
  const router = useRouter();
  const [user, setUser] = useState<PanelUser | null>(null);
  const [ready, setReady] = useState(false);

  const forceLogout = useCallback(() => {
    clearClientSession();
    setUser(null);
    setReady(true);
    router.replace("/login");
  }, [router]);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/panel/session", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401) {
        forceLogout();
        return null;
      }

      const payload = await response.json();
      if (!response.ok || !payload.user) {
        forceLogout();
        return null;
      }

      const nextUser = payload.user as PanelUser;
      window.localStorage.setItem("auth", "1");
      window.localStorage.setItem("user", JSON.stringify(nextUser));
      setUser(nextUser);
      setReady(true);
      return nextUser;
    } catch {
      forceLogout();
      return null;
    }
  }, [forceLogout]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return {
    user,
    ready,
    refreshSession,
    forceLogout,
  };
};
