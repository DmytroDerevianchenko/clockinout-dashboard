// The language of the dashboard: English, Español, Français, Українська.
// The names are shown in their own language so anyone can find theirs.
// Choosing one saves it for this browser and reloads the page in it.
import { LANGS, lang, setLang, tx, type Lang } from '../i18n';

export default function LangSwitch() {
    return (
        <select className="lang" aria-label={tx('Language')} title={tx('Language')} value={lang()} onChange={e => setLang(e.target.value as Lang)}>
            {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
    );
}
