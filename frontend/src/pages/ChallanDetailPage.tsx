import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, DetailSkeleton, ErrorState, Spinner } from '../components/Feedback';
import { PageHeader } from '../components/Layout';
import { Modal } from '../components/Overlay';
import { useSession } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { api, errorBody, errorMessage, statusOf } from '../lib/api';
import { challanTone, formatDateTime, formatMoney, titleCase } from '../lib/format';
import { canWriteChallans } from '../lib/permissions';
import type { ChallanDetail, InsufficientStockBody } from '../types/api';

export default function ChallanDetailPage() {
  const { id = '' } = useParams();
  const { role } = useSession();
  const canWrite = canWriteChallans(role);
  const { push, pushAll } = useToast();

  const [working, setWorking] = useState<'confirm' | 'cancel' | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const detail = useFetch(
    async (signal) => {
      const { data } = await api.get<ChallanDetail>(`/challans/${id}`, { signal });
      return data;
    },
    [id],
  );

  async function confirmChallan() {
    setWorking('confirm');

    try {
      await api.put(`/challans/${id}/confirm`);
      push({ tone: 'success', title: 'Challan confirmed', body: 'Stock has been deducted.' });
      detail.reload();
    } catch (err) {
      const body = errorBody<InsufficientStockBody>(err);

      // A 409 from confirm carries a `shortages` array — one toast per line, so
      // the user can see exactly which items to fix rather than a generic error.
      if (statusOf(err) === 409 && body?.shortages?.length) {
        pushAll(
          body.shortages.map((shortage) => ({
            tone: 'error' as const,
            title: shortage.productName,
            body: `requested ${shortage.requested}, only ${shortage.available} available`,
          })),
        );
      } else {
        push({ tone: 'error', title: 'Could not confirm', body: errorMessage(err) });
      }
    } finally {
      setWorking(null);
    }
  }

  async function cancelChallan() {
    setWorking('cancel');
    setConfirmingCancel(false);

    try {
      const wasConfirmed = detail.data?.status === 'CONFIRMED';

      await api.put(`/challans/${id}/cancel`);
      push({
        tone: 'success',
        title: 'Challan cancelled',
        body: wasConfirmed ? 'Stock has been returned.' : undefined,
      });
      detail.reload();
    } catch (err) {
      push({ tone: 'error', title: 'Could not cancel', body: errorMessage(err) });
    } finally {
      setWorking(null);
    }
  }

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Challan" />
        <div className="panel"><DetailSkeleton lines={7} /></div>
      </>
    );
  }

  if (detail.error) {
    return (
      <>
        <PageHeader title="Challan" actions={<Link to="/challans" className="btn btn--ghost">Back</Link>} />
        <div className="panel"><ErrorState message={detail.error} onRetry={detail.reload} /></div>
      </>
    );
  }

  const challan = detail.data;

  if (!challan) return null;

  const isDraft = challan.status === 'DRAFT';
  const isCancelled = challan.status === 'CANCELLED';
  const total = challan.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  return (
    <>
      <PageHeader
        title={challan.challanNumber}
        subtitle={`Raised ${formatDateTime(challan.createdAt)}`}
        actions={
          <>
            <Link to="/challans" className="btn btn--ghost">Back</Link>

            {/* Confirm/cancel mirror requireRole(ADMIN, SALES) on the API. */}
            {canWrite && isDraft ? (
              <button type="button" className="btn btn--primary" onClick={confirmChallan} disabled={working !== null}>
                {working === 'confirm' ? <Spinner label="Confirming" /> : 'Confirm challan'}
              </button>
            ) : null}

            {canWrite && !isCancelled ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirmingCancel(true)} disabled={working !== null}>
                {working === 'cancel' ? <Spinner label="Cancelling" /> : 'Cancel challan'}
              </button>
            ) : null}
          </>
        }
      />

      <section className="panel">
        <div className="panel__head">
          <h2>Details</h2>
          <Badge tone={challanTone(challan.status)}>{titleCase(challan.status)}</Badge>
        </div>

        <dl className="detail-grid">
          <div><dt>Customer</dt><dd>{challan.customer.name}</dd></div>
          <div><dt>Mobile</dt><dd>{challan.customer.mobile}</dd></div>
          <div><dt>Business</dt><dd>{challan.customer.businessName ?? '—'}</dd></div>
          <div><dt>Total quantity</dt><dd>{challan.totalQuantity}</dd></div>
          <div><dt>Last updated</dt><dd>{formatDateTime(challan.updatedAt)}</dd></div>
          <div className="detail-grid__wide"><dt>Address</dt><dd>{challan.customer.address ?? '—'}</dd></div>
        </dl>

        {isDraft ? (
          <p className="callout">
            This challan is a draft — no stock has moved yet. Confirming it deducts stock for
            every line.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel__head"><h2>Items</h2></div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="num">Unit price</th>
                <th className="num">Qty</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((item) => (
                <tr key={item.id}>
                  <td className="cell--strong">{item.productName}</td>
                  <td className="mono">{item.sku}</td>
                  <td className="num">{formatMoney(item.unitPrice)}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{formatMoney(Number(item.unitPrice) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="num cell--strong">Total</td>
                <td className="num cell--strong">{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="muted">
          Product names and prices are the values captured when the challan was raised, so a
          later rename or reprice does not rewrite history.
        </p>
      </section>

      {confirmingCancel ? (
        <Modal
          title="Cancel this challan?"
          onClose={() => setConfirmingCancel(false)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmingCancel(false)}>
                Keep it
              </button>
              <button type="button" className="btn btn--danger" onClick={cancelChallan}>
                Cancel challan
              </button>
            </>
          }
        >
          <p>
            {challan.status === 'CONFIRMED'
              ? 'This challan is confirmed, so cancelling will return every item to stock.'
              : 'This challan is still a draft, so no stock will move.'}
          </p>
        </Modal>
      ) : null}
    </>
  );
}
