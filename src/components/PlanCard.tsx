// The Plan card on the Organization page.
//
// ClockInOut is free while it is in early access, and nobody should find out
// about the price on the day it starts. So the card says, from day one:
//   · what the rule will be (first N people free, then $X per extra person)
//   · what THIS organization's month would cost under it — the "shadow bill"
//   · that there will be notice before anything is charged
// and it asks the owner to tap "Got it" once, which the server records.
//
// There is no "upgrade" button here on purpose: nothing can be bought yet.
import { useCallback, useEffect, useState } from 'react';
import { billingApi, type BillingSummary, type MonthUsage, type PriceRule } from '../api/billing';
import { money } from '../api/payroll';
import { dateOnly } from '../api/team';
import { useAuth } from '../auth';
import { useToast } from './Toast';
import { tx, txn } from '../i18n';

/** "the first 5 people are free, then $5.00 a month for each person after that" */
export function ruleSentence(rule: PriceRule) {
    return tx('The first {0} people are free, then {1} a month for each person after that. Only people who worked that month count.', rule.freePeople, money(rule.pricePerExtraPerson));
}

function Month({ label, u }: { label: string; u: MonthUsage }) {
    return (
        <div className="kv"><span>{label}</span>
            <span>{txn(u.peopleWorked, '{n} person worked', '{n} people worked')}
                {' · '}{u.amount > 0 ? <strong>{tx('would be {0} a month', money(u.amount))}</strong> : <span className="faint">{tx('would be free')}</span>}</span>
        </div>
    );
}

export default function PlanCard() {
    const { session, org } = useAuth();
    const toast = useToast();
    const [b, setB] = useState<BillingSummary | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!session || !org) return;
        try { setB((await billingApi.summary(session.userId, org.organization_id)).billing); }
        catch { setB(null); }            // an older server, or a hiccup: the card simply stays away
    }, [session, org]);
    useEffect(() => { load(); }, [load]);

    if (!b || b.mode === 'off') return null;

    async function gotIt() {
        if (!session || !org) return;
        setSaving(true);
        try { await billingApi.acknowledge(session.userId, org.organization_id); await load(); }
        catch { toast(tx('Could not save'), 'error'); }
        finally { setSaving(false); }
    }

    return <PlanCardView b={b} onGotIt={gotIt} saving={saving} />;
}

/** The card itself, with no fetching — also what the dev styleguide renders. */
export function PlanCardView({ b, onGotIt, saving }: { b: BillingSummary; onGotIt: () => void; saving: boolean }) {
    const early = b.status === 'early_access';
    const pill = early ? tx('Early access') : b.status === 'free' ? tx('Free') : b.status === 'paid' ? tx('Paid') : b.status === 'grace' ? tx('Grace period') : tx('Payment needed');
    return (
        <section className="card">
            <div className="person-head"><h2>{tx('Plan')}</h2><span className={'pill' + (b.status === 'unpaid' ? ' danger' : b.status === 'grace' ? ' caution' : ' live')}>{pill}</span></div>
            {early && <p>{tx('Free while ClockInOut is in early access.')}</p>}
            <p className="muted small">{early ? tx('When billing starts:') : tx('The plan:')} {ruleSentence(b.rule)}</p>
            {b.thisMonth && <Month label={tx('This month')} u={b.thisMonth} />}
            {b.lastMonth && <Month label={tx('Last month')} u={b.lastMonth} />}
            {b.thisMonth && (b.organizations ?? 1) > 1 && (
                <p className="faint small">{tx('The {0} free seats are shared by your {1} organizations: {2} people worked across them this month.', b.rule.freePeople, b.organizations, b.thisMonth.accountPeople)}</p>
            )}
            {early && <p className="muted small">{tx('You will be told at least {0} days before billing starts.', b.rule.noticeDays)}</p>}
            {b.isAdmin && early && (b.acknowledgedAt
                ? <p className="faint small">{tx('Seen on {0}', dateOnly(b.acknowledgedAt))}</p>
                : <button className="btn btn-sm" onClick={onGotIt} disabled={saving}>{tx('Got it')}</button>)}
        </section>
    );
}
