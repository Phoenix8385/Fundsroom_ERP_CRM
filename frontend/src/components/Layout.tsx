import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isReadOnly } from '../lib/permissions';
import { titleCase } from '../lib/format';
import { Spinner } from './Feedback';

/**
 * Every section is readable by every authenticated role, so the nav is the same
 * for everyone. Role only decides which *actions* appear inside a page.
 */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/customers', label: 'Customers' },
  { to: '/products', label: 'Products' },
  { to: '/challans', label: 'Challans' },
];

export function ProtectedRoute() {
  const { session, restoring } = useAuth();
  const location = useLocation();

  // Hold the route until the stored token has been read, or a refresh on a deep
  // link would bounce to /login before the session is known.
  if (restoring) {
    return (
      <div className="page-center">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function Layout() {
  const { session, logout } = useAuth();

  if (!session) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true" />
          <span>Fundsroom</span>
        </div>

        <nav className="topbar__nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__user">
          <div className="topbar__identity">
            <span className="topbar__name">{session.name}</span>
            <span className="topbar__role">
              {titleCase(session.role)}
              {isReadOnly(session.role) ? ' · read-only' : ''}
            </span>
          </div>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-head__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </div>
  );
}
