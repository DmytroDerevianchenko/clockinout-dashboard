// ============================================================
// scripts/check-locales.mjs — the dashboard's translation scanner
//
//   npm run check:i18n
//
// Reads every tx("…") / txn(n, "…", "…") in src/ and checks that EVERY
// language file in src/locales/ — including one added later — has the
// sentence. Exits with an error and the list of what is missing.
// (Sentences that come from the server are translated by the server:
// see the server's test/messages.test.js.)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

// a string literal at s[i]; null when it is a template with ${…} or not a literal
function literal(s, i) {
    const q = s[i];
    if (q !== '"' && q !== "'" && q !== '`') return null;
    let j = i + 1, raw = '';
    while (j < s.length && s[j] !== q) {
        if (s[j] === '\\') { raw += s[j] + s[j + 1]; j += 2; continue; }
        if (q === '`' && s[j] === '$' && s[j + 1] === '{') return null;
        raw += s[j++];
    }
    if (j >= s.length) return null;
    // eslint-disable-next-line no-new-func
    try { return { text: JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/\\`/g, '`').replace(/(?<!\\)"/g, '\\"').replace(/\n/g, '\\n') + '"'), end: j + 1 }; }
    catch { return null; }
}
const skipWs = (s, i) => { while (/\s/.test(s[i] ?? '')) i++; return i; };

const strings = new Map(), plurals = new Map(), dynamic = [];
for (const file of walk(SRC)) {
    const s = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lineOf = i => s.slice(0, i).split('\n').length;
    for (const m of s.matchAll(/(?<![\w.])tx\(/g)) {
        const at = skipWs(s, m.index + m[0].length);
        const lit = literal(s, at);
        if (lit) { if (!strings.has(lit.text)) strings.set(lit.text, `${rel}:${lineOf(m.index)}`); }
        else if (/['"`]/.test(s[at])) dynamic.push(`${rel}:${lineOf(m.index)}`);
    }
    for (const m of s.matchAll(/(?<![\w.])txn\(/g)) {
        // txn(count, 'one', 'other') — the key is the OTHER form
        let i = m.index + m[0].length, depth = 0;
        while (i < s.length && !(s[i] === ',' && depth === 0)) { if ('([{'.includes(s[i])) depth++; else if (')]}'.includes(s[i])) depth--; i++; }
        const one = literal(s, skipWs(s, i + 1));
        if (!one) continue;
        const comma = skipWs(s, one.end);
        const other = s[comma] === ',' ? literal(s, skipWs(s, comma + 1)) : null;
        if (other && !plurals.has(other.text)) plurals.set(other.text, `${rel}:${lineOf(m.index)}`);
    }
}

// The same in every language: names, codes, sample values, and two notes for developers.
const SAME = ['useAuth outside AuthProvider', 'lookup failed', 'CSV', 'PDF', 'ClockInOut', 'CAD', 'Ontario', 'CA', '123456789RT0001', 'VF'];
for (const k of SAME) strings.delete(k);

const localeDir = path.join(SRC, 'locales');
let failed = false;
console.log(`${strings.size} sentences and ${plurals.size} counted phrases in the source.`);
for (const f of fs.readdirSync(localeDir).filter(f => f.endsWith('.json'))) {
    const dict = JSON.parse(fs.readFileSync(path.join(localeDir, f), 'utf8'));
    const missing = [...strings.keys()].filter(k => !(dict.strings ?? {})[k]);
    const missingPlurals = [...plurals.keys()].filter(k => !(dict.plurals ?? {})[k]?.other);
    const broken = Object.entries(dict.strings ?? {}).filter(([en, tr]) =>
        (en.match(/\{\d+\}/g) ?? []).sort().join() !== (String(tr).match(/\{\d+\}/g) ?? []).sort().join()).map(([en]) => en);
    if (missing.length || missingPlurals.length || broken.length) failed = true;
    console.log(`${f}: ${missing.length + missingPlurals.length ? 'MISSING ' + (missing.length + missingPlurals.length) : 'complete'}${broken.length ? `, ${broken.length} with different {0} placeholders` : ''}`);
    for (const k of missing) console.log(`   · ${JSON.stringify(k)}   (${strings.get(k)})`);
    for (const k of missingPlurals) console.log(`   · plural ${JSON.stringify(k)}   (${plurals.get(k)})`);
    for (const k of broken) console.log(`   · placeholders differ: ${JSON.stringify(k)}`);
}
if (dynamic.length) console.log(`Note: ${dynamic.length} tx() call(s) build their sentence at run time and cannot be checked: ${dynamic.slice(0, 5).join(', ')}`);
process.exit(failed ? 1 : 0);
