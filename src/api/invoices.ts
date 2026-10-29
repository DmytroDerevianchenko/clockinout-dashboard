// Clients and invoice drafts — the write side of invoicing, same bodies as
// the phones. Money on the wire is numbers; dates are 'YYYY-MM-DD' or null
// (null issue date = today on the server, null due date = the client's terms).
import { api } from './client';

export type Client = {
    id: number; company_name: string; contact_name: string | null; email: string | null; cc_emails: string[] | null; phone: string | null;
    street: string | null; unit_number: string | null; city: string | null; state_province: string | null; postal_code: string | null; country_code: string | null;
    default_tax_rate: number | string | null; payment_terms_days: number | null; notes: string | null; is_deleted: boolean; invoice_count?: number;
};
export type ClientInput = {
    companyName: string; contactName?: string | null; email?: string | null; ccEmails?: string[]; phone?: string | null;
    street?: string | null; unitNumber?: string | null; city?: string | null; stateProvince?: string | null; postalCode?: string | null; countryCode?: string | null;
    defaultTaxRate?: number | null; paymentTermsDays?: number | null; notes?: string | null;
};
export type InvoiceItem = { description: string; quantity: number; unit?: string | null; unitPrice: number };
export type InvoiceInput = {
    clientId: number; jobId?: number | null; issueDate?: string | null; dueDate?: string | null;
    items: InvoiceItem[]; taxRate: number; notes?: string | null; terms?: string | null; currencyCode?: string | null;
};
export type InvoiceDetail = {
    id: number; invoice_number: string; status: string; client_id: number; job_id: number | null; issue_date: string; due_date: string | null;
    tax_rate: number | string; notes: string | null; terms: string | null; currency_code: string | null;
    items: { id: number; position: number; description: string; quantity: number | string; unit: string | null; unit_price: number | string; amount: number | string }[];
};

export const clientsApi = {
    list: (userId: number, organizationId: number) => api<{ status: string; clients: Client[] }>('/clients/list', { userId, organizationId }),
    create: (userId: number, organizationId: number, c: ClientInput) => api<{ status: string; client?: Client }>('/clients/create', { userId, organizationId, ...c }),
    update: (userId: number, organizationId: number, clientId: number, c: ClientInput) => api('/clients/update', { userId, organizationId, clientId, ...c }),
    remove: (userId: number, organizationId: number, clientId: number) => api('/clients/delete', { userId, organizationId, clientId }),
};

export const invoicesApi = {
    get: (userId: number, organizationId: number, invoiceId: number) => api<{ status: string; invoice: InvoiceDetail }>('/invoices/get', { userId, organizationId, invoiceId }),
    create: (userId: number, organizationId: number, inv: InvoiceInput) => api<{ status: string; invoice?: { id: number } }>('/invoices/create', { userId, organizationId, ...inv }),
    update: (userId: number, organizationId: number, invoiceId: number, inv: InvoiceInput) => api('/invoices/update', { userId, organizationId, invoiceId, ...inv }),
    remove: (userId: number, organizationId: number, invoiceId: number) => api('/invoices/delete', { userId, organizationId, invoiceId }),
};
