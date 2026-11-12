// Routes and the two gates: signed in, and allowed to manage the current
// organization (employer or admin). Everyone else sees "use the app".
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/Toast';
import Shell from './layout/Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import Team from './pages/Team';
import Person from './pages/Person';
import Payroll from './pages/Payroll';
import Payments from './pages/Payments';
import Jobs from './pages/Jobs';
import Hours from './pages/Hours';
import Organization from './pages/Organization';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import UseTheApp from './pages/UseTheApp';

// The design kit on one page with made-up data — development builds only
// (the dynamic import keeps it out of the production bundle's main chunk).
const Styleguide = lazy(() => import('./pages/Styleguide'));

function Gate() {
    const { session, canManage } = useAuth();
    if (import.meta.env.DEV && window.location.pathname === '/styleguide') return <Suspense fallback={null}><Styleguide /></Suspense>;
    if (!session) return <Login />;
    if (!canManage) return <UseTheApp />;
    return (
        <Routes>
            <Route element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="team" element={<Team />} />
                <Route path="team/:id" element={<Person />} />
                <Route path="payroll" element={<Payroll />} />
                <Route path="payments" element={<Payments />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="hours" element={<Hours />} />
                <Route path="organization" element={<Organization />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="clients" element={<Clients />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Gate />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}
