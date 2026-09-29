/**
 * Application context.
 *
 * Holds the two things every screen needs: the signed-in account and the public
 * operational feed. Keeping the feed here means the map, the citizen home page
 * and the agent app all read one request instead of polling the API separately.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SESSION_EXPIRED_EVENT, authApi, publicApi } from "../lib/api.js";
import { usePoll } from "../lib/hooks.js";
import { clearSession, getStoredUser, getToken, ROLES, saveSession } from "../lib/session.js";

const AppContext = createContext(null);

const REFRESH_MS = 15_000;

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [authNotice, setAuthNotice] = useState("");

  const feed = usePoll(
    async () => {
      const [config, incidents, announcements] = await Promise.all([
        publicApi.config(),
        publicApi.incidents(),
        publicApi.announcements()
      ]);
      return {
        config,
        incidents: incidents.incidents || [],
        announcements: announcements.announcements || []
      };
    },
    REFRESH_MS
  );

  /**
   * A token that the server rejects ends the session. The listener lives here so
   * every role returns to its own sign-in screen with the same message.
   */
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setAuthNotice("Your session ended or the server restarted. Please sign in again.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback((session) => {
    saveSession(session);
    setAuthNotice("");
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* a stateless token: logging out locally is enough */
    }
    clearSession();
    setUser(null);
  }, []);

  /** Re-reads the account so a deactivated login is noticed immediately. */
  const refreshUser = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const result = await authApi.me();
      if (result?.user) {
        saveSession({ user: result.user });
        setUser(result.user);
      }
      return result?.user || null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user?.role || user?.user_role || null,
      isAgent: (user?.role || user?.user_role) === ROLES.AGENT,
      isOperator: (user?.role || user?.user_role) === ROLES.OPERATOR,
      isCitizen: (user?.role || user?.user_role) === ROLES.CITIZEN,
      authNotice,
      setAuthNotice,
      signIn,
      signOut,
      refreshUser,
      config: feed.data?.config || null,
      incidents: feed.data?.incidents || [],
      announcements: feed.data?.announcements || [],
      feedLoading: feed.loading,
      feedError: feed.error,
      reloadFeed: feed.reload
    }),
    [user, authNotice, signIn, signOut, refreshUser, feed.data, feed.loading, feed.error, feed.reload]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside <AppProvider>");
  return context;
}

/** Convenience: the public config, with the server defaults until it arrives. */
export function useClusteringConfig() {
  const { config } = useApp();
  return (
    config?.clustering || {
      cluster_distance_m: 500,
      cluster_window_minutes: 30,
      min_reports_to_qualify: 1
    }
  );
}

export function useReportCategories() {
  const { config } = useApp();
  return config?.report_categories || ["Total outage", "Low voltage", "Flickering", "Sparking / unsafe line", "Meter problem", "Other"];
}
