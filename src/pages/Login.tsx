// Sign in: email + password against /login, or Google through Google
// Identity Services when a web client id is configured (VITE_GOOGLE_CLIENT_ID;
// the origin must be authorized in Google Cloud Console). Same accounts as
// the phones — there is nothing to create here.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { ApiError } from '../api/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
                    renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
                };
            };
        };
    }
}

export default function Login() {
    const { signIn, signInWithGoogle } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const googleRef = useRef<HTMLDivElement>(null);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true); setError(null);
        try { await signIn(email.trim(), password); }
        catch (err) { setError(err instanceof ApiError ? err.message : 'Could not sign in'); }
        finally { setBusy(false); }
    }

    // Google button: load the GIS script once, render into the slot.
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || !googleRef.current) return;
        const render = () => {
            if (!window.google || !googleRef.current) return;
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: async r => {
                    setError(null);
                    try { await signInWithGoogle(r.credential); }
                    catch (err) { setError(err instanceof ApiError ? err.message : 'Google sign-in failed'); }
                },
            });
            window.google.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', width: 344, text: 'continue_with' });
        };
        if (window.google) { render(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = render;
        document.head.appendChild(s);
    }, [signInWithGoogle]);

    return (
        <div className="login-wrap">
            <form className="login-card" onSubmit={submit}>
                <div className="brand"><div className="brand-mark">C</div><div className="brand-name">ClockInOut</div></div>
                <h2>Sign in</h2>
                <p className="muted">The same account you use in the app.</p>
                <label className="field"><span>Email</span>
                    <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
                </label>
                <label className="field"><span>Password</span>
                    <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
                </label>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                {error && <p className="error-line">{error}</p>}
                {GOOGLE_CLIENT_ID && (
                    <>
                        <div className="divider">or</div>
                        <div ref={googleRef} />
                    </>
                )}
            </form>
        </div>
    );
}
