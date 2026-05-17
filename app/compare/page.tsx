'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { CarWithDetails, CarMetrics } from '@/lib/types';
import { calcMetrics, calcAnnualFuelCost, getTermMonths } from '@/lib/calculations';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

const FINANCE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_loan: 'Bank Loan', hp: 'HP', pcp: 'PCP', lease: 'Lease / PCH',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const fmtDecimal = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMo = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}/mo`;
const pct = (n: number | null) => n !== null ? `${n}%` : '—';
const dash = (v: number | null | undefined, formatter = fmt) => (v != null && v > 0) ? formatter(v) : '—';

/** Return cell colour classes: lowest = green, highest = red. Only for monetary rows with >=2 values. */
function highlightClass(value: number, allValues: number[], lowerIsBetter = true): string {
  if (allValues.length < 2 || value === 0) return '';
  const nonZero = allValues.filter(v => v > 0);
  if (nonZero.length < 2) return '';
  const best = lowerIsBetter ? Math.min(...nonZero) : Math.max(...nonZero);
  const worst = lowerIsBetter ? Math.max(...nonZero) : Math.min(...nonZero);
  if (value === best) return 'text-emerald-400';
  if (value === worst && nonZero.length >= 2) return 'text-amber-400';
  return '';
}

// ─── Comparison table rows ─────────────────────────────────────────────────

interface RowDef {
  label: string;
  getValue: (m: CarMetrics) => string;
  getNumber?: (m: CarMetrics) => number;
  section?: string;
  lowerIsBetter?: boolean;
}

const TABLE_ROWS: RowDef[] = [
  // Finance
  { label: 'Finance Type', getValue: m => FINANCE_LABELS[m.finance.finance_type] ?? m.finance.finance_type, section: 'Finance' },
  { label: 'Purchase Price', getValue: m => dash(m.finance.purchase_price), getNumber: m => m.finance.purchase_price ?? 0 },
  { label: 'Deposit / Initial Rental', getValue: m => {
    if (m.finance.finance_type === 'lease') return dash((m.finance.initial_rental_months ?? 0) * (m.finance.monthly_payment ?? 0));
    return dash(m.finance.deposit);
  }, getNumber: m => m.finance.finance_type === 'lease' ? (m.finance.initial_rental_months ?? 0) * (m.finance.monthly_payment ?? 0) : (m.finance.deposit ?? 0) },
  { label: 'Monthly Payment', getValue: m => {
    if (m.finance.finance_type === 'cash') return `${fmtMo(m.monthly_finance_cost)} (depreciation)`;
    if (m.finance.finance_type === 'bank_loan') return `${fmtMo(m.monthly_finance_cost)} (calculated)`;
    return fmtMo(m.finance.monthly_payment ?? 0);
  }, getNumber: m => m.monthly_finance_cost },
  { label: 'Term', getValue: m => {
    const months = getTermMonths(m.finance);
    if (m.finance.finance_type === 'cash') return `${m.finance.ownership_years ?? 3} yrs`;
    if (m.finance.finance_type === 'lease') return `${m.finance.initial_rental_months ?? 3}+${months} months`;
    return `${months} months`;
  }},
  { label: 'APR', getValue: m => m.finance.finance_type === 'bank_loan' ? pct(m.finance.apr) : '—' },
  { label: 'Balloon / GMFV', getValue: m => m.finance.finance_type === 'pcp' ? dash(m.finance.balloon_payment) : '—', getNumber: m => m.finance.finance_type === 'pcp' ? (m.finance.balloon_payment ?? 0) : 0 },
  { label: 'End of Term', getValue: m => {
    if (m.finance.finance_type === 'pcp') return m.finance.pcp_end_action === 'buy' ? 'Buy (pay balloon)' : 'Hand back';
    if (m.finance.finance_type === 'lease') return 'Return car';
    return 'You own it';
  }},
  { label: 'Depreciation Rate', getValue: m => ['cash','bank_loan','hp'].includes(m.finance.finance_type) || (m.finance.finance_type === 'pcp' && m.finance.pcp_end_action === 'buy') ? pct(m.finance.depreciation_rate) : '—' },
  { label: 'Est. Residual Value', lowerIsBetter: false, getValue: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 'N/A';
    const dep = m.finance.depreciation_rate ?? 15;
    const years = m.tco_months / 12;
    return fmt(price * Math.pow(1 - dep / 100, years));
  }, getNumber: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 0;
    const dep = m.finance.depreciation_rate ?? 15;
    return price * Math.pow(1 - dep / 100, m.tco_months / 12);
  }},
  { label: 'Depreciation Loss (£)', getValue: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 'N/A';
    const dep = m.finance.depreciation_rate ?? 15;
    const years = m.tco_months / 12;
    const loss = price - price * Math.pow(1 - dep / 100, years);
    return `−${fmt(loss)}`;
  }, getNumber: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 0;
    const dep = m.finance.depreciation_rate ?? 15;
    return price - price * Math.pow(1 - dep / 100, m.tco_months / 12);
  }},

  // Running costs
  { label: 'Insurance', getValue: m => fmt(m.running_costs.insurance), getNumber: m => m.running_costs.insurance, section: 'Annual Running Costs' },
  { label: 'Road Tax (VED)', getValue: m => fmt(m.running_costs.ved), getNumber: m => m.running_costs.ved },
  { label: 'Fuel / Electricity', getValue: m => `${fmt(m.annual_fuel_cost)}/yr`, getNumber: m => m.annual_fuel_cost },
  { label: 'MOT', getValue: m => fmt(m.running_costs.mot), getNumber: m => m.running_costs.mot },
  { label: 'Servicing', getValue: m => fmt(m.running_costs.servicing), getNumber: m => m.running_costs.servicing },
  { label: 'Tyres', getValue: m => fmt(m.running_costs.tyres), getNumber: m => m.running_costs.tyres },
  { label: 'Breakdown Cover', getValue: m => fmt(m.running_costs.breakdown_cover), getNumber: m => m.running_costs.breakdown_cover },
  { label: 'Parking', getValue: m => fmt(m.running_costs.parking), getNumber: m => m.running_costs.parking },
  { label: 'Other', getValue: m => fmt(m.running_costs.other), getNumber: m => m.running_costs.other },
  { label: 'Total Annual Running', getValue: m => `${fmt(m.annual_running_cost)}/yr`, getNumber: m => m.annual_running_cost },

  // Summary
  { label: 'Monthly Finance Cost', getValue: m => fmtMo(m.monthly_finance_cost), getNumber: m => m.monthly_finance_cost, section: 'Monthly Summary' },
  { label: 'Monthly Running Cost', getValue: m => fmtMo(m.monthly_running_cost), getNumber: m => m.monthly_running_cost },
  { label: 'Total Monthly Cost', getValue: m => fmtMo(m.total_monthly_cost), getNumber: m => m.total_monthly_cost },
  { label: 'Total Cost of Ownership', getValue: m => fmt(m.tco), getNumber: m => m.tco, section: 'Ownership Summary' },
  { label: 'Annual Mileage', getValue: m => `${m.running_costs.annual_mileage.toLocaleString('en-GB')} mi/yr` },
  { label: 'Cost per Mile', getValue: m => `${(m.cost_per_mile * 100).toFixed(1)}p`, getNumber: m => m.cost_per_mile * 100 },
];

// ─── Custom tooltip for recharts ──────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 shadow-xl text-sm">
      <p className="text-gray-300 font-medium mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill || p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-semibold">£{Math.round(p.value).toLocaleString('en-GB')}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main comparison view ─────────────────────────────────────────────────────

function ComparisonView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean);

  const [metrics, setMetrics] = useState<CarMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length < 2) { setLoading(false); return; }
    Promise.all(ids.map(id => fetch(`/api/cars/${id}`).then(r => r.json())))
      .then(results => {
        const valid = results.filter((r): r is CarWithDetails => !!r.car && !!r.running_costs && !!r.finance);
        setMetrics(valid.map(calcMetrics));
      })
      .catch(() => setError('Failed to load comparison data.'))
      .finally(() => setLoading(false));
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ids.length < 2) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-semibold text-white mb-2">No cars selected</h2>
        <p className="text-gray-400 mb-6">Select at least 2 cars from your garage to compare them.</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          ← Back to Garage
        </button>
      </div>
    );
  }

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-32 animate-pulse" />)}
    </div>
  );

  if (error || metrics.length === 0) return (
    <div className="text-center py-24">
      <p className="text-gray-400 mb-4">{error ?? 'Could not load car data.'}</p>
      <button onClick={() => router.push('/')} className="text-blue-400 hover:text-blue-300">← Back to garage</button>
    </div>
  );

  // ── Chart data ──────────────────────────────────────────────────────────

  const monthlyChartData = metrics.map((m, i) => ({
    name: m.car.nickname.length > 14 ? m.car.nickname.slice(0, 14) + '…' : m.car.nickname,
    Finance: Math.round(m.monthly_finance_cost),
    Running: Math.round(m.monthly_running_cost),
    color: CAR_COLORS[i % CAR_COLORS.length],
  }));

  const tcoChartData = metrics.map((m, i) => ({
    name: m.car.nickname.length > 14 ? m.car.nickname.slice(0, 14) + '…' : m.car.nickname,
    TCO: Math.round(m.tco),
    color: CAR_COLORS[i % CAR_COLORS.length],
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-sm mb-2 flex items-center gap-1 transition-colors">
            ← Garage
          </button>
          <h1 className="text-3xl font-bold text-white">Comparison</h1>
          <p className="text-gray-400 mt-1">Comparing {metrics.length} cars</p>
        </div>
      </div>

      {/* Car header cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
        {metrics.map((m, i) => (
          <div key={m.car.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="w-3 h-3 rounded-full mb-3" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
              {m.car.year} · {m.car.fuel_type}
            </p>
            <h3 className="text-white font-semibold text-lg leading-tight mb-1">{m.car.nickname}</h3>
            <div className="inline-block text-xs text-gray-500 bg-gray-800 rounded-full px-2.5 py-0.5 mb-3">
              {FINANCE_LABELS[m.finance.finance_type]}
            </div>
            <p className="text-3xl font-bold text-white">{fmtMo(m.total_monthly_cost)}</p>
            <p className="text-gray-500 text-xs mt-0.5">total per month</p>
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">TCO</span>
                <span className="text-gray-300 font-medium">{fmt(m.tco)}</span>
              </div>
              {(() => {
                const ft = m.finance.finance_type;
                const price = m.finance.purchase_price ?? 0;
                const dep = m.finance.depreciation_rate ?? 15;
                const years = m.tco_months / 12;
                const showDep = price > 0 && ft !== 'lease' && !(ft === 'pcp' && m.finance.pcp_end_action !== 'buy');
                const depLoss = showDep ? price - price * Math.pow(1 - dep / 100, years) : 0;
                return showDep ? (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Depreciation loss</span>
                    <span className="text-red-400 font-medium">−{fmt(depLoss)}</span>
                  </div>
                ) : null;
              })()}
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">per mile</span>
                <span className="text-gray-300 font-medium">{(m.cost_per_mile * 100).toFixed(1)}p</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly cost breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-1">Monthly Cost Breakdown</h3>
          <p className="text-gray-500 text-xs mb-5">Finance vs running costs per month</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyChartData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `£${v}`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, color: '#9ca3af' }} />
              <Bar dataKey="Finance" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Running" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* TCO comparison */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-1">Total Cost of Ownership</h3>
          <p className="text-gray-500 text-xs mb-5">Net cost over each car's term (incl. running costs)</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tcoChartData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="TCO" radius={[4, 4, 0, 0]}>
                {tcoChartData.map((entry, i) => (
                  <Cell key={i} fill={CAR_COLORS[i % CAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed comparison table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Detailed Breakdown</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            <span className="text-emerald-400">Green</span> = best value · <span className="text-amber-400">Amber</span> = highest cost
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium py-3 px-6 w-48">Metric</th>
                {metrics.map((m, i) => (
                  <th key={m.car.id} className="text-left py-3 px-4 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
                      <span className="text-white font-semibold truncate">{m.car.nickname}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row, rowIdx) => {
                const numbers = row.getNumber ? metrics.map(row.getNumber) : [];
                const isSection = !!row.section;
                return (
                  <>
                    {isSection && (
                      <tr key={`section-${rowIdx}`}>
                        <td colSpan={metrics.length + 1} className="px-6 py-3 bg-gray-950 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {row.section}
                        </td>
                      </tr>
                    )}
                    <tr
                      key={row.label}
                      className={`border-t border-gray-800/50 ${rowIdx % 2 === 0 ? '' : 'bg-gray-800/20'}`}
                    >
                      <td className="py-3 px-6 text-gray-400">{row.label}</td>
                      {metrics.map((m, i) => {
                        const cellNumber = row.getNumber ? row.getNumber(m) : 0;
                        const cellClass = row.getNumber ? highlightClass(cellNumber, numbers, row.lowerIsBetter ?? true) : '';
                        return (
                          <td key={m.car.id} className={`py-3 px-4 font-medium ${cellClass || 'text-gray-200'}`}>
                            {row.getValue(m)}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assumptions note */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 text-xs text-gray-500 space-y-1">
        <p className="text-gray-400 font-medium mb-2">Assumptions & Notes</p>
        <p>· Depreciation is estimated using a compound annual rate applied to the purchase price. Actual resale values vary by make, model, condition, and market.</p>
        <p>· TCO for Cash/Loan/HP deducts the estimated residual value; for PCP (hand back) and Lease, it doesn't (you return the car).</p>
        <p>· Fuel costs use UK imperial MPG (1 gallon = 4.546 litres). Electric efficiency uses miles per kWh.</p>
        <p>· For Bank Loan, monthly payment is calculated using standard amortisation: P × [r(1+r)ⁿ] / [(1+r)ⁿ − 1].</p>
        <p>· Lease effective monthly cost spreads the initial rental over the contract term for fair comparison.</p>
      </div>
    </div>
  );
}

// Suspense wrapper required for useSearchParams in Next.js App Router
export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-32 animate-pulse" />)}
      </div>
    }>
      <ComparisonView />
    </Suspense>
  );
}
