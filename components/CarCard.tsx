'use client';

import Link from 'next/link';
import { CarWithDetails } from '@/lib/types';
import { calcMetrics } from '@/lib/calculations';

const FINANCE_LABELS: Record<string, { label: string; color: string }> = {
  cash:      { label: 'Cash',          color: 'bg-emerald-900/50 text-emerald-400 border-emerald-800' },
  bank_loan: { label: 'Bank Loan',     color: 'bg-blue-900/50 text-blue-400 border-blue-800' },
  hp:        { label: 'HP',            color: 'bg-purple-900/50 text-purple-400 border-purple-800' },
  pcp:       { label: 'PCP',           color: 'bg-amber-900/50 text-amber-400 border-amber-800' },
  lease:     { label: 'Lease / PCH',   color: 'bg-cyan-900/50 text-cyan-400 border-cyan-800' },
};

const FUEL_ICONS: Record<string, string> = {
  petrol: '⛽', diesel: '⛽', electric: '⚡', hybrid: '🔋', phev: '🔋',
};

const fmt = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const fmtSigned = (n: number) => n >= 0 ? fmt(n) : `-£${Math.round(-n).toLocaleString('en-GB')}`;
const fmtMo = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}/mo`;

const MONTHLY_BUDGET = 800;

interface CarCardProps {
  data: CarWithDetails;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CarCard({ data, selected, onToggleSelect, onDelete }: CarCardProps) {
  const metrics = calcMetrics(data);
  const ft = data.finance?.finance_type;
  const badge = ft ? FINANCE_LABELS[ft] : null;
  const extraSaved = (MONTHLY_BUDGET - metrics.total_monthly_cost) * metrics.tco_months;

  return (
    <div
      onClick={() => onToggleSelect(data.car.id)}
      className={`relative rounded-xl border cursor-pointer transition-all duration-200 ${
        selected
          ? 'border-blue-500 bg-gray-900 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/20'
          : 'border-gray-800 bg-gray-900 hover:border-gray-600'
      }`}
    >
      {/* Selection checkbox */}
      <div className="absolute top-4 right-4">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-800'
        }`}>
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="pr-8 mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            {data.car.year} · {FUEL_ICONS[data.car.fuel_type]} {data.car.fuel_type.charAt(0).toUpperCase() + data.car.fuel_type.slice(1)}
            {data.car.colour ? ` · ${data.car.colour}` : ''}
          </p>
          <h3 className="text-white font-semibold text-lg leading-tight">{data.car.nickname}</h3>
          {data.car.nickname !== `${data.car.year} ${data.car.make} ${data.car.model}` && (
            <p className="text-gray-500 text-sm">{data.car.make} {data.car.model}</p>
          )}
        </div>

        {/* Finance badge */}
        {badge && (
          <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-0.5 text-xs font-medium mb-4 ${badge.color}`}>
            {badge.label}
            {data.finance?.monthly_payment && ft !== 'cash' && ft !== 'bank_loan' && (
              <span className="opacity-70">· {fmtMo(data.finance.monthly_payment)}</span>
            )}
            {ft === 'bank_loan' && (
              <span className="opacity-70">· {fmtMo(metrics.monthly_finance_cost)}/mo calc.</span>
            )}
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-gray-800/60 rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Total / month</p>
            <p className="text-white font-bold text-xl">{fmtMo(metrics.total_monthly_cost)}</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Extra saved</p>
            <p className={`font-semibold ${extraSaved >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtSigned(extraSaved)}</p>
          </div>
        </div>

        <div className="bg-gray-800/40 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-xs">
              TCO over {Math.round(metrics.tco_months / 12 * 10) / 10} yr{metrics.tco_months !== 12 ? 's' : ''}
            </span>
            <span className="text-gray-300 font-semibold text-sm">{fmt(metrics.tco)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-gray-500 text-xs">Cost per mile</span>
            <span className="text-gray-400 text-sm">{(metrics.cost_per_mile * 100).toFixed(1)}p/mile</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <Link
            href={`/cars/${data.car.id}/edit`}
            className="flex-1 text-center text-sm text-gray-300 hover:text-white py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={() => onDelete(data.car.id)}
            className="text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded-lg border border-gray-700 hover:border-red-900 transition-colors"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
