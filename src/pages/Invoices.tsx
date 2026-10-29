// Invoices: the list with client, job, dates, total and status; PDF,
// Send / Resend, Mark paid / unpaid; New, edit a draft, Copy, delete.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type InvoiceRow } from '../api/org';
import { invoicesApi } from '../api/invoices';
import { money } from '../api/payroll';
import { dateOnly } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import InvoiceEditor from './InvoiceEditor';

export default function Invoices() {
    const { session, org } = useAuth();
    const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmSend, setConfirmSend] = useState<InvoiceRow | null>(null);
    const [editor, setEditor] = useState<{ invoiceId?: number; copyOf?: number } | null>(null);
    const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid'>('all');

    const load = useCallback(() => {
        if (!session || !org) return;
        orgApi.invoices(session.userId, org.organization_id).then(r => { setInvoices(r.invoices.filter(i => !i.is_deleted)); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load invoices'));
    }, [session, org]);
    useEffect(() => { setInvoices(null); load(); }, [load]);

    async function act(inv: InvoiceRow, kind: 'pdf' | 'send' | 'paid' | 'unpaid' | 'delete') {
        if (!session || !org) return;
        setBusy(`${kind}-${inv.id}`); setError(null);
        try {
            if (kind === 'pdf') { const r = await orgApi.invoicePdf(session.userId, org.organization_id, inv.id); const u = r.pdf_url ?? r.pdfUrl; if (u) window.open(u, '_blank', 'noopener'); }
            else if (kind === 'send') { await orgApi.sendInvoice(session.userId, org.organization_id, inv.id); setConfirmSend(null); load(); }
            else if (kind === 'paid') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'paid', 'e-transfer', new Date().toISOString().slice(0, 10)); load(); }
            else if (kind === 'unpaid') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'sent'); load(); }
            else { await invoicesApi.remove(session.userId, org.organization_id, inv.id); load(); }
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not do that'); }
        finally { setBusy(null); }
    }

    if (error && !invoices) return <div className="card danger">{error}</div>;
    if (!invoices) return <div className="card muted">Loading…</div>;
    const list = invoices.filter(i => filter === 'all' || i.status === filter);
    const outstanding = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.total), 0);

    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>Show</span>
                    <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
                        <option value="all">All</option><option value="draft">Drafts</option><option value="sent">Sent</option><option value="paid">Paid</option>
                    </select></label>
                <div className="muted small">Outstanding {money(outstanding)}</div>
                <span className="spacer" />
                <button className="btn btn-primary" onClick={() => setEditor({})}>New invoice</button>
            </div>
            {error && <p className="error-line">{error}</p>}
            <div className="card card-flush">
                {list.length === 0 ? <div className="empty">No invoices here.</div> : (
                    <table className="table table-hover">
                        <thead><tr><th>Number</th><th>Client</th><th>Job</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th><th></th></tr></thead>
                        <tbody>
                            {list.map(i => (
                                <tr key={i.id}>
                                    <td>{i.status === 'draft' ? <button className="row-link linkish" onClick={() => setEditor({ invoiceId: i.id })}><strong>{i.invoice_number}</strong></button> : <strong>{i.invoice_number}</strong>}</td>
                                    <td>{i.client_name ?? '—'}</td>
                                    <td>{i.job_name ?? <span className="faint">—</span>}</td>
                                    <td>{i.status === 'draft' ? <span className="faint">on send</span> : dateOnly(i.issue_date)}</td>
                                    <td className={i.is_overdue ? 'danger' : ''}>{i.status === 'draft' ? <span className="faint">on send</span> : dateOnly(i.due_date)}</td>
                                    <td>{money(i.total)}</td>
                                    <td><span className={'pill' + (i.status === 'paid' ? '' : i.is_overdue ? ' danger' : i.status === 'draft' ? ' caution' : '')}>{i.is_overdue && i.status === 'sent' ? 'Overdue' : i.status}</span></td>
                                    <td className="actions">
                                        <button className="btn btn-sm" disabled={busy === `pdf-${i.id}`} onClick={() => act(i, 'pdf')}>PDF</button>
                                        {(i.status === 'draft' || i.status === 'sent') && <button className="btn btn-sm" onClick={() => setConfirmSend(i)}>{i.status === 'draft' ? 'Send' : 'Resend'}</button>}
                                        {i.status === 'sent' && <button className="btn btn-sm" disabled={busy === `paid-${i.id}`} onClick={() => act(i, 'paid')}>Mark paid</button>}
                                        {i.status === 'paid' && <button className="btn btn-sm" disabled={busy === `unpaid-${i.id}`} onClick={() => act(i, 'unpaid')}>Mark unpaid</button>}
                                        <button className="btn btn-sm" onClick={() => setEditor({ copyOf: i.id })}>Copy</button>
                                        {i.status === 'draft' && <button className="btn btn-sm" disabled={busy === `delete-${i.id}`} onClick={() => { if (confirm(`Delete draft ${i.invoice_number}?`)) act(i, 'delete'); }}>Delete</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {editor && <InvoiceEditor invoiceId={editor.invoiceId} copyOf={editor.copyOf} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />}
            {confirmSend && (
                <Dialog title={`Send ${confirmSend.invoice_number}?`} subtitle={`${money(confirmSend.total)} to ${confirmSend.client_name ?? 'the client'}. ${confirmSend.status === 'draft' ? 'The issue and due dates become today and the client’s terms.' : 'The client receives the PDF again.'}`} onClose={() => setConfirmSend(null)}
                    footer={<SaveFooter onCancel={() => setConfirmSend(null)} label="Send" saving={busy === `send-${confirmSend.id}`} onSave={() => act(confirmSend, 'send')} />}>
                    <p className="muted">The email goes from invoices@clockinout.ca with your email as the reply address.</p>
                </Dialog>
            )}
        </>
    );
}
