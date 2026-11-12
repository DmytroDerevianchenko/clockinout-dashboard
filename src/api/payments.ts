// Payments — what actually went out to people (disbursements; the
// calculation lives in payroll runs). Same endpoints as the phone's Payments
// screen. A delete is soft: the payment can be restored from "Show deleted".
import { api, apiGet } from './client';
import { tx } from '../i18n';

export type Payment = {
    id: number; payment_number: number; user_id: number; user_name: string; pay_period_id: number | null; invoice_id: number | null;
    amount_paid: number; payment_method: string | null; transaction_id: string | null;
    status: 'pending' | 'paid' | 'failed' | 'completed' | string; payment_date: string; notes: string | null; is_deleted: boolean;
};

export const paymentsApi = {
    list: (userId: number, organizationId: number, includeDeleted: boolean) =>
        apiGet<{ status: string; payments: Payment[] }>('/payments', { userId, organizationId, includeDeleted: includeDeleted ? 'true' : undefined }),
    setField: (userId: number, organizationId: number, paymentId: number, field: string, value: string) =>
        api('/update-payment', { userId, organizationId, paymentId, field, value }),
    remove: (userId: number, organizationId: number, paymentId: number) => api('/delete-payment', { userId, organizationId, paymentId }),
    recover: (userId: number, organizationId: number, paymentId: number) => api('/recover-payment', { userId, organizationId, paymentId }),
    csv: (userId: number, organizationId: number, year?: number) => api<{ status: string; csv_url?: string }>('/payments-csv', { userId, organizationId, year }),
};

export const methodLabel = (m: string | null) => {
    switch ((m ?? '').toLowerCase().replace(/[\s-]+/g, '_')) {
        case '': return '—';
        case 'e_transfer': return tx('E-transfer');
        case 'direct_deposit': return tx('Direct deposit');
        case 'cheque': case 'check': return tx('Cheque');
        case 'cash': return tx('Cash');
        case 'pay_card': return tx('Pay card');
        default: return (m ?? '').replace(/_/g, ' ');
    }
};
