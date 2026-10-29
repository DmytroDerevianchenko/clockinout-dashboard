// ============================================================
// payroll.ts — the Payroll screen's calls, typed to the server's period rows
// (payroll.service calcUserPeriod), the same rows the phones read.
// ============================================================
import { api, apiGet } from './client';

export type PayrollHoliday = { date: string; name: string; hoursWorked: number; holidayPay: number; premium: number; eligible?: boolean; reason?: string | null };
export type CustomDeduction = { name: string; amount: number };

export type UserBalance = {
    userId: number;
    totalHours: number; totalEarned: number; totalPaid: number; paymentCount: number; paymentAmounts: number[];
    netAmount: number; totalTax: number; hourlyRate: number; periodBalance: number;
    payrollRunId: number | null; hasPayrollRun: boolean;
    grossAmount: number | null; manualOverride: boolean;
    cppAmount: number | null; eiAmount: number | null; federalTax: number | null; stateTax: number | null; otherDeductions: number | null;
    socialSecurityAmount: number | null; medicareAmount: number | null;
    jurisdiction: string | null; jurisdictionSource: string | null; deductionsAvailable: boolean;
    employmentType: string | null; gstHstAmount: number | null; gstHstRate: number | null;
    vacationPay: number | null; overtimePay: number | null; suggestedVacationPay: number | null; suggestedOvertimePay: number | null;
    vacationRate: number | null; vacationEnabled: boolean; overtimeEnabled: boolean;
    holidayPay: number | null; holidayPremium: number | null; suggestedHolidayPay: number | null; suggestedHolidayPremium: number | null;
    holidayEnabled: boolean; holidayPremiumEnabled: boolean; holidays: PayrollHoliday[];
    overtimeThresholdWeek: number; overtimeThresholdDay: number;
    customDeductions: CustomDeduction[]; customDeductionsTotal: number;
    modifiedAfterPayment: boolean; netAtPayment: number | null; grossAtPayment: number | null; paymentChangeDetail: string | null;
    notes: string | null;
};
export type PayPeriod = {
    id: number; organization_id: number; start_date: string; end_date: string; status: string; type: string;
    notes: string | null; userBalances: UserBalance[];
};
export type PayPeriodsReply = { status: string; payPeriods: PayPeriod[]; availableYears: number[]; earnedYearly: number; paidYearly: number };

export const payroll = {
    periods: (userId: number, organizationId: number, year: number) =>
        apiGet<PayPeriodsReply>('/pay-periods', { userId, organizationId, year }),
    paystub: (user_id: number, organization_id: number, pay_period_id: number) =>
        api<{ status: string; pdf_url?: string }>('/generate-paystub', { user_id, organization_id, pay_period_id, design: 'standard' }),
    contractorInvoice: (user_id: number, organization_id: number, pay_period_id: number) =>
        api<{ status: string; pdf_url?: string }>('/contractor-invoice', { user_id, organization_id, pay_period_id, design: 'standard' }),
    csv: (userId: number, organizationId: number, year: number, payPeriodId?: number) =>
        api<{ status: string; csv_url?: string }>('/payroll-csv', { userId, organizationId, year, payPeriodId }),
    // Create or replace the run for one person + period (idempotent upsert; same body as the phones).
    saveRun: (body: Record<string, unknown>) => api('/run-payroll-for-user', body),
    createPayment: (body: Record<string, unknown>) => api('/create-payment', body),
};

export const n = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
export const money = (v: unknown) => `$${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hours = (v: unknown) => `${n(v).toFixed(1)} h`;
export const periodLabel = (p: { start_date: string; end_date: string }) => {
    const f = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'America/Toronto' });
    return `${f(p.start_date)} – ${f(p.end_date)}`;
};
