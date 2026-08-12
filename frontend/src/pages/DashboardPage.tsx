import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Badge } from '../components/Feedback';
import { useSession } from '../context/AuthContext';
import { STAT_CARDS, useDashboardStats } from '../hooks/useDashboardStats';
import { canWriteChallans, canWriteCustomers, canWriteProducts, isReadOnly } from '../lib/permissions';

function StatCard({
  label,
  count,
  loading,
  refreshing,
  to,
  tone,
}: {
  label: string;
  count: number | null;
  loading: boolean;
  refreshing: boolean;
  to: string;
  tone?: 'warning';
}) {
  return (
    <Link to={to} className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className={`stat__value${refreshing ? ' stat__value--refreshing' : ''}`}>
        {loading ? (
          <span className="skeleton-cell stat__skeleton" aria-hidden="true" />
        ) : count === null ? (
          // One failed request must not take the page down with it.
          <span className="stat__unavailable" title={`Could not load ${label.toLowerCase()}`}>
            —
          </span>
        ) : (
          count
        )}
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const { role, name } = useSession();
  const { counts, loading, refreshing } = useDashboardStats();

  const quickActions = [
    canWriteCustomers(role) && { to: '/customers?new=1', label: 'Add customer' },
    canWriteProducts(role) && { to: '/products?new=1', label: 'Add product' },
    canWriteChallans(role) && { to: '/challans/new', label: 'Create challan' },
  ].filter(Boolean) as Array<{ to: string; label: string }>;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${name.split(' ')[0]}`}
        subtitle="Here is where things stand today."
      />

      <section className="stat-grid" aria-busy={loading || refreshing}>
        {STAT_CARDS.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            to={card.to}
            tone={card.tone}
            loading={loading}
            refreshing={refreshing}
            count={counts?.[card.key] ?? null}
          />
        ))}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Quick actions</h2>
          {isReadOnly(role) ? <Badge tone="info">Read-only access</Badge> : null}
        </div>

        {quickActions.length > 0 ? (
          <div className="quick-actions">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="btn btn--primary">
                {action.label}
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">
            Your role can view every section but cannot make changes. Everything below is
            still open to you.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Where you can go</h2>
        </div>
        <ul className="link-list">
          <li>
            <Link to="/customers">Customers</Link>
            <span className="muted">
              Browse and search every customer{canWriteCustomers(role) ? ', add and edit records' : ''}
              , and log a follow-up note.
            </span>
          </li>
          <li>
            <Link to="/products">Products</Link>
            <span className="muted">
              Browse the catalogue and stock history
              {canWriteProducts(role) ? ', add products and adjust stock' : ''}.
            </span>
          </li>
          <li>
            <Link to="/challans">Challans</Link>
            <span className="muted">
              Track every delivery challan
              {canWriteChallans(role) ? ', raise new ones, confirm and cancel' : ''}.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
