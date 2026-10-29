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

export const orgApi = {
    list: (userId: number) => apiGet<{ status: string; organizations: OrgRow[] }>('/organizations', { userId }),
    /** PUT /organizations with the full row + a new payroll config (JSON text, as the server expects). */
    savePayrollConfig: (userId: number, o: OrgRow, config: PayrollConfig) =>
        api('/organizations', {
            userId, orgId: o.id, name: o.name, defaultBreakDuration: o.default_break_duration, payPeriodType: o.pay_period_type,
            street: o.street, unitNumber: o.unit_number, city: o.city, stateProvince: o.state_province, postalCode: o.postal_code,
            countryCode: o.country_code, taxConfigJson: JSON.stringify(o.tax_config_json ?? {}), payrollConfigJson: JSON.stringify(config),
            defaultEmploymentType: o.default_employment_type, payPeriodStartDay: o.pay_period_start_day, currencyCode: o.currency_code,
            invoicePrefix: o.invoice_prefix, logoShow: o.logo_show,
        }, 'PUT'),
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
