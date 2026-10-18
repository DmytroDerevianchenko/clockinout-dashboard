// A worker signed in on the web: the dashboard is for employers and admins.
// Their own punch clock, hours and paystubs live in the phone app.
import { useAuth } from '../auth';

export default function UseTheApp() {
    const { session, signOut } = useAuth();
    return (
        <div className="login-wrap">
            <div className="login-card">
                <div className="brand"><div className="brand-mark">C</div><div className="brand-name">ClockInOut</div></div>
                <h2>Hi {session?.fullName?.split(' ')[0] || 'there'}</h2>
                <p className="muted">This website is for employers and administrators. Your clock, hours and paystubs are in the ClockInOut app on your phone.</p>
                <button className="btn btn-block" onClick={signOut}>Sign out</button>
            </div>
        </div>
    );
}
