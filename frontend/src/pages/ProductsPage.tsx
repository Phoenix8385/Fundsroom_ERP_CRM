import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, DetailSkeleton, EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/Feedback';
import { FormError, SelectInput, TextInput } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { Drawer, Modal, Pagination } from '../components/Overlay';
import { useSession } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { api, errorMessage } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { canWriteProducts } from '../lib/permissions';
import {
  hasErrors,
  validateProduct,
  validateStockAdjustment,
  type Errors,
  type ProductFormValues,
} from '../lib/validation';
import type { Paginated, Product, StockMovement } from '../types/api';

const PAGE_SIZE = 20;

const EMPTY_FORM: ProductFormValues = {
  name: '',
  sku: '',
  category: '',
  unitPrice: '',
  currentStock: '0',
  minStockAlert: '0',
  location: '',
};

/** Mirrors the backend's lowStockOnly filter: currentStock <= minStockAlert. */
function isLowStock(product: Product): boolean {
  return product.currentStock <= product.minStockAlert;
}

export default function ProductsPage() {
  const { role } = useSession();
  const canWrite = canWriteProducts(role);
  const { push } = useToast();
  const [params, setParams] = useSearchParams();

  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const lowStockOnly = params.get('lowStockOnly') === 'true';
  const page = Number(params.get('page') ?? '1');

  const [searchDraft, setSearchDraft] = useState(search);
  const [logFor, setLogFor] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [creating, setCreating] = useState(params.get('new') === '1');

  useEffect(() => {
    if (searchDraft === search) return;

    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (searchDraft) next.set('search', searchDraft);
        else next.delete('search');
        next.set('page', '1');
        return next;
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchDraft, search, setParams]);

  const setParam = useCallback(
    (key: string, value: string) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        return next;
      });
    },
    [setParams],
  );

  const list = useFetch(
    async (signal) => {
      const { data } = await api.get<Paginated<Product>>('/products', {
        params: {
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
          ...(lowStockOnly ? { lowStockOnly: 'true' } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
        signal,
      });
      return data;
    },
    [search, category, lowStockOnly, page],
  );

  const filtered = Boolean(search || category || lowStockOnly);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Everyone can browse the catalogue and stock history; only Admin and Warehouse can change it."
        actions={
          canWrite ? (
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              Add product
            </button>
          ) : null
        }
      />

      <div className="filters">
        <input
          className="input"
          type="search"
          value={searchDraft}
          placeholder="Search name or SKU…"
          aria-label="Search products"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        <input
          className="input"
          type="text"
          value={category}
          placeholder="Category"
          aria-label="Filter by category"
          onChange={(event) => setParam('category', event.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setParam('lowStockOnly', event.target.checked ? 'true' : '')}
          />
          Low stock only
        </label>
      </div>

      <div className="panel">
        {list.loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data && list.data.data.length === 0 ? (
          <EmptyState
            title={filtered ? 'No products match those filters' : 'No products yet — add your first one'}
            hint={filtered ? 'Try clearing the search or filters.' : undefined}
            action={
              filtered ? (
                <button type="button" className="btn btn--ghost" onClick={() => setParams(new URLSearchParams())}>
                  Clear filters
                </button>
              ) : canWrite ? (
                <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
                  Add product
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th className="num">Unit price</th>
                    <th className="num">Stock</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.data.map((product) => (
                    <tr key={product.id}>
                      <td className="cell--strong">{product.name}</td>
                      <td className="mono">{product.sku}</td>
                      <td>{product.category ?? '—'}</td>
                      <td className="num">{formatMoney(product.unitPrice)}</td>
                      <td className="num">
                        <span className="stock-cell">
                          {product.currentStock}
                          {isLowStock(product) ? (
                            <Badge tone="warning">Low stock</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="actions-col">
                        <div className="row-actions">
                          {/* Stock log is readable by every role. */}
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLogFor(product)}>
                            Stock log
                          </button>
                          {canWrite ? (
                            <>
                              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdjusting(product)}>
                                Adjust stock
                              </button>
                              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(product)}>
                                Edit
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {list.data ? (
              <Pagination
                page={list.data.page}
                pageSize={list.data.pageSize}
                total={list.data.total}
                onPage={(next) => setParam('page', String(next))}
              />
            ) : null}
          </>
        )}
      </div>

      {logFor ? <StockLogDrawer product={logFor} onClose={() => setLogFor(null)} /> : null}

      {creating ? (
        <ProductForm
          title="Add product"
          onClose={() => {
            setCreating(false);
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('new');
              return next;
            });
          }}
          onSaved={() => {
            push({ tone: 'success', title: 'Product added' });
            list.reload();
          }}
        />
      ) : null}

      {editing ? (
        <ProductForm
          title={`Edit ${editing.name}`}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            push({ tone: 'success', title: 'Product updated' });
            list.reload();
          }}
        />
      ) : null}

      {adjusting ? (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={(newStock) => {
            push({ tone: 'success', title: 'Stock updated', body: `${adjusting.name} is now at ${newStock}.` });
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

/* --- stock log ----------------------------------------------------------- */

function StockLogDrawer({ product, onClose }: { product: Product; onClose: () => void }) {
  const [page, setPage] = useState(1);

  const log = useFetch(
    async (signal) => {
      const { data } = await api.get<Paginated<StockMovement>>(`/products/${product.id}/stock-log`, {
        params: { page, pageSize: 50 },
        signal,
      });
      return data;
    },
    [product.id, page],
  );

  return (
    <Drawer title={`Stock log — ${product.name}`} onClose={onClose}>
      <div className="drawer__title-row">
        <div>
          <h3>{product.name}</h3>
          <p className="muted mono">{product.sku}</p>
        </div>
        <span className="stock-cell">
          {product.currentStock} in stock
          {isLowStock(product) ? <Badge tone="warning">Low stock</Badge> : null}
        </span>
      </div>

      {log.loading ? (
        <DetailSkeleton lines={6} />
      ) : log.error ? (
        <ErrorState message={log.error} onRetry={log.reload} />
      ) : log.data && log.data.data.length === 0 ? (
        <EmptyState title="No stock movements yet" hint="Adjustments and confirmed challans will show up here." />
      ) : (
        <>
          <ul className="movement-list">
            {log.data?.data.map((movement) => (
              <li key={movement.id}>
                <Badge tone={movement.type === 'IN' ? 'success' : 'danger'}>
                  {movement.type === 'IN' ? `+${movement.quantityChanged}` : `−${movement.quantityChanged}`}
                </Badge>
                <div>
                  <p>{movement.reason}</p>
                  <span className="muted">{formatDateTime(movement.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>

          {log.data ? (
            <Pagination page={log.data.page} pageSize={log.data.pageSize} total={log.data.total} onPage={setPage} />
          ) : null}
        </>
      )}
    </Drawer>
  );
}

/* --- create / edit ------------------------------------------------------- */

function ProductForm({
  title,
  existing,
  onClose,
  onSaved,
}: {
  title: string;
  existing?: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(
    existing
      ? {
          name: existing.name,
          sku: existing.sku,
          category: existing.category ?? '',
          unitPrice: String(existing.unitPrice),
          currentStock: String(existing.currentStock),
          minStockAlert: String(existing.minStockAlert),
          location: existing.location ?? '',
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Errors<ProductFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ProductFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validateProduct(values, { isEdit: Boolean(existing) });
    setErrors(found);
    if (hasErrors(found)) return;

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      sku: values.sku.trim().toUpperCase(),
      unitPrice: Number(values.unitPrice),
      category: values.category.trim() || undefined,
      location: values.location.trim() || undefined,
      minStockAlert: values.minStockAlert.trim() === '' ? undefined : Number(values.minStockAlert),
    };

    // Stock is only set at creation. On edit it moves through adjust-stock, so
    // the movement is logged rather than silently overwritten.
    if (!existing) {
      payload.currentStock = values.currentStock.trim() === '' ? 0 : Number(values.currentStock);
    }

    setSaving(true);

    try {
      if (existing) await api.put(`/products/${existing.id}`, payload);
      else await api.post('/products', payload);

      onSaved();
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the product'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="product-form" className="btn btn--primary" disabled={saving}>
            {saving ? <Spinner label="Saving" /> : existing ? 'Save changes' : 'Add product'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        <div className="form-grid">
          <TextInput label="Name" value={values.name} onChange={(v) => set('name', v)} error={errors.name} required autoFocus />
          <TextInput label="SKU" value={values.sku} onChange={(v) => set('sku', v)} error={errors.sku} hint="Stored uppercase" required />
          <TextInput label="Category" value={values.category} onChange={(v) => set('category', v)} error={errors.category} />
          <TextInput label="Unit price" type="number" step="0.01" min={0} value={values.unitPrice} onChange={(v) => set('unitPrice', v)} error={errors.unitPrice} required />
          {existing ? null : (
            <TextInput label="Opening stock" type="number" min={0} value={values.currentStock} onChange={(v) => set('currentStock', v)} error={errors.currentStock} />
          )}
          <TextInput label="Low-stock alert at" type="number" min={0} value={values.minStockAlert} onChange={(v) => set('minStockAlert', v)} error={errors.minStockAlert} />
          <TextInput label="Location" value={values.location} onChange={(v) => set('location', v)} error={errors.location} />
        </div>

        {existing ? (
          <p className="muted">
            Stock is changed through “Adjust stock”, so every movement is recorded in the log.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/* --- adjust stock -------------------------------------------------------- */

function AdjustStockModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (newStock: number) => void;
}) {
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors<{ quantity: string; reason: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = Number(quantity);
  const projected = Number.isFinite(parsed) && quantity.trim() !== ''
    ? type === 'OUT'
      ? product.currentStock - parsed
      : product.currentStock + parsed
    : product.currentStock;

  // Soft check only — the backend transaction is the real authority.
  const wouldGoNegative = projected < 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validateStockAdjustment(quantity, reason);
    setErrors(found);
    if (hasErrors(found)) return;

    if (wouldGoNegative) {
      setFormError(`Only ${product.currentStock} in stock — cannot remove ${parsed}.`);
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.post<{ product: Product }>(`/products/${product.id}/adjust-stock`, {
        quantityChanged: parsed,
        type,
        reason: reason.trim(),
      });

      onSaved(data.product.currentStock);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not adjust the stock'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Adjust stock — ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="adjust-form" className="btn btn--primary" disabled={saving || wouldGoNegative}>
            {saving ? <Spinner label="Saving" /> : 'Apply adjustment'}
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        <p className="callout">
          Currently <strong>{product.currentStock}</strong> in stock
          {quantity.trim() !== '' && Number.isFinite(parsed) ? (
            <> → will become <strong className={wouldGoNegative ? 'text-danger' : undefined}>{projected}</strong></>
          ) : null}
        </p>

        <div className="form-grid">
          <SelectInput
            label="Direction"
            value={type}
            onChange={(value) => setType(value as 'IN' | 'OUT')}
            options={[
              { value: 'IN', label: 'Stock in (received)' },
              { value: 'OUT', label: 'Stock out (removed)' },
            ]}
          />
          <TextInput label="Quantity" type="number" min={1} value={quantity} onChange={(v) => { setQuantity(v); setErrors((e) => ({ ...e, quantity: undefined })); }} error={errors.quantity} required autoFocus />
        </div>

        <TextInput label="Reason" value={reason} onChange={(v) => { setReason(v); setErrors((e) => ({ ...e, reason: undefined })); }} error={errors.reason} hint="At least 3 characters — it goes into the stock log" required />
      </form>
    </Modal>
  );
}
