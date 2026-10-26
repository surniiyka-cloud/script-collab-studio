import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import { useAuth } from './auth';
import { AuthScreen } from './screens/AuthScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { StudioScreen } from './screens/StudioScreen';

function Loading() {
  return <main className="boot-screen" role="status">
    <div className="brand-symbol"><Clapperboard size={25} strokeWidth={2} /></div>
    <p>Открываем студию…</p>
  </main>;
}
function Protected() {
  const { token, user, checking } = useAuth();
  if (checking) return <Loading />;
  if (!token || !user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
function GuestOnly() {
  const { token, user, checking } = useAuth();
  if (checking) return <Loading />;
  return token && user ? <Navigate to="/projects" replace /> : <Outlet />;
}
export function App() {
  return <Routes>
    <Route element={<GuestOnly />}>
      <Route path="/login" element={<AuthScreen mode="login" />} />
      <Route path="/register" element={<AuthScreen mode="register" />} />
    </Route>
    <Route element={<Protected />}>
      <Route path="/projects" element={<ProjectsScreen />} />
      <Route path="/projects/:projectId" element={<StudioScreen />} />
    </Route>
    <Route path="*" element={<Navigate to="/projects" replace />} />
  </Routes>;
}
