// AddressSearch: type an address, press Enter (or Search), pick the match,
// and get its parts AND its coordinates — what the phones do with their
// address search.
//
// The lookup is OpenStreetMap's own geocoder (Nominatim): no API key, no
// account. Its usage rules shape this component: it must not be queried on
// every keystroke, so the search runs only when asked for (Enter / Search).
// What is typed in this one field is sent there, and nothing else. Results
// are kept to Canada and the US, and ALWAYS asked for in English: the province
// name decides the tax jurisdiction, so a browser set to another language must
// not turn "Ontario" into "Онтарио" (the trap the iPhone fell into in October).
// If the place is missing or the service is
// not answering, the fields under it can still be typed by hand.
// (Chosen 2026-11-12 after the first candidate, Photon, was found down.
// The robust upgrade is Google Places with a referrer-restricted key —
// swap the fetch below; nothing else changes.)
import { useEffect, useRef, useState } from 'react';
import { tx } from '../i18n';

export type FoundAddress = {
    label: string;            // "290 Bremner Boulevard, Toronto, Ontario"
    street: string; city: string; province: string; postalCode: string; countryCode: string;
    lat: number; lon: number;
};

type Hit = { lat: string; lon: string; display_name: string; address?: { house_number?: string; road?: string; pedestrian?: string; city?: string; town?: string; village?: string; hamlet?: string; municipality?: string; county?: string; state?: string; province?: string; postcode?: string; country_code?: string } };

function toAddress(h: Hit): FoundAddress {
    const a = h.address ?? {};
    const street = [a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(' ');
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.county ?? '';
    const province = a.state ?? a.province ?? '';
    return {
        label: [street, city, province].filter(Boolean).join(', ') || h.display_name,
        street, city, province, postalCode: a.postcode ?? '', countryCode: (a.country_code ?? 'ca').toUpperCase(),
        lat: Number(h.lat), lon: Number(h.lon),
    };
}

export default function AddressSearch({ onPick, placeholder = tx('Search for an address'), autoFocus }: { onPick: (a: FoundAddress) => void; placeholder?: string; autoFocus?: boolean }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<FoundAddress[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const ctl = useRef<AbortController | null>(null);

    async function search() {
        const text = q.trim();
        if (text.length < 4 || busy) return;
        ctl.current?.abort();
        const c = new AbortController(); ctl.current = c;
        const giveUp = window.setTimeout(() => c.abort(), 10000);     // a slow lookup must not hang the form
        setBusy(true); setFailed(false);
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=jsonv2&addressdetails=1&limit=6&countrycodes=ca,us&accept-language=en`, { signal: c.signal, headers: { Accept: 'application/json' } });
            if (!r.ok) throw new Error(tx("lookup failed"));
            const hits = (await r.json()) as Hit[];
            const seen = new Set<string>();
            setResults(hits.map(toAddress).filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon) && !seen.has(a.label) && !!seen.add(a.label)));
        } catch { setResults(null); setFailed(true); }
        finally { window.clearTimeout(giveUp); setBusy(false); }
    }

    // A click elsewhere closes the list; leaving the dialog cancels a lookup in flight.
    useEffect(() => {
        const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setResults(null); };
        document.addEventListener('mousedown', onDown);
        return () => { document.removeEventListener('mousedown', onDown); ctl.current?.abort(); };
    }, []);

    return (
        <div className="addr" ref={box}>
            <div className="inline-row">
                <input className="search" value={q} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" aria-label={tx("Search for an address")}
                    onChange={e => { setQ(e.target.value); setFailed(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } else if (e.key === 'Escape') setResults(null); }} />
                <button type="button" className="btn" disabled={busy || q.trim().length < 4} onClick={search}>{busy ? tx("Searching…") : tx("Search")}</button>
            </div>
            {results && (
                <div className="addr-list" role="listbox">
                    {results.length === 0 ? <div className="addr-none">{tx("No address found. Try adding the city, or type it in the fields below.")}</div> : results.map(a => (
                        <button key={`${a.label}-${a.lat}`} type="button" role="option" aria-selected="false" className="menu-item" onClick={() => { onPick(a); setQ(''); setResults(null); }}>
                            {a.label}{a.postalCode && <span className="faint small"> · {a.postalCode}</span>}
                        </button>
                    ))}
                </div>
            )}
            {failed && <div className="caution small" style={{ marginTop: 4 }}>{tx("The address lookup is not answering right now. Type the address in the fields below.")}</div>}
        </div>
    );
}
