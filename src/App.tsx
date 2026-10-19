// Routes and the two gates: signed in, and allowed to manage the current
// organization (employer or admin). Everyone else sees "use the app".
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Shell from './layout/Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import Team from './pages/Team';
import Person from './pages/Person';
import Placeholder from './pages/Placeholder';
import UseTheApp from './pages/UseTheApp';

function Gate() {
    const { session, canManage } = useAuth();
    if (!session) return <Login />;
    if (!canManage) return <UseTheApp />;
    return (
        <Routes>
            <Route element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="team" element={<Team />} />
                <Route path="team/:id" element={<Person />} />
                <Route path="payroll" element={<Placeholder title="Payroll" phase={3} />} />
                <Route path="jobs" element={<Placeholder title="Jobs" phase={4} />} />
                <Route path="hours" element={<Placeholder title="Hours" phase={4} />} />
                <Route path="organization" element={<Placeholder title="Organization" phase={5} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Gate />
            </BrowserRouter>
        </AuthProvider>
    );
}
