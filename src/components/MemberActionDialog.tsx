// Terminate, reactivate or delete a team member — the phone's three roster
// actions, each with the same explanation the phone gives before it acts.
// The server keeps its own guards (you cannot terminate or delete yourself,
// and the last admin cannot be removed); its sentence is shown as it comes.
import { useState } from 'react';
import { ApiError } from '../api/client';
import { team, type RosterUser } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';

export type MemberAction = 'terminate' | 'reactivate' | 'delete';

const COPY: Record<MemberAction, { title: (n: string) => string; body: (n: string) => string; label: string; status: string; done: (n: string) => string }> = {
    terminate: {
        title: n => `Terminate ${n}?`,
        body: n => `${n} can no longer clock in and drops off the active roster. Their hours, pay and records are kept, and they can be reactivated at any time. An open shift should be ended first.`,
        label: 'Terminate', status: 'terminated', done: n => `${n} was terminated`,
    },
    reactivate: {
        title: n => `Reactivate ${n}?`,
        body: n => `${n} returns to the active roster and can clock in again.`,
        label: 'Reactivate', status: 'active', done: n => `${n} is active again`,
    },
    delete: {
        title: n => `Delete ${n}?`,
        body: n => `This permanently removes ${n} from your organization. Their payroll history is kept, but this cannot be undone. To keep someone on file without letting them clock in, terminate them instead.`,
        label: 'Delete', status: 'deleted', done: n => `${n} was removed`,
    },
};

export default function MemberActionDialog({ user, action, onClose, onDone }: { user: RosterUser; action: MemberAction; onClose: () => void; onDone: (message: string) => void }) {
    const { session, org } = useAuth();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const c = COPY[action];
    const name = user.full_name || user.email;

    async function go() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        try { await team.updateField(session.userId, org.organization_id, user.id, 'status', c.status); onDone(c.done(name)); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    return (
        <Dialog title={c.title(name)} onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={go} saving={saving} label={c.label} />}>
            <p className="muted">{c.body(name)}</p>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
