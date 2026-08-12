import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Badge, EmptyState, Spinner } from '../components/Feedback';
import { FormError } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { useSession } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { notifyStatsChanged } from '../hooks/useDashboardStats';
import { api, errorMessage } from '../lib/api';
import { formatMoney } from '../lib/format';
import { canWriteChallans } from '../lib/permissions';
import type { Challan, Customer, Paginated, Product } from '../types/api';

interface Line {
  key: number;
  productId: string;
  quantity: string;
}

let nextKey = 1;

/**
 * Live stock for one selected product.
 *
 * Fetched per line rather than read off the list response, so a quantity is
 * checked against what the warehouse has *now*. This is a courtesy check: the
 * confirm transaction on the server is what actually protects the stock.
 */
function useProductStock(productId: string) {
  return useFetch(
    async (signal) => {
      if (!productId) return null;

      const { data } = await api.get<Product>(`/products/${productId}`, { signal });
      return data;
    },
    [productId],
  );
}

function LineRow({
  line,
  products,
  onChange,
  onRemove,
  canRemove,
  onStockLoaded,
  overCommitted,
}: {
  line: Line;
  products: Product[];
  onChange: (line: Line) => void;
  onRemove: () => void;
  canRemove: boolean;
  onStockLoaded: (productId: string, currentStock: number) => void;
  overCommitted: boolean;
}) {
  const stock = useProductStock(line.productId);
  const available = stock.data?.currentStock;

  // Hand the fetched figure up so the parent can block submit on it — and so
  // two lines of the same product are checked against one shared total.
  useEffect(() => {
    if (stock.data) onStockLoaded(stock.data.id, stock.data.currentStock);
  }, [stock.data, onStockLoaded]);

  return (
    <div className={`line${overCommitted ? ' line--invalid' : ''}`}>
      <div className="line__product">
        <label className="sr-only" htmlFor={`product-${line.key}`}>Product</label>
        <select
          id={`product-${line.key}`}
          className="input"
          value={line.productId}
          onChange={(event) => onChange({ ...line, productId: event.target.value })}
        >
          <option value="">Select a product…</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.sku}
            </option>
          ))}
        </select>
      </div>

      <div className="line__stock">
        {!line.productId ? (
          <span className="muted">—</span>
        ) : stock.loading ? (
          <Spinner label="Checking stock" />
        ) : stock.error ? (
          <span className="text-danger">Stock unknown</span>
        ) : (
          <span className="muted">
            {available} available
            {stock.data ? <> · {formatMoney(stock.data.unitPrice)}</> : null}
          </span>
        )}
      </div>

      <div className="line__qty">
        <label className="sr-only" htmlFor={`qty-${line.key}`}>Quantity</label>
        <input
          id={`qty-${line.key}`}
          className="input"
          type="number"
          min={1}
          value={line.quantity}
          placeholder="Qty"
          onChange={(event) => onChange({ ...line, quantity: event.target.value })}
        />
      </div>

      <div className="line__remove">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="Remove line"
        >
          Remove
        </button>
      </div>

      {overCommitted ? (
        <p className="line__error" role="alert">
          Only {available} in stock — reduce the quantity or split the order.
        </p>
      ) : null}

    </div>
  );
}

