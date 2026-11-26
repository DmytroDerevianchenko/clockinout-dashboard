// The whole row opens its details — like tapping a row on the phone.
//
// On the phones every list row is one big target. Here the tables used to
// open details only from the NAME (a link inside the first cell), which
// people kept missing. `rowOpens` makes the row itself the target:
//
//     <tr className="row-click" {...rowOpens(() => setEditing(job))}>
//
// Two things a table row must not steal:
//   · a click on something that already does its own job — a button, a
//     link, the ⋯ menu, an input. (The menu is drawn elsewhere on the page,
//     but React still passes its clicks up to the row it belongs to, so the
//     check looks at what was actually clicked.)
//   · a drag that selected text: someone copying an email or an amount is
//     not asking to open anything.
//
// The name stays a real link/button, so the keyboard (Tab, Enter) works as
// before.
import type { MouseEvent } from 'react';

const DOES_ITS_OWN_JOB = 'a, button, input, select, textarea, label, summary, [role="menu"], [role="menuitem"], [role="dialog"], [contenteditable="true"]';

export function rowOpens(open: () => void) {
    return {
        onClick: (e: MouseEvent<HTMLElement>) => {
            if ((e.target as HTMLElement).closest(DOES_ITS_OWN_JOB)) return;
            if (window.getSelection()?.toString()) return;
            open();
        },
    };
}
