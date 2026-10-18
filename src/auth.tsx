// ============================================================
// auth.tsx — who is signed in, and which organization they are looking at
//
// The session is what /login (or /auth-google) returns: the token, the
// person, and the organizations they belong to with their role in each.
// It is kept in localStorage so a refresh does not sign anyone out (the
// token lasts 30 days, server-side). The current organization is the
// server's default unless the switcher changed it — remembered too.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, getToken, SESSION_LOST } from './api/client';

export type Membership = { organization_id: number; name: string; role: 'employer' | 'employee' | 'accountant'; is_admin: boolean };
export type Session = {
    token: string;
    userId: number;
    email: string;
    fullName: string | null;
    organizations: Membership[];
    defaultOrganizationId: number | null;
};
type LoginReply = {
    status: string; token: string; userId: number; email: string; full_name?: string | null;
    organizations: Membership[]; defaultOrganizationId?: number | null;
};

const SESSION_KEY = 'clockinout.session';
const ORG_KEY     = 'clockinout.org';

function loadSession(): Session | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw || !getToken()) return null;
        return JSON.parse(raw) as Session;
    } catch { return null; }
}

type Auth = {
    session: Session | null;
    org: Membership | null;
    /** Employer or admin in the current org — the dashboard is for them. */
    canManage: boolean;
    setOrgId: (id: number) => void;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: (idToken: string) => Promise<void>;
    signOut: () => void;
};
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(loadSession);
    const [orgId, setOrgIdState] = useState<number | null>(() => {
        try { const v = localStorage.getItem(ORG_KEY); return v ? Number(v) : null; } catch { return null; }
    });

    const adopt = useCallback((r: LoginReply) => {
        const s: Session = {
            token: r.token, userId: r.userId, email: r.email, fullName: r.full_name ?? null,
            organizations: r.organizations ?? [], defaultOrganizationId: r.defaultOrganizationId ?? null,
        };
        setToken(s.token);
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
        setSession(s);
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        adopt(await api<LoginReply>('/login', { email, password }));
    }, [adopt]);

    const signInWithGoogle = useCallback(async (idToken: string) => {
        adopt(await api<LoginReply>('/auth-google', { idToken }));
    }, [adopt]);

    const signOut = useCallback(() => {
        setToken(null);
        try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        setSession(null);
    }, []);

    // The API client fires this when the server says the token is dead.
    useEffect(() => {
        const onLost = () => signOut();
        window.addEventListener(SESSION_LOST, onLost);
        return () => window.removeEventListener(SESSION_LOST, onLost);
    }, [signOut]);

    const setOrgId = useCallback((id: number) => {
        setOrgIdState(id);
        try { localStorage.setItem(ORG_KEY, String(id)); } catch { /* ignore */ }
    }, []);

    const org = useMemo(() => {
        if (!session) return null;
        const list = session.organizations;
        return list.find(o => o.organization_id === orgId)
            ?? list.find(o => o.organization_id === session.defaultOrganizationId)
            ?? list[0] ?? null;
    }, [session, orgId]);

    const canManage = !!org && (org.role === 'employer' || org.is_admin);

    const value = useMemo<Auth>(() => ({ session, org, canManage, setOrgId, signIn, signInWithGoogle, signOut }),
        [session, org, canManage, setOrgId, signIn, signInWithGoogle, signOut]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth outside AuthProvider');
    return ctx;
}
