// ============================================================
// client.ts — one door to the ClockInOut API
//
// Every call goes through `api()`: it adds the JSON headers and the session
// token, turns a non-2xx reply into a thrown ApiError carrying the server's
// own message and code, and signs the user out when the server says the
// token is no longer good (401). The pages never touch fetch directly, so
// the base URL, the token and the error shape live in exactly one place —
// the same rule the phones follow with their Ktor client.
// ============================================================

export const API_BASE: string =
    (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://clock-in-out-app.onrender.com';

const TOKEN_KEY = 'clockinout.token';

export function getToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

export class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Fired when the server rejects the session; the auth provider listens.
export const SESSION_LOST = 'clockinout:session-lost';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function api<T = unknown>(path: string, body?: unknown, method: Method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });

    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch { /* empty or non-JSON reply */ }

    if (res.status === 401 && token) {
        window.dispatchEvent(new Event(SESSION_LOST));
    }
    if (!res.ok) {
        throw new ApiError(res.status, (json.message as string) || `Request failed (${res.status})`, json.code as string | undefined);
    }
    return json as T;
}

/** GET with query parameters (the server reads `userId` from the query on GET). */
export function apiGet<T = unknown>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const q = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    return api<T>(`${path}${q ? `?${q}` : ''}`);
}
