// The invoice draft editor: client, job, line items, tax, dates, notes,
// terms. New, edit, or copy (Dmytro's way: a project's invoices prepared up
// front as drafts and sent stage by stage — a draft's dates move to the day
// it is sent, so blank dates are the normal case).
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { clientsApi, invoicesApi, type Client, type InvoiceInput, type InvoiceItem } from '../api/invoices';
import { jobsApi, type Job } from '../api/jobs';
import { money } from '../api/payroll';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import { ClientDialog } from './Clients';

type Line = { description: string; quantity: string; unit: string; unitPrice: string };
const r2 = (v: number) => Math.round(v * 100) / 100;
const emptyLine = (): Line => ({ description: '', quantity: '1', unit: 'LS', unitPrice: '' });

export default function InvoiceEditor({ invoiceId, copyOf, onClose, onDone }: { invoiceId?: number; copyOf?: number; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [clientId, setClientId] = useState<number | ''>('');
    const [jobId, setJobId] = useState<number | ''>('');
    const [lines, setLines] = useState<Line[]>([emptyLine()]);
    const [taxRate, setTaxRate] = useState('13');
    const [issueDate, setIssueDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');
    const [terms, setTerms] = useState('');
    const [loaded, setLoaded] = useState(!invoiceId && !copyOf);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newClient, setNewClient] = useState(false);

    useEffect(() => {
        if (!session || !org) return;
        Promise.all([clientsApi.list(session.userId, org.organization_id), jobsApi.list(session.userId, org.organization_id)]).then(async ([c, j]) => {
            setClients(c.clients.filter(x => !x.is_deleted)); setJobs(j.jobs.filter(x => !x.archived));
            const src = invoiceId ?? copyOf;
            if (src) {
                const r = await invoicesApi.get(session.userId, org.organization_id, src);
                const inv = r.invoice;
                setClientId(inv.client_id); setJobId(inv.job_id ?? '');
                setLines(inv.items.map(it => ({ description: it.description, quantity: String(Number(it.quantity)), unit: it.unit ?? '', unitPrice: String(Number(it.unit_price)) })));
                setTaxRate(String(r2(Number(inv.tax_rate) * 100)));
                if (invoiceId) { setIssueDate((inv.issue_date ?? '').slice(0, 10)); setDueDate((inv.due_date ?? '').slice(0, 10)); }
                setNotes(inv.notes ?? ''); setTerms(inv.terms ?? '');
            }
            setLoaded(true);
        }).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load'));
    }, [session, org, invoiceId, copyOf]);

    // A newly chosen client brings its tax rate and terms (not when editing an existing draft's client).
    const client = clients.find(c => c.id === clientId);
    const subtotal = useMemo(() => r2(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)), [lines]);
    const tax = r2(subtotal * ((Number(taxRate) || 0) / 100));
    const total = r2(subtotal + tax);
    const setLine = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

    async function save() {
        if (!session || !org || clientId === '') return;
        setSaving(true); setError(null);
        const items: InvoiceItem[] = lines.filter(l => l.description.trim()).map(l => ({ description: l.description.trim(), quantity: Number(l.quantity) || 0, unit: l.unit.trim() || null, unitPrice: Number(l.unitPrice) || 0 }));
        if (items.length === 0) { setError('Add at least one line.'); setSaving(false); return; }
        const body: InvoiceInput = {
            clientId: Number(clientId), jobId: jobId === '' ? null : Number(jobId), items, taxRate: (Number(taxRate) || 0) / 100,
            issueDate: issueDate || null, dueDate: dueDate || null, notes: notes.trim() || null, terms: terms.trim() || null, currencyCode: 'CAD',
        };
        try {
            if (invoiceId) await invoicesApi.update(session.userId, org.organization_id, invoiceId, body);
            else await invoicesApi.create(session.userId, org.organization_id, body);
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    return (
        <Dialog title={invoiceId ? 'Edit draft' : copyOf ? 'Copy of invoice' : 'New invoice'} wide onClose={onClose}
            subtitle="Saved as a draft. Leave the dates blank: they become the day you send it and the client's terms."
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!loaded || clientId === ''} label={invoiceId ? 'Save' : 'Create draft'} />}>
            {!loaded ? <p className="muted">Loading…</p> : (
                <>
                    <div className="grid-2">
                        <label className="field"><span>Client</span>
                            <div className="inline-row">
                                <select value={clientId} onChange={e => { const id = e.target.value === '' ? '' : Number(e.target.value); setClientId(id); const c = clients.find(x => x.id === id); if (c && !invoiceId) { if (c.default_tax_rate != null) setTaxRate(String(r2(Number(c.default_tax_rate) * 100))); } }}>
                                    <option value="">Choose a client</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                                </select>
                                <button type="button" className="btn btn-sm" onClick={() => setNewClient(true)}>New</button>
                            </div>
                            {client && !client.email && <small className="caution">This client has no email; add one before sending.</small>}
                        </label>
                        <label className="field"><span>Job (optional)</span>
                            <select value={jobId} onChange={e => setJobId(e.target.value === '' ? '' : Number(e.target.value))}>
                                <option value="">No job</option>
                                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                            </select>
                        </label>
                    </div>

                    <div className="eyebrow nopad">Items</div>
                    <table className="table lines">
                        <thead><tr><th>Description</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 70 }}>Unit</th><th style={{ width: 120 }}>Unit price</th><th style={{ width: 110 }}>Amount</th><th /></tr></thead>
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={i}>
                                    <td><textarea rows={2} value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Framing services – Stage 2 of 4" /></td>
                                    <td><input inputMode="decimal" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value.replace(/[^0-9.]/g, ''))} /></td>
                                    <td><input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} /></td>
                                    <td><input inputMode="decimal" value={l.unitPrice} onChange={e => setLine(i, 'unitPrice', e.target.value.replace(/[^0-9.]/g, ''))} /></td>
                                    <td>{money((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</td>
                                    <td><button type="button" className="btn btn-sm" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyLine()])}>×</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button type="button" className="btn btn-sm" onClick={() => setLines(ls => [...ls, emptyLine()])}>Add a line</button>

                    <div className="grid-2" style={{ marginTop: 14 }}>
                        <label className="field"><span>Tax rate (%)</span><input inputMode="decimal" value={taxRate} onChange={e => setTaxRate(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                        <div className="field"><span>Totals</span>
                            <div className="rvalue">Subtotal {money(subtotal)} · Tax {money(tax)} · <strong>Total {money(total)}</strong></div></div>
                        <label className="field"><span>Issue date</span><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /><small className="muted">Blank = the day it is sent.</small></label>
                        <label className="field"><span>Due date</span><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /><small className="muted">Blank = issue date + {client?.payment_terms_days ?? 30} days.</small></label>
                    </div>
                    <label className="field"><span>Notes (printed on the invoice)</span><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
                    <label className="field"><span>Terms</span><input value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payable within 30 days by e-transfer." /></label>
                    {error && <p className="error-line">{error}</p>}
                </>
            )}
            {newClient && <ClientDialog client={null} onClose={() => setNewClient(false)} onDone={created => { setNewClient(false); if (created) { setClients(cs => [...cs, created]); setClientId(created.id); } }} />}
        </Dialog>
    );
}
