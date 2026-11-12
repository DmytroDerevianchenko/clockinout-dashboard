// Terminate, reactivate or delete a team member — the phone's three roster
// actions, each with the same explanation the phone gives before it acts.
// The server keeps its own guards (you cannot terminate or delete yourself,
// and the last admin cannot be removed); its sentence is shown as it comes.
import { useState } from 'react';
import { ApiError } from '../api/client';
import { team, type RosterUser } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';
import { tx } from '../i18n';

export type MemberAction = 'terminate' | 'reactivate' | 'delete';

const COPY: Record<MemberAction, { title: (n: string) => string; body: (n: string) => string; label: string; status: string; done: (n: string) => string }> = {
    terminate: {
        title: n => tx("Terminate {0}?", n),
        body: n => tx("{0} can no longer clock in and drops off the active roster. Their hours, pay and records are kept, and they can be reactivated at any time. An open shift should be ended first.", n),
        label: tx("Terminate"), status: 'terminated', done: n => tx("{0} was terminated", n),
    },
    reactivate: {
        title: n => tx("Reactivate {0}?", n),
        body: n => tx("{0} returns to the active roster and can clock in again.", n),
        label: tx("Reactivate"), status: 'active', done: n => tx("{0} is active again", n),
    },
    delete: {
        title: n => tx("Delete {0}?", n),
        body: n => tx("This permanently removes {0} from your organization. Their payroll history is kept, but this cannot be undone. To keep someone on file without letting them clock in, terminate them instead.", n),
        label: tx("Delete"), status: 'deleted', done: n => tx("{0} was removed", n),
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
        catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); setSaving(false); }
    }

    return (
        <Dialog title={c.title(name)} onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={go} saving={saving} label={c.label} />}>
            <p className="muted">{c.body(name)}</p>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
