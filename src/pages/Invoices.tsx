// Invoices: the list with client, job, dates, total and status; PDF,
// Send / Resend, Mark paid / unpaid; New, edit a draft, Copy, delete.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type InvoiceRow } from '../api/org';
import { invoicesApi } from '../api/invoices';
import { money } from '../api/payroll';
import { dateOnly } from '../api/team';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { SkeletonTable } from '../components/Skeleton';
import Dialog, { SaveFooter } from '../components/Dialog';
import InvoiceEditor from './InvoiceEditor';
import RowMenu from '../components/Menu';
import { InvoiceStatsDialog } from '../components/StatsDialog';
import { useToast } from '../components/Toast';
import { tx } from '../i18n';

export default function Invoices() {
    const { session, org } = useAuth();
    const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmSend, setConfirmSend] = useState<InvoiceRow | null>(null);
    const [editor, setEditor] = useState<{ invoiceId?: number; copyOf?: number; clientId?: number } | null>(null);
    const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid'>('all');
    const [showDeleted, setShowDeleted] = useState(false);
    const [paying, setPaying] = useState<InvoiceRow | null>(null);
    const [stats, setStats] = useState(false);
    // Clients → "New invoice" lands here with the client already chosen.
    const location = useLocation();
    const forClient = (location.state as { newForClient?: number } | null)?.newForClient;
    useEffect(() => { if (forClient) { setEditor({ clientId: forClient }); window.history.replaceState({}, ''); } }, [forClient]);

    const load = useCallback(() => {
        if (!session || !org) return;
        orgApi.invoices(session.userId, org.organization_id, undefined, showDeleted).then(r => { setInvoices(r.invoices); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : tx("Could not load invoices")));
    }, [session, org, showDeleted]);
    useEffect(() => { setInvoices(null); load(); }, [load]);

    const toast = useToast();
    const [confirmAct, setConfirmAct] = useState<{ inv: InvoiceRow; kind: 'cancel' | 'delete' } | null>(null);
    async function act(inv: InvoiceRow, kind: 'pdf' | 'send' | 'unpaid' | 'delete' | 'marksent' | 'cancel' | 'restore') {
        if (!session || !org) return;
        setBusy(`${kind}-${inv.id}`); setError(null);
        try {
            if (kind === 'pdf') { const r = await orgApi.invoicePdf(session.userId, org.organization_id, inv.id); const u = r.pdf_url ?? r.pdfUrl; if (u) window.open(u, '_blank', 'noopener'); }
            else if (kind === 'send') { await orgApi.sendInvoice(session.userId, org.organization_id, inv.id); setConfirmSend(null); load(); }
            else if (kind === 'restore') { await invoicesApi.recover(session.userId, org.organization_id, inv.id); toast(`${inv.invoice_number} restored`); load(); }
            else if (kind === 'unpaid') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'sent'); load(); }
            // Handed over on paper or sent from your own mail: sent, with no email from here.
            else if (kind === 'marksent') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'sent'); toast(tx("{0} marked as sent", inv.invoice_number)); load(); }
            else if (kind === 'cancel') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'cancelled'); setConfirmAct(null); toast(`${inv.invoice_number} cancelled`); load(); }
            else { await invoicesApi.remove(session.userId, org.organization_id, inv.id); setConfirmAct(null); toast(`${inv.invoice_number} deleted`); load(); }
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not do that")); }
        finally { setBusy(null); }
    }

    if (error && !invoices) return <div className="card danger">{error}</div>;
    if (!invoices) return <SkeletonTable rows={6} cols={7} />;
    const list = invoices.filter(i => filter === 'all' || i.status === filter);
    const outstanding = invoices.filter(i => i.status === 'sent' && !i.is_deleted).reduce((s, i) => s + Number(i.total), 0);

    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>{tx("Show")}</span>
                    <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
                        <option value="all">{tx("All")}</option><option value="draft">{tx("Drafts")}</option><option value="sent">{tx("Sent")}</option><option value="paid">{tx("Paid")}</option>
                    </select></label>
                <label className="check"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> {tx("Show deleted")}</label>
                <div className="muted small">{tx("Outstanding")} {money(outstanding)}</div>
                <span className="spacer" />
                <button className="btn" onClick={() => setStats(true)}>{tx("Statistics")}</button>
                <button className="btn btn-primary" onClick={() => setEditor({})}>{tx("New invoice")}</button>
            </div>
            {error && <p className="error-line">{error}</p>}
            <div className="card card-flush">
                {list.length === 0 ? <div className="empty">{tx("No invoices here.")}</div> : (
                    <table className="table table-hover">
                        <thead><tr><th>{tx("Number")}</th><th>{tx("Client")}</th><th>{tx("Job")}</th><th>{tx("Issued")}</th><th>{tx("Due")}</th><th>{tx("Total")}</th><th>{tx("Status")}</th><th></th></tr></thead>
                        <tbody>
                            {list.map(i => (
                                <tr key={i.id} className={i.is_deleted ? 'muted' : ''}>
                                    <td>{(i.status === 'draft' || i.status === 'sent') && !i.is_deleted ? <button className="row-link linkish" title={tx("Edit")} onClick={() => setEditor({ invoiceId: i.id })}><strong>{i.invoice_number}</strong></button> : <strong>{i.invoice_number}</strong>}{i.is_opening && <span className="pill" title={tx("A balance carried forward from before the app")}>{tx("Carried forward")}</span>}</td>
                                    <td>{i.client_name ?? '—'}</td>
                                    <td>{i.job_name ?? <span className="faint">—</span>}</td>
                                    <td>{i.status === 'draft' ? <span className="faint">{tx("on send")}</span> : dateOnly(i.issue_date)}</td>
                                    <td className={i.is_overdue ? 'danger' : ''}>{i.status === 'draft' ? <span className="faint">{tx("on send")}</span> : dateOnly(i.due_date)}</td>
                                    <td>{money(i.total)}</td>
                                    <td>{i.is_deleted ? <span className="pill danger">{tx("Deleted")}</span> : <span className={'pill' + (i.status === 'paid' ? ' live' : i.is_overdue ? ' danger' : i.status === 'draft' ? ' caution' : '')}>{i.is_overdue && i.status === 'sent' ? tx("Overdue") : tx(i.status.charAt(0).toUpperCase() + i.status.slice(1))}</span>}</td>
                                    {i.is_deleted ? <td className="actions"><button className="btn btn-sm" disabled={busy === `restore-${i.id}`} onClick={() => act(i, 'restore')}>{tx("Restore")}</button></td> : <td className="actions">
                                        <button className="btn btn-sm" disabled={busy === `pdf-${i.id}`} onClick={() => act(i, 'pdf')}>{tx("PDF")}</button>
                                        {(i.status === 'draft' || i.status === 'sent') && <button className="btn btn-sm" onClick={() => setConfirmSend(i)}>{i.status === 'draft' ? tx("Send") : tx("Resend")}</button>}
                                        {i.status === 'sent' && <button className="btn btn-sm" onClick={() => setPaying(i)}>{tx("Mark paid")}</button>}
                                        {i.status === 'paid' && <button className="btn btn-sm" disabled={busy === `unpaid-${i.id}`} onClick={() => act(i, 'unpaid')}>{tx("Mark unpaid")}</button>}
                                        <RowMenu items={[
                                            (i.status === 'draft' || i.status === 'sent') && { label: tx("Edit"), onClick: () => setEditor({ invoiceId: i.id }) },
                                            { label: tx("Duplicate"), onClick: () => setEditor({ copyOf: i.id }) },
                                            i.status === 'draft' && { label: tx("Mark as sent (no email)"), onClick: () => act(i, 'marksent') },
                                            i.status !== 'cancelled' && i.status !== 'paid' && { label: tx("Cancel invoice"), danger: true, onClick: () => setConfirmAct({ inv: i, kind: 'cancel' }) },
                                            { label: i.status === 'draft' ? tx("Delete draft") : tx("Delete"), danger: true, onClick: () => setConfirmAct({ inv: i, kind: 'delete' }) },
                                        ]} />
                                    </td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {confirmAct && (
                <Dialog title={confirmAct.kind === 'cancel' ? tx("Cancel {0}?", confirmAct.inv.invoice_number) : tx("Delete {0}?", confirmAct.inv.invoice_number)} onClose={() => setConfirmAct(null)}
                    footer={<SaveFooter onCancel={() => setConfirmAct(null)} saving={busy === `${confirmAct.kind}-${confirmAct.inv.id}`} label={confirmAct.kind === 'cancel' ? tx("Cancel invoice") : tx("Delete")} onSave={() => act(confirmAct.inv, confirmAct.kind)} />}>
                    <p className="muted">{confirmAct.kind === 'cancel' ? tx("A cancelled invoice is void: it can't be edited or sent, and its PDF prints with a CANCELLED line. The number {0} is never reused.", confirmAct.inv.invoice_number) : confirmAct.inv.status === 'draft' ? tx("The draft is removed for good.") : tx("The invoice leaves your lists and totals. It can be restored from the app (Invoices → deleted).")}</p>
                </Dialog>
            )}
            {stats && <InvoiceStatsDialog onClose={() => setStats(false)} />}
            {paying && <MarkPaidDialog invoice={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); toast(tx("{0} marked paid", paying.invoice_number)); load(); }} />}
            {editor && <InvoiceEditor invoiceId={editor.invoiceId} copyOf={editor.copyOf} clientId={editor.clientId} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />}
            {confirmSend && (
                <Dialog title={tx("Send {0}?", confirmSend.invoice_number)} subtitle={tx('{0} to {1}.', money(confirmSend.total), confirmSend.client_name ?? tx('the client')) + ' ' + (confirmSend.status === 'draft' ? tx('The issue and due dates become today and the client’s terms.') : tx('The client receives the PDF again.'))} onClose={() => setConfirmSend(null)}
                    footer={<SaveFooter onCancel={() => setConfirmSend(null)} label={tx("Send")} saving={busy === `send-${confirmSend.id}`} onSave={() => act(confirmSend, 'send')} />}>
                    <p className="muted">{tx("The email goes from invoices@clockinout.ca with your email as the reply address.")}</p>
                </Dialog>
            )}
        </>
    );
}

// How and when the client paid — the phone asks the same two things.
function MarkPaidDialog({ invoice, onClose, onDone }: { invoice: InvoiceRow; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [method, setMethod] = useState('e_transfer');
    const [date, setDate] = useState(() => { const d = new Date(); const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function save() {
        if (!session || !org || !date) return;
        setSaving(true); setError(null);
        try { await orgApi.setInvoiceStatus(session.userId, org.organization_id, invoice.id, 'paid', method, date); onDone(); }
        catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); setSaving(false); }
    }
    return (
        <Dialog title={tx("Mark {0} as paid", invoice.invoice_number)} subtitle={tx('{0} from {1}.', money(invoice.total), invoice.client_name ?? tx('the client'))} onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label={tx("Mark paid")} disabled={!date} />}>
            <label className="field"><span>{tx("Paid by")}</span>
                <select value={method} onChange={e => setMethod(e.target.value)}>
                    <option value="e_transfer">{tx("E-transfer")}</option><option value="cheque">{tx("Cheque")}</option><option value="cash">{tx("Cash")}</option><option value="card">{tx("Card")}</option><option value="other">{tx("Other")}</option>
                </select></label>
            <label className="field"><span>{tx("Date paid")}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
