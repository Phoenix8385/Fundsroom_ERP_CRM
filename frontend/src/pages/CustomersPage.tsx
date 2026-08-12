import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, DetailSkeleton, EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/Feedback';
import { FormError, SelectInput, TextArea, TextInput } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { Drawer, Modal, Pagination } from '../components/Overlay';
import { useSession } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { api, errorMessage } from '../lib/api';
import { challanTone, customerTone, formatDate, formatDateTime, titleCase } from '../lib/format';
import { canWriteCustomers } from '../lib/permissions';
import {
  hasErrors,
  validateCustomer,
  validateNote,
  type CustomerFormValues,
  type Errors,
} from '../lib/validation';
import type { Customer, CustomerDetail, Paginated } from '../types/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
];

const PAGE_SIZE = 20;

const EMPTY_FORM: CustomerFormValues = {
  name: '',
  mobile: '',
  email: '',
  businessName: '',
  gstNumber: '',
  type: 'RETAIL',
  address: '',
  status: 'LEAD',
  followUpDate: '',
};

export default function CustomersPage() {
  const { role } = useSession();
  const canWrite = canWriteCustomers(role);
  const { push } = useToast();
  const [params, setParams] = useSearchParams();

  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? '1');

  const [searchDraft, setSearchDraft] = useState(search);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(params.get('new') === '1');

  // Debounced so typing does not fire a request per keystroke.
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
      const { data } = await api.get<Paginated<Customer>>('/customers', {
        params: {
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
        signal,
      });
      return data;
    },
    [search, status, type, page],
  );

  const filtered = Boolean(search || status || type);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone can browse; only Admin and Sales can add or edit."
        actions={
          canWrite ? (
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              Add customer
            </button>
          ) : null
        }
      />

      <div className="filters">
        <input
          className="input"
          type="search"
          value={searchDraft}
          placeholder="Search name, mobile or business…"
          aria-label="Search customers"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        <select
          className="input"
          value={status}
          aria-label="Filter by status"
          onChange={(event) => setParam('status', event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="input"
          value={type}
          aria-label="Filter by type"
          onChange={(event) => setParam('type', event.target.value)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="panel">
        {list.loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data && list.data.data.length === 0 ? (
          <EmptyState
            title={filtered ? 'No customers match those filters' : 'No customers yet — add your first one'}
            hint={filtered ? 'Try clearing the search or filters.' : undefined}
            action={
              filtered ? (
                <button type="button" className="btn btn--ghost" onClick={() => setParams(new URLSearchParams())}>
                  Clear filters
                </button>
              ) : canWrite ? (
                <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
                  Add customer
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
                    <th>Mobile</th>
                    <th>Business</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.data.map((customer) => (
                    <tr key={customer.id} onClick={() => setOpenId(customer.id)} tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setOpenId(customer.id);
                      }}
                    >
                      <td className="cell--strong">{customer.name}</td>
                      <td>{customer.mobile}</td>
                      <td>{customer.businessName ?? '—'}</td>
                      <td>{titleCase(customer.type)}</td>
                      <td><Badge tone={customerTone(customer.status)}>{titleCase(customer.status)}</Badge></td>
                      <td>{formatDate(customer.followUpDate)}</td>
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

      {openId ? (
        <CustomerDrawer
          id={openId}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
          onEdit={(customer) => {
            setOpenId(null);
            setEditing(customer);
          }}
        />
      ) : null}

      {creating ? (
        <CustomerForm
          title="Add customer"
          onClose={() => {
            setCreating(false);
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('new');
              return next;
            });
          }}
          onSaved={() => {
            push({ tone: 'success', title: 'Customer added' });
            list.reload();
          }}
        />
      ) : null}

      {editing ? (
        <CustomerForm
          title={`Edit ${editing.name}`}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            push({ tone: 'success', title: 'Customer updated' });
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

/* --- detail drawer ------------------------------------------------------- */

function CustomerDrawer({
  id,
  canWrite,
  onClose,
  onEdit,
}: {
  id: string;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
}) {
  const { push } = useToast();
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const detail = useFetch(
    async (signal) => {
      const { data } = await api.get<CustomerDetail>(`/customers/${id}`, { signal });
      return data;
    },
    [id],
  );

  async function addNote(event: FormEvent) {
    event.preventDefault();

    const problem = validateNote(noteText);
    setNoteError(problem);
    if (problem) return;

    setSavingNote(true);

    try {
      await api.post(`/customers/${id}/notes`, { text: noteText.trim() });
      setNoteText('');
      push({ tone: 'success', title: 'Note added' });
      detail.reload();
    } catch (err) {
      setNoteError(errorMessage(err, 'Could not add the note'));
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Drawer title={detail.data?.name ?? 'Customer'} onClose={onClose}>
      {detail.loading ? (
        <DetailSkeleton lines={6} />
      ) : detail.error ? (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      ) : detail.data ? (
        <>
          <div className="drawer__title-row">
            <div>
              <h3>{detail.data.name}</h3>
              <p className="muted">{detail.data.businessName ?? 'No business name'}</p>
            </div>
            {canWrite ? (
              <button type="button" className="btn btn--ghost" onClick={() => onEdit(detail.data!)}>
                Edit customer
              </button>
            ) : null}
          </div>

          <dl className="detail-grid">
            <div><dt>Mobile</dt><dd>{detail.data.mobile}</dd></div>
            <div><dt>Email</dt><dd>{detail.data.email ?? '—'}</dd></div>
            <div><dt>Type</dt><dd>{titleCase(detail.data.type)}</dd></div>
            <div><dt>Status</dt><dd><Badge tone={customerTone(detail.data.status)}>{titleCase(detail.data.status)}</Badge></dd></div>
            <div><dt>GST number</dt><dd>{detail.data.gstNumber ?? '—'}</dd></div>
            <div><dt>Follow-up</dt><dd>{formatDate(detail.data.followUpDate)}</dd></div>
            <div className="detail-grid__wide"><dt>Address</dt><dd>{detail.data.address ?? '—'}</dd></div>
          </dl>

          <section className="drawer__section">
            <h4>Recent challans</h4>
            {detail.data.challans.length === 0 ? (
              <p className="muted">No challans raised for this customer yet.</p>
            ) : (
              <ul className="mini-list">
                {detail.data.challans.map((challan) => (
                  <li key={challan.id}>
                    <span className="cell--strong">{challan.challanNumber}</span>
                    <Badge tone={challanTone(challan.status)}>
                      {titleCase(challan.status)}
                    </Badge>
                    <span className="muted">{formatDate(challan.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="drawer__section">
            <h4>Follow-up notes</h4>

            {/* Open to every role — POST /customers/:id/notes carries no guard. */}
            <form className="note-form" onSubmit={addNote}>
              <TextArea
                label="Add a follow-up note"
                value={noteText}
                onChange={(value) => {
                  setNoteText(value);
                  if (noteError) setNoteError(null);
                }}
                error={noteError ?? undefined}
                placeholder="Called about the pending order…"
                rows={2}
              />
              <button type="submit" className="btn btn--primary" disabled={savingNote}>
                {savingNote ? <Spinner label="Saving note" /> : 'Add note'}
              </button>
            </form>

            {detail.data.notes.length === 0 ? (
              <p className="muted">No notes yet.</p>
            ) : (
              <ul className="note-list">
                {detail.data.notes.map((note) => (
                  <li key={note.id}>
                    <p>{note.text}</p>
                    <span className="muted">{formatDateTime(note.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Drawer>
  );
}

/* --- create / edit form -------------------------------------------------- */

function CustomerForm({
  title,
  existing,
  onClose,
  onSaved,
}: {
  title: string;
  existing?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<CustomerFormValues>(
    existing
      ? {
          name: existing.name,
          mobile: existing.mobile,
          email: existing.email ?? '',
          businessName: existing.businessName ?? '',
          gstNumber: existing.gstNumber ?? '',
          type: existing.type,
          address: existing.address ?? '',
          status: existing.status,
          followUpDate: existing.followUpDate ? existing.followUpDate.slice(0, 10) : '',
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Errors<CustomerFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CustomerFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Mirrors the backend zod rules, so an obvious typo never costs a round-trip.
    const found = validateCustomer(values);
    setErrors(found);
    if (hasErrors(found)) return;

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      mobile: values.mobile.trim(),
      type: values.type,
      status: values.status,
      // Blank optionals are sent as undefined; the API treats "" as unset too,
      // but omitting them keeps a PUT from clearing a field the user never saw.
      email: values.email.trim() || undefined,
      businessName: values.businessName.trim() || undefined,
      gstNumber: values.gstNumber.trim().toUpperCase() || undefined,
      address: values.address.trim() || undefined,
      followUpDate: values.followUpDate || undefined,
    };

    setSaving(true);

    try {
      if (existing) await api.put(`/customers/${existing.id}`, payload);
      else await api.post('/customers', payload);

      onSaved();
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the customer'));
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
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="customer-form" className="btn btn--primary" disabled={saving}>
            {saving ? <Spinner label="Saving" /> : existing ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        <div className="form-grid">
          <TextInput label="Name" value={values.name} onChange={(v) => set('name', v)} error={errors.name} required autoFocus />
          <TextInput label="Mobile" type="tel" value={values.mobile} onChange={(v) => set('mobile', v)} error={errors.mobile} hint="10 digits, starting 6-9" required />
          <TextInput label="Email" type="email" value={values.email} onChange={(v) => set('email', v)} error={errors.email} />
          <TextInput label="Business name" value={values.businessName} onChange={(v) => set('businessName', v)} error={errors.businessName} />
          <TextInput label="GST number" value={values.gstNumber} onChange={(v) => set('gstNumber', v)} error={errors.gstNumber} hint="15-character GSTIN, if the customer has one" />
          <SelectInput label="Type" value={values.type} onChange={(v) => set('type', v)} error={errors.type} required
            options={TYPE_OPTIONS.filter((option) => option.value)}
          />
          <SelectInput label="Status" value={values.status} onChange={(v) => set('status', v)}
            options={STATUS_OPTIONS.filter((option) => option.value)}
          />
          <TextInput label="Follow-up date" type="date" value={values.followUpDate} onChange={(v) => set('followUpDate', v)} error={errors.followUpDate} />
        </div>

        <TextArea label="Address" value={values.address} onChange={(v) => set('address', v)} error={errors.address} />
      </form>
    </Modal>
  );
}
