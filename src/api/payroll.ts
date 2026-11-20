// ============================================================
// payroll.ts — the Payroll screen's calls, typed to the server's period rows
// (payroll.service calcUserPeriod), the same rows the phones read.
// ============================================================
import { api, apiGet } from './client';
import { lang, hoursText, tx } from '../i18n';

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
    // 'YYYY-MM-DD' — the day the period is PAID. Its year is the year the pay
    // counts in (year-to-date, T4): a December period paid in January is the
    // new year's first pay. Absent on an older server.
    pay_date?: string | null;
    notes: string | null; userBalances: UserBalance[];
};
export type PayPeriodsReply = { status: string; payPeriods: PayPeriod[]; availableYears: number[]; earnedYearly: number; paidYearly: number };

export const payroll = {
    periods: (userId: number, organizationId: number, year: number) =>
        apiGet<PayPeriodsReply>('/pay-periods', { userId, organizationId, year }),
    paystub: (user_id: number, organization_id: number, pay_period_id: number) =>
        api<{ status: string; pdf_url?: string }>('/generate-paystub', { user_id, organization_id, pay_period_id, design: 'standard' }),
    // Several pay periods of one person as ONE PDF (a page per period, oldest first).
    paystubs: (user_id: number, organization_id: number, pay_period_ids: number[]) =>
        api<{ status: string; pdf_url?: string; count?: number; skipped?: number[] }>('/generate-paystubs', { user_id, organization_id, pay_period_ids, design: 'standard' }),
    contractorInvoice: (user_id: number, organization_id: number, pay_period_id: number) =>
        api<{ status: string; pdf_url?: string }>('/contractor-invoice', { user_id, organization_id, pay_period_id, design: 'standard' }),
    csv: (userId: number, organizationId: number, year: number, payPeriodId?: number) =>
        api<{ status: string; csv_url?: string }>('/payroll-csv', { userId, organizationId, year, payPeriodId }),
    // Create or replace the run for one person + period (idempotent upsert; same body as the phones).
    saveRun: (body: Record<string, unknown>) => api('/run-payroll-for-user', body),
    // One person's rate for ONE period only (their clock-ins in it are re-priced); the current rate is untouched.
    updatePeriodRate: (userId: number, organizationId: number, targetUserId: number, payPeriodId: number, hourlyRate: number) =>
        api('/update-period-rate', { userId, organizationId, targetUserId, payPeriodId, hourlyRate }),
    createPayment: (body: Record<string, unknown>) => api('/create-payment', body),
    // The pay day rule: the crew is paid this many days after a period ends.
    setPayDay: (organizationId: number, offsetDays: number) =>
        api<{ status: string; offsetDays: number; periodsUpdated: number }>('/set-pay-day', { organizationId, offsetDays }),

    // What the employer sends to the CRA, by month (or quarter) of the pay date.
    remittances: (organizationId: number, year?: number) =>
        apiGet<RemittancesReply>('/remittances', { organizationId, year }),
    setRemitterType: (organizationId: number, remitterType: 'monthly' | 'quarterly') =>
        api<{ status: string; remitterType: string }>('/set-remitter-type', { organizationId, remitterType }),
};

// ── CRA remittance (GET /remittances) ──
// Amounts are dollars. employeeTotal = held back from pay (tax + CPP + EI);
// employerTotal = the employer's own share; total = what goes to the CRA.
export type RemitAmounts = {
    gross: number; tax: number; cppEmployee: number; cppEmployer: number; cpp2Employee: number; cpp2Employer: number;
    eiEmployee: number; eiEmployer: number; employeeTotal: number; employerTotal: number; total: number;
};
export type RemitPay = RemitAmounts & { payPeriodId: number; startDate: string; endDate: string; payDate: string; people: (RemitAmounts & { userId: number; fullName: string })[] };
export type RemitPending = { payPeriodId: number; startDate: string; endDate: string; payDate: string; people: number };
export type RemitPeriod = RemitAmounts & {
    key: string; year: number; month: number | null; quarter: number | null; from: string; to: string; dueDate: string; isOpen: boolean;
    grossPayroll: number; employeesInLastPay: number; lastPayDate: string; payPeriods: RemitPay[]; notRunYet: RemitPending[];
};
export type RemittancesReply = {
    status: string; year: number; availableYears: number[]; remitterType: 'monthly' | 'quarterly'; eiEmployerFactor: number; today: string;
    periods: RemitPeriod[]; notRunYet: (RemitPending & { key: string; dueDate: string })[]; yearTotals: RemitAmounts;
};

export const n = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
export const money = (v: unknown) => `$${n(v).toLocaleString(lang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hours = (v: unknown) => hoursText(n(v));
/** "Jan 2, 2026" from a calendar date — no time-zone step, it is already a day. */
export const payDateLabel = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(lang(), { year: 'numeric', month: 'short', day: 'numeric' });
export const periodLabel = (p: { start_date: string; end_date: string }) => {
    const f = (iso: string) => new Date(iso).toLocaleDateString(lang(), { month: 'short', day: 'numeric', timeZone: 'America/Toronto' });
    return `${f(p.start_date)} – ${f(p.end_date)}`;
};

/** "November 2026" for a month, "Q4 2026" for a quarter. */
export const remitTitle = (p: { from: string; year: number; quarter: number | null }) => {
    if (p.quarter) return tx('Q{0} {1}', p.quarter, p.year);
    const s = new Date(p.from + 'T12:00:00').toLocaleDateString(lang(), { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
/** Whole days from one calendar date ('YYYY-MM-DD') to another. */
export const daysBetween = (from: string, to: string) =>
    Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
