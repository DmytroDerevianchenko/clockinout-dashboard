// Statistics — the same year summaries the phones' statistics sheets read.
// Every figure is computed by the server; nothing is summed here.
import { api, apiGet } from './client';

type Year = { year: number; available_years: number[] };
type Pdf = { status: string; pdf_url?: string; pdfUrl?: string };

export type TeamStats = Year & {
    totals: { hours: number; earned: number; shifts: number; active_members: number };
    leaderboard: { user_id: number; full_name: string; employment_type: string | null; hours: number; earned: number; shifts: number }[];
    headcount: { employment_type: string; count: number }[];
};
export type PayrollStats = Year & {
    totals: { gross: number; net: number; withheld: number; paid: number; employees: number };
    tax_components: { income_tax: number; cpp: number; ei: number; ss: number; medicare: number; other: number };
    employees: { user_id: number; full_name: string; gross: number; net: number; withheld: number; paid: number }[];
};
export type PaymentStats = Year & {
    totals: { paid: number; count: number };
    monthly: { month: number; label: string; total: number }[];
    methods: { method: string; total: number; count: number }[];
};
export type InvoiceStats = Year & {
    totals: { billed: number; paid: number; outstanding: number; overdue: number; invoice_count: number };
    by_client: { client_name: string; total: number; count: number }[];
};
export type JobStats = {
    job_id: number; job_name: string;
    totals: { hours: number; earned: number; shifts: number; workers: number };
    workers: { user_id: number; full_name: string; hours: number; earned: number; shifts: number; avg_rate: number; first_worked: string | null; last_worked: string | null }[];
};

export const statsApi = {
    team: (userId: number, organizationId: number, year?: number) => apiGet<TeamStats>('/team-stats', { userId, organizationId, year }),
    teamPdf: (userId: number, organizationId: number, year?: number) => api<Pdf>('/team-stats-pdf', { userId, organizationId, year }),
    teamCsv: (userId: number, organizationId: number, year?: number) => api<{ csv_url?: string }>('/team-csv', { userId, organizationId, year }),
    payroll: (userId: number, organizationId: number, year?: number) => apiGet<PayrollStats>('/payroll-stats', { userId, organizationId, year }),
    payrollPdf: (userId: number, organizationId: number, year?: number) => api<Pdf>('/payroll-stats-pdf', { userId, organizationId, year }),
    payments: (userId: number, organizationId: number, year?: number) => apiGet<PaymentStats>('/payment-stats', { userId, organizationId, year }),
    paymentsPdf: (userId: number, organizationId: number, year?: number) => api<Pdf>('/payment-stats-pdf', { userId, organizationId, year }),
    invoices: (userId: number, organizationId: number, year?: number) => api<InvoiceStats>('/invoices/stats', { userId, organizationId, year }),
    job: (userId: number, organizationId: number, jobId: number) => apiGet<JobStats>('/job-stats', { userId, organizationId, jobId }),
    jobPdf: (userId: number, organizationId: number, jobId: number) => api<Pdf>('/job-stats-pdf', { userId, organizationId, jobId }),
};
