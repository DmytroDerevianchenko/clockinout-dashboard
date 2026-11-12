// The plan: what the organization would pay when billing starts, and whether
// its owner has seen the rule. Nothing is charged anywhere — the server only
// counts and shows ("shadow billing"). The PRICE is never written in this
// code: every number on screen comes from the server's `rule`.
import { api, apiGet } from './client';

export type PriceRule = { freePeople: number; pricePerExtraPerson: number; currency: string; noticeDays: number };
export type MonthUsage = { month: string; peopleWorked: number; accountPeople: number; billablePeople: number; amount: number };
export type BillingSummary = {
    mode: 'off' | 'shadow' | 'enforce';
    status: 'early_access' | 'free' | 'paid' | 'grace' | 'unpaid';
    plan: string;
    rule: PriceRule;
    isAdmin: boolean;
    acknowledgedAt: string | null;
    organizations?: number;      // how many organizations share the owner's free seats
    thisMonth?: MonthUsage;      // admins only
    lastMonth?: MonthUsage;
};

export const billingApi = {
    summary: (userId: number, organizationId: number) =>
        apiGet<{ status: string; billing: BillingSummary }>('/billing/summary', { userId, organizationId }),
    rule: () => apiGet<{ status: string; mode: BillingSummary['mode']; rule: PriceRule }>('/billing/rule', {}),
    acknowledge: (userId: number, organizationId: number) =>
        api<{ status: string; acknowledgedAt: string }>('/billing/acknowledge', { userId, organizationId }),
};
