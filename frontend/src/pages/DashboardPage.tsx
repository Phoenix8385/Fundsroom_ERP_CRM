import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Badge, Spinner } from '../components/Feedback';
import { useSession } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { canWriteChallans, canWriteCustomers, canWriteProducts, isReadOnly } from '../lib/permissions';
import type { Paginated } from '../types/api';

/** A count is just `total` from any list endpoint with the smallest page. */
function useCount(path: string, params: Record<string, string | number> = {}) {
  return useFetch(
    async (signal) => {
      const { data } = await api.get<Paginated<unknown>>(path, {
        params: { pageSize: 1, ...params },
        signal,
      });
      return data.total;
    },
    [path, JSON.stringify(params)],
  );
}

function StatCard({
  label,
  value,
  loading,
  to,
  tone,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  to: string;
  tone?: 'warning';
}) {
  return (
    <Link to={to} className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {loading ? <Spinner label={`Loading ${label}`} /> : (value ?? '—')}
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const session = useSession();
  const { role, name } = session;

  const customers = useCount('/customers');
  const products = useCount('/products');
  const lowStock = useCount('/products', { lowStockOnly: 'true' });
  const draftChallans = useCount('/challans', { status: 'DRAFT' });

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

      <section className="stat-grid">
        <StatCard label="Customers" value={customers.data} loading={customers.loading} to="/customers" />
        <StatCard label="Products" value={products.data} loading={products.loading} to="/products" />
        <StatCard
          label="Low on stock"
          value={lowStock.data}
          loading={lowStock.loading}
          to="/products?lowStockOnly=true"
          tone="warning"
        />
        <StatCard
          label="Draft challans"
          value={draftChallans.data}
          loading={draftChallans.loading}
          to="/challans?status=DRAFT"
        />
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