export default function ChallanCreatePage() {
  const { role } = useSession();
  const navigate = useNavigate();
  const { push } = useToast();

  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, productId: '', quantity: '' }]);
  const [stockById, setStockById] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onStockLoaded = useCallback((productId: string, currentStock: number) => {
    setStockById((current) =>
      current[productId] === currentStock ? current : { ...current, [productId]: currentStock },
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(customerQuery), 300);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  const customers = useFetch(
    async (signal) => {
      const { data } = await api.get<Paginated<Customer>>('/customers', {
        params: { ...(debouncedQuery ? { search: debouncedQuery } : {}), pageSize: 20 },
        signal,
      });
      return data.data;
    },
    [debouncedQuery],
  );

  const products = useFetch(
    async (signal) => {
      const { data } = await api.get<Paginated<Product>>('/products', {
        params: { pageSize: 100 },
        signal,
      });
      return data.data;
    },
    [],
  );

  // Guarded server-side too; this just avoids showing a form that cannot submit.
  if (!canWriteChallans(role)) {
    return <Navigate to="/challans" replace />;
  }

  const selectedCustomer = customers.data?.find((customer) => customer.id === customerId);
  const usableLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);

  // Two lines of the same product are summed before comparing, the same way the
  // confirm transaction aggregates them server-side — otherwise 6 + 6 against a
  // stock of 10 would look fine on both lines and only fail on confirm.
  const requestedByProduct = usableLines.reduce<Record<string, number>>((totals, line) => {
    totals[line.productId] = (totals[line.productId] ?? 0) + Number(line.quantity);
    return totals;
  }, {});

  const shortLines = Object.entries(requestedByProduct).filter(
    ([productId, requested]) =>
      typeof stockById[productId] === 'number' && requested > stockById[productId],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError('Pick a customer first');
      return;
    }

    if (usableLines.length === 0) {
      setFormError('Add at least one product line with a quantity');
      return;
    }

    for (const line of lines) {
      if (line.productId && (!line.quantity || Number(line.quantity) <= 0)) {
        setFormError('Every selected product needs a quantity above 0');
        return;
      }
    }

    // Soft gate — the confirm transaction on the server is still the authority.
    // This only saves an avoidable round-trip for a quantity we already know is
    // too high.
    if (shortLines.length > 0) {
      setFormError(
        shortLines.length === 1
          ? 'One line asks for more than is in stock — see the highlighted row.'
          : `${shortLines.length} lines ask for more than is in stock — see the highlighted rows.`,
      );
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.post<Challan>('/challans', {
        customerId,
        items: usableLines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      });

      push({ tone: 'success', title: `Challan ${data.challanNumber} saved as draft` });
      notifyStatsChanged();
      navigate(`/challans/${data.id}`, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the challan'));
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create challan"
        subtitle="Saved as a draft — stock only moves when you confirm it."
        actions={<Link to="/challans" className="btn btn--ghost">Cancel</Link>}
      />

      <form onSubmit={submit} noValidate>
        <FormError message={formError} />

        <section className="panel">
          <div className="panel__head"><h2>Customer</h2></div>

          {selectedCustomer ? (
            <div className="chosen">
              <div>
                <p className="cell--strong">{selectedCustomer.name}</p>
                <p className="muted">
                  {selectedCustomer.mobile}
                  {selectedCustomer.businessName ? ` · ${selectedCustomer.businessName}` : ''}
                </p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setCustomerId('')}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                type="search"
                value={customerQuery}
                placeholder="Search customers by name, mobile or business…"
                aria-label="Search customers"
                onChange={(event) => setCustomerQuery(event.target.value)}
              />

              {customers.loading ? (
                <div className="picker-loading"><Spinner label="Searching customers" /></div>
              ) : customers.error ? (
                <p className="text-danger">{customers.error}</p>
              ) : customers.data && customers.data.length === 0 ? (
                <EmptyState title="No customers match that search" />
              ) : (
                <ul className="picker">
                  {customers.data?.map((customer) => (
                    <li key={customer.id}>
                      <button type="button" onClick={() => setCustomerId(customer.id)}>
                        <span className="cell--strong">{customer.name}</span>
                        <span className="muted">
                          {customer.mobile}
                          {customer.businessName ? ` · ${customer.businessName}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Items</h2>
            <Badge tone="info">{usableLines.length} line{usableLines.length === 1 ? '' : 's'}</Badge>
          </div>

          {products.loading ? (
            <div className="picker-loading"><Spinner label="Loading products" /></div>
          ) : products.error ? (
            <p className="text-danger">{products.error}</p>
          ) : products.data && products.data.length === 0 ? (
            <EmptyState title="No products to add" hint="Someone with Admin or Warehouse access needs to add products first." />
          ) : (
            <>
              <div className="line line--head" aria-hidden="true">
                <span>Product</span>
                <span>Available</span>
                <span>Quantity</span>
                <span />
              </div>

              {lines.map((line) => (
                <LineRow
                  key={line.key}
                  line={line}
                  products={products.data ?? []}
                  canRemove={lines.length > 1}
                  onStockLoaded={onStockLoaded}
                  overCommitted={shortLines.some(([productId]) => productId === line.productId)}
                  onChange={(updated) =>
                    setLines((current) => current.map((item) => (item.key === updated.key ? updated : item)))
                  }
                  onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                />
              ))}

              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setLines((current) => [...current, { key: nextKey++, productId: '', quantity: '' }])}
              >
                Add another line
              </button>
            </>
          )}
        </section>

        <div className="form-actions">
          <Link to="/challans" className="btn btn--ghost">Cancel</Link>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? <Spinner label="Saving" /> : 'Save as draft'}
          </button>
        </div>
      </form>
    </>
  );
}
