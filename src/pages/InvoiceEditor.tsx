// The invoice draft editor: client, job, line items, tax, dates, notes,
// terms. New, edit, or copy.
//
// DATES. A new invoice (or a copy) opens dated TODAY, due by the client's
// terms — what the phones do. Dmytro's way is a project's invoices prepared
// up front as drafts and sent stage by stage; the server takes care of that:
// a draft sent on a later day is re-dated to that day and the due date
// moves by the same number of days (services/invoice.service.js,
// rollDraftDates). So the dates shown here are "if you sent it today".
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { clientsApi, invoicesApi, type Client, type InvoiceInput, type InvoiceItem } from '../api/invoices';
import { jobsApi, type Job } from '../api/jobs';
import { money } from '../api/payroll';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import { SkeletonLines } from '../components/Skeleton';
import { ClientDialog } from './Clients';
import { tx } from '../i18n';

type Line = { description: string; quantity: string; unit: string; unitPrice: string };
const r2 = (v: number) => Math.round(v * 100) / 100;
const emptyLine = (): Line => ({ description: '', quantity: '1', unit: 'LS', unitPrice: '' });
// Today on THIS computer's calendar, as YYYY-MM-DD ('en-CA' writes dates that way).
const today = () => new Date().toLocaleDateString('en-CA');
const addDays = (iso: string, days: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const termsDays = (c?: Client) => c?.payment_terms_days ?? 30;

export default function InvoiceEditor({ invoiceId, copyOf, clientId: startClient, onClose, onDone }: { invoiceId?: number; copyOf?: number; clientId?: number; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [clientId, setClientId] = useState<number | ''>(startClient ?? '');
    const [jobId, setJobId] = useState<number | ''>('');
    const [lines, setLines] = useState<Line[]>([emptyLine()]);
    const [taxRate, setTaxRate] = useState('13');
    // New and copy: today. An existing draft: what it was saved with (set when it loads).
    const [issueDate, setIssueDate] = useState(invoiceId ? '' : today());
    const [dueDate, setDueDate] = useState('');
    // Once the due date is set by hand here, an issue-date change leaves it alone;
    // until then it follows the issue date by the client's terms.
    const [dueTouched, setDueTouched] = useState(false);
    const [notes, setNotes] = useState('');
    const [terms, setTerms] = useState('');
    const [loaded, setLoaded] = useState(!invoiceId && !copyOf);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newClient, setNewClient] = useState(false);

    useEffect(() => {
        if (!session || !org) return;
        Promise.all([clientsApi.list(session.userId, org.organization_id), jobsApi.list(session.userId, org.organization_id)]).then(async ([c, j]) => {
            const live = c.clients.filter(x => !x.is_deleted);
            setClients(live); setJobs(j.jobs.filter(x => !x.archived));
            const src = invoiceId ?? copyOf;
            // New, with the client already chosen (Clients → New invoice): due by that client's terms.
            if (!src) setDueDate(addDays(today(), termsDays(live.find(x => x.id === startClient))));
            if (src) {
                const r = await invoicesApi.get(session.userId, org.organization_id, src);
                const inv = r.invoice;
                setClientId(inv.client_id); setJobId(inv.job_id ?? '');
                setLines(inv.items.map(it => ({ description: it.description, quantity: String(Number(it.quantity)), unit: it.unit ?? '', unitPrice: String(Number(it.unit_price)) })));
                setTaxRate(String(r2(Number(inv.tax_rate) * 100)));
                if (invoiceId) { setIssueDate((inv.issue_date ?? '').slice(0, 10)); setDueDate((inv.due_date ?? '').slice(0, 10)); }
                // A copy is a NEW invoice: today, and due by its client's terms — not the original's dates.
                else setDueDate(addDays(today(), termsDays(live.find(x => x.id === inv.client_id))));
                setNotes(inv.notes ?? ''); setTerms(inv.terms ?? '');
            }
            setLoaded(true);
        }).catch(e => setError(e instanceof ApiError ? e.message : tx("Could not load")));
    }, [session, org, invoiceId, copyOf, startClient]);

    // A newly chosen client brings its tax rate and terms (not when editing an existing draft's client).
    const client = clients.find(c => c.id === clientId);
    const subtotal = useMemo(() => r2(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)), [lines]);
    const tax = r2(subtotal * ((Number(taxRate) || 0) / 100));
    const total = r2(subtotal + tax);
    const setLine = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const onIssueDate = (v: string) => {
        setIssueDate(v);
        if (dueTouched || !v) return;
        setDueDate(addDays(v, termsDays(client)));
    };
    // The wording offered for the Terms line. It follows the chosen client
    // (45 days for a 45-day client) — it used to say 30 for everyone.
    const termsHint = tx("Payable within {0} days by e-transfer.", termsDays(client));

    async function save() {
        if (!session || !org || clientId === '') return;
        setSaving(true); setError(null);
        const items: InvoiceItem[] = lines.filter(l => l.description.trim()).map(l => ({ description: l.description.trim(), quantity: Number(l.quantity) || 0, unit: l.unit.trim() || null, unitPrice: Number(l.unitPrice) || 0 }));
        if (items.length === 0) { setError(tx("Add at least one line.")); setSaving(false); return; }
        const body: InvoiceInput = {
            clientId: Number(clientId), jobId: jobId === '' ? null : Number(jobId), items, taxRate: (Number(taxRate) || 0) / 100,
            issueDate: issueDate || null, dueDate: dueDate || null, notes: notes.trim() || null, terms: terms.trim() || null, currencyCode: 'CAD',
        };
        try {
            if (invoiceId) await invoicesApi.update(session.userId, org.organization_id, invoiceId, body);
            else await invoicesApi.create(session.userId, org.organization_id, body);
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); setSaving(false); }
    }

    return (
        <Dialog title={invoiceId ? tx("Edit draft") : copyOf ? tx("Copy of invoice") : tx("New invoice")} xwide onClose={onClose}
            subtitle={tx("Saved as a draft. If you send it on a later day, the dates move with it: the client gets the same number of days to pay.")}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!loaded || clientId === ''} label={invoiceId ? tx("Save") : tx("Create draft")} />}>
            {!loaded ? <SkeletonLines n={4} /> : (
                <>
                    <div className="grid-2">
                        <label className="field"><span>{tx("Client")}</span>
                            <div className="inline-row">
                                <select value={clientId} onChange={e => { const id = e.target.value === '' ? '' : Number(e.target.value); setClientId(id); const c = clients.find(x => x.id === id); if (c && !invoiceId) { if (c.default_tax_rate != null) setTaxRate(String(r2(Number(c.default_tax_rate) * 100))); }
                                    /* the due date follows the new client's terms, unless it was set by hand */
                                    if (c && !dueTouched && issueDate) setDueDate(addDays(issueDate, termsDays(c))); }}>
                                    <option value="">{tx("Choose a client")}</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                                </select>
                                <button type="button" className="btn btn-sm" onClick={() => setNewClient(true)}>{tx("New")}</button>
                            </div>
                            {client && !client.email && <small className="caution">{tx("This client has no email; add one before sending.")}</small>}
                        </label>
                        <label className="field"><span>{tx("Job (optional)")}</span>
                            <select value={jobId} onChange={e => setJobId(e.target.value === '' ? '' : Number(e.target.value))}>
                                <option value="">{tx("No job")}</option>
                                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                            </select>
                        </label>
                    </div>

                    <div className="eyebrow nopad">{tx("Items")}</div>
                    <table className="table lines">
                        <thead><tr><th>{tx("Description")}</th><th style={{ width: 80 }}>{tx("Qty")}</th><th style={{ width: 70 }}>{tx("Unit")}</th><th style={{ width: 120 }}>{tx("Unit price")}</th><th style={{ width: 110 }}>{tx("Amount")}</th><th /></tr></thead>
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={i}>
                                    <td><textarea rows={2} value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder={tx("Framing services – Stage 2 of 4")} /></td>
                                    <td><input inputMode="decimal" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value.replace(/[^0-9.]/g, ''))} /></td>
                                    <td><input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} /></td>
                                    <td><input inputMode="decimal" value={l.unitPrice} onChange={e => setLine(i, 'unitPrice', e.target.value.replace(/[^0-9.]/g, ''))} /></td>
                                    <td>{money((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</td>
                                    <td><button type="button" className="btn btn-sm" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyLine()])}>×</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button type="button" className="btn btn-sm" onClick={() => setLines(ls => [...ls, emptyLine()])}>{tx("Add a line")}</button>

                    <div className="grid-2" style={{ marginTop: 14 }}>
                        <label className="field"><span>{tx("Tax rate (%)")}</span><input inputMode="decimal" value={taxRate} onChange={e => setTaxRate(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                        <div className="field"><span>{tx("Totals")}</span>
                            <div className="rvalue">{tx("Subtotal")} {money(subtotal)} {tx("· Tax")} {money(tax)} · <strong>{tx("Total")} {money(total)}</strong></div></div>
                        <label className="field"><span>{tx("Issue date")}</span><input type="date" value={issueDate} onChange={e => onIssueDate(e.target.value)} /><small className="muted">{tx("If you send it on a later day, it moves to that day.")}</small></label>
                        <label className="field"><span>{tx("Due date")}</span><input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); setDueTouched(true); }} /><small className="muted">{tx("Issue date + {0} days (the client’s terms).", termsDays(client))}</small></label>
                    </div>
                    <label className="field"><span>{tx("Notes (printed on the invoice)")}</span><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
                    {/* Terms is a line of free text printed at the bottom of the invoice.
                        The grey text is only a SUGGESTION — nothing is printed until
                        something is typed. → (with the field empty) accepts it. */}
                    <label className="field"><span>{tx("Terms")}</span>
                        <input value={terms} onChange={e => setTerms(e.target.value)} placeholder={termsHint}
                            onKeyDown={e => { if (e.key === 'ArrowRight' && terms === '') { e.preventDefault(); setTerms(termsHint); } }} />
                        <small className="muted">{tx("Optional. Printed on the invoice under “Payment terms”. Press → to use the suggestion; leave it blank to print nothing.")}</small>
                    </label>
                    {error && <p className="error-line">{error}</p>}
                </>
            )}
            {newClient && <ClientDialog client={null} onClose={() => setNewClient(false)} onDone={created => { setNewClient(false); if (created) { setClients(cs => [...cs, created]); setClientId(created.id); } }} />}
        </Dialog>
    );
}
