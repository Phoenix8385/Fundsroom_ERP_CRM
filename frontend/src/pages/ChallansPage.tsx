import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, EmptyState, ErrorState, TableSkeleton } from '../components/Feedback';
import { PageHeader } from '../components/Layout';
import { Pagination } from '../components/Overlay';
import { useSession } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { challanTone, formatDate, titleCase } from '../lib/format';
import { canWriteChallans } from '../lib/permissions';
import type { ChallanListRow, Paginated } from '../types/api';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function ChallansPage() {
  const { role } = useSession();
  const canWrite = canWriteChallans(role);
  const [params, setParams] = useSearchParams();

  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1');

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
      const { data } = await api.get<Paginated<ChallanListRow>>('/challans', {
        params: { ...(status ? { status } : {}), page, pageSize: PAGE_SIZE },
        signal,
      });
      return data;
    },
    [status, page],
  );

  return (
    <>
      <PageHeader
        title="Challans"
        subtitle="Everyone can view; only Admin and Sales can raise, confirm or cancel."
        actions={
          canWrite ? (
            <Link to="/challans/new" className="btn btn--primary">
              Create challan
            </Link>
          ) : null
        }
      />

      <div className="filters">
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
      </div>

      <div className="panel">
        {list.loading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data && list.data.data.length === 0 ? (
          <EmptyState
            title={status ? `No ${status.toLowerCase()} challans` : 'No challans yet — create your first one'}
            hint={status ? 'Try a different status filter.' : undefined}
            action={
              status ? (
                <button type="button" className="btn btn--ghost" onClick={() => setParam('status', '')}>
                  Show all
                </button>
              ) : canWrite ? (
                <Link to="/challans/new" className="btn btn--primary">Create challan</Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Challan</th>
                    <th>Customer</th>
                    <th className="num">Items</th>
                    <th>Status</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.data.map((challan) => (
                    <tr key={challan.id}>
                      <td className="cell--strong">
                        <Link to={`/challans/${challan.id}`} className="rowlink">
                          {challan.challanNumber}
                        </Link>
                      </td>
                      <td>{challan.customer?.name ?? '—'}</td>
                      <td className="num">{challan.totalQuantity}</td>
                      <td><Badge tone={challanTone(challan.status)}>{titleCase(challan.status)}</Badge></td>
                      <td>{formatDate(challan.createdAt)}</td>
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
    </>
  );
}
