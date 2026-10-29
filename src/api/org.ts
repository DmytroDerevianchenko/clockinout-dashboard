// Organizations: the list (GET /organizations) and the whole-row update
// (PUT /organizations) the phones use. The update is a whole-object write,
// so every field is read first and sent back with the one that changed.
import { api, apiGet } from './client';

export type OrgRow = {
    id: number; name: string; default_break_duration: number | null; pay_period_type: string;
    street: string | null; unit_number: string | null; city: string | null; state_province: string | null; postal_code: string | null; country_code: string | null;
    tax_config_json: Record<string, unknown> | null; payroll_config_json: PayrollConfig | null;
    default_employment_type: string | null; pay_period_start_day: string | null; currency_code: string | null; invoice_prefix: string | null; logo_show: boolean;
};
export type PayrollConfig = {
    overtime?: { applies_to?: string[]; multiplier?: number; threshold_week?: number; threshold_day?: number };
    deductions?: { name: string; formula: string; applies_to?: string[] }[];
    overtime_enabled?: boolean; vacation_pay_rate?: number; vacation_pay_enabled?: boolean;
    holiday_pay_enabled?: boolean; holiday_premium_enabled?: boolean;
};

export type OrgSettings = {
    feature_auto_clock_out: boolean; auto_clock_out_time: string; feature_break_tracking: boolean; feature_multi_job_tracking: boolean;
    feature_timesheet_approval: boolean; break_policy: 'none' | 'auto' | 'tracked'; auto_break_minutes: number; auto_break_threshold_hours: number;
    feature_geofencing: boolean; geofence_radius: number; feature_location_tracking: boolean; location_track_interval_minutes: number;
    location_change_threshold_meters: number; feature_reminders: boolean; feature_overtime_alerts: boolean; feature_export_reports: boolean;
    notify_payment_received: boolean; feature_scheduling: boolean; schedule_reminder_minutes: number;
};
export type InvoiceRow = {
    id: number; invoice_number: string; status: 'draft' | 'sent' | 'paid' | 'cancelled'; issue_date: string; due_date: string | null;
    subtotal: number | string; tax_rate: number | string; tax_amount: number | string; total: number | string; currency_code: string | null;
    sent_at: string | null; sent_to_email: string | null; paid_at: string | null; payment_method: string | null; is_deleted: boolean;
    client_id: number; client_name: string | null; job_id: number | null; job_name: string | null; is_overdue: boolean;
};

/** PUT /organizations is a whole-row write: send the row back with the changes applied. */
function putOrg(userId: number, o: OrgRow) {
    return api('/organizations', {
        userId, orgId: o.id, name: o.name, defaultBreakDuration: o.default_break_duration, payPeriodType: o.pay_period_type,
        street: o.street, unitNumber: o.unit_number, city: o.city, stateProvince: o.state_province, postalCode: o.postal_code,
        countryCode: o.country_code, taxConfigJson: JSON.stringify(o.tax_config_json ?? {}), payrollConfigJson: JSON.stringify(o.payroll_config_json ?? {}),
        defaultEmploymentType: o.default_employment_type, payPeriodStartDay: o.pay_period_start_day, currencyCode: o.currency_code,
        invoicePrefix: o.invoice_prefix, logoShow: o.logo_show,
    }, 'PUT');
}

export const orgApi = {
    list: (userId: number) => apiGet<{ status: string; organizations: OrgRow[] }>('/organizations', { userId }),
    savePayrollConfig: (userId: number, o: OrgRow, config: PayrollConfig) => putOrg(userId, { ...o, payroll_config_json: config }),
    saveDetails: (userId: number, o: OrgRow) => putOrg(userId, o),
    settings: (userId: number, organizationId: number) => apiGet<{ status: string; settings: OrgSettings }>('/settings', { userId, organizationId }),
    saveSettings: (organizationId: number, settings: OrgSettings) => api('/settings', { organizationId, settings }),
    invoices: (userId: number, organizationId: number, year?: number) => api<{ status: string; invoices: InvoiceRow[] }>('/invoices/list', { userId, organizationId, year }),
    invoicePdf: (userId: number, organizationId: number, invoiceId: number) => api<{ status: string; pdf_url?: string; pdfUrl?: string }>('/invoices/pdf', { userId, organizationId, invoiceId, design: 'standard' }),
    sendInvoice: (userId: number, organizationId: number, invoiceId: number) => api<{ status: string; message?: string }>('/invoices/send', { userId, organizationId, invoiceId, design: 'standard' }),
    setInvoiceStatus: (userId: number, organizationId: number, invoiceId: number, status: string, paymentMethod?: string, paidAt?: string) =>
        api('/invoices/set-status', { userId, organizationId, invoiceId, status, paymentMethod, paidAt }),
    defaults: (organization_id: number, country_code: string, state_province: string, employment_type: string) =>
        api<{ status: string; config: { overtime?: { threshold_week?: number; threshold_day?: number; multiplier?: number }; vacation_pay_rate?: number } }>(
            '/get-default-configs', { organization_id, country_code, state_province, employment_type }),
};

// Statute, kept in step with the server's getStatutoryOvertime and the shared Kotlin.
export function statutoryOvertime(countryCode: string | null, province: string | null) {
    if ((countryCode ?? '').toUpperCase() !== 'CA') return { week: 40, day: 0 };
    const p = (province ?? '').toLowerCase().trim();
    const week = ['british columbia', 'bc', 'quebec', 'qc', 'manitoba', 'mb', 'saskatchewan', 'sk', 'newfoundland and labrador', 'newfoundland', 'nl', 'yukon', 'yt', 'northwest territories', 'nt', 'nunavut', 'nu'].includes(p) ? 40
        : ['nova scotia', 'ns', 'prince edward island', 'pei', 'pe'].includes(p) ? 48 : 44;
    const day = ['british columbia', 'bc', 'alberta', 'ab', 'saskatchewan', 'sk', 'manitoba', 'mb', 'yukon', 'yt', 'northwest territories', 'nt', 'nunavut', 'nu'].includes(p) ? 8 : 0;
    return { week, day };
}
