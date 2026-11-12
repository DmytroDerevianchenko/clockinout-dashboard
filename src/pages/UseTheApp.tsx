// A worker signed in on the web: the dashboard is for employers and admins.
// Their own punch clock, hours and paystubs live in the phone app.
import { useAuth } from '../auth';
import { tx } from '../i18n';

export default function UseTheApp() {
    const { session, signOut } = useAuth();
    return (
        <div className="login-wrap">
            <div className="login-card">
                <div className="brand"><div className="brand-mark">C</div><div className="brand-name">{tx("ClockInOut")}</div></div>
                <h2>{session?.fullName ? tx('Hi {0}', session.fullName.split(' ')[0]) : tx('Hi there')}</h2>
                <p className="muted">{tx("This website is for employers and administrators. Your clock, hours and paystubs are in the ClockInOut app on your phone.")}</p>
                <button className="btn btn-block" onClick={signOut}>{tx("Sign out")}</button>
            </div>
        </div>
    );
}
