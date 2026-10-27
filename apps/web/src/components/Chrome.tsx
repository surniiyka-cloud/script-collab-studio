import { Clapperboard, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import type { ReactNode } from 'react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={'brand ' + (compact ? 'brand-compact' : '')} to="/projects" aria-label="Script Collab Studio — проекты">
    <span className="brand-symbol"><Clapperboard size={21} strokeWidth={2.25}/></span>
    {!compact && <span className="brand-text"><strong>script<span>studio</span></strong><small>COLLABORATIVE WORKSPACE</small></span>}
  </Link>;
}
function Initials({ name }: { name: string }) {
  return <span className="avatar">{name.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'А'}</span>;
}
/** One content-first app frame: no redundant or decorative left rail. */
export function DashboardFrame({ children }: { children: ReactNode }) {
  return <div className="application"><div className="application-body">{children}</div></div>;
}
export function UserIndicator() {
  const { user, logout } = useAuth();
  return <div className="header-user">
    <span className="header-user-name">{user?.displayName}</span>
    {user && <Initials name={user.displayName}/>}
    <button className="icon-button" aria-label="Выйти" title="Выйти" onClick={logout}><LogOut size={17}/></button>
  </div>;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day:'numeric',month:'long',year:'numeric' }).format(new Date(value));
}
export function FriendlyError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner" role="alert">
    <span>{message}</span>
    {onRetry && <button className="text-button" onClick={onRetry}>Повторить</button>}
  </div>;
}
