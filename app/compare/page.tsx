'use client';

import { useEffect, useState, useMemo, Suspense, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { CarWithDetails, CarMetrics } from '@/lib/types';
import { calcMetrics, getTermMonths, calcMoneyBreakdown, BreakdownType } from '@/lib/calculations';

const DEFAULT_FUEL_PRICE = 155;
const DEFAULT_ELECTRICITY_PRICE = 57;

// ─── Constants ────────────────────────────────────────────────────────────────

const CAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

const BREAKDOWN_COLORS: Record<BreakdownType, string> = {
  running: '#10b981',
  depreciation: '#ef4444',
  interest: '#f59e0b',
  lost_payments: '#6366f1',
  equity: '#14b8a6',
};

const FINANCE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_loan: 'Bank Loan', hp: 'HP', pcp: 'PCP', lease: 'Lease / PCH',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHLY_BUDGET = 800;
const SAVINGS_POT = 4_000;

const fmt = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const fmtMo = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}/mo`;
const fmtSigned = (n: number) => n >= 0 ? fmt(n) : `-£${Math.round(-n).toLocaleString('en-GB')}`;
const pct = (n: number | null) => n !== null ? `${n}%` : '—';
const dash = (v: number | null | undefined, formatter = fmt) => (v != null && v > 0) ? formatter(v) : '—';

function highlightClass(value: number, allValues: number[], lowerIsBetter = true): string {
  if (allValues.length < 2 || value === 0) return '';
  const nonZero = allValues.filter(v => v > 0);
  if (nonZero.length < 2) return '';
  const best = lowerIsBetter ? Math.min(...nonZero) : Math.max(...nonZero);
  const worst = lowerIsBetter ? Math.max(...nonZero) : Math.min(...nonZero);
  if (value === best) return 'text-emerald-400';
  if (value === worst) return 'text-amber-400';
  return '';
}

// ─── Comparison table rows ─────────────────────────────────────────────────

interface RowDef {
  label: string;
  getValue: (m: CarMetrics) => string;
  getNumber?: (m: CarMetrics) => number;
  section?: string;
  note?: string;
  lowerIsBetter?: boolean;
}

function calcTotalEquity(m: CarMetrics): number {
  const ft = m.finance.finance_type;
  const price = m.finance.purchase_price ?? 0;
  const dep = m.finance.depreciation_rate ?? 15;
  const years = m.tco_months / 12;
  const extraSaved = (MONTHLY_BUDGET - m.total_monthly_cost) * m.tco_months;

  const upfront =
    ft === 'cash'  ? price
    : ft === 'lease' ? (m.finance.initial_rental_months ?? 3) * (m.finance.monthly_payment ?? 0)
    : (m.finance.deposit ?? 0);

  const savingsLeft = Math.max(0, SAVINGS_POT - upfront);

  const assetAtEnd =
    price > 0 && ft !== 'lease' && !(ft === 'pcp' && m.finance.pcp_end_action !== 'buy')
      ? price * Math.pow(1 - dep / 100, years)
      : 0;

  const balloon =
    ft === 'pcp' && m.finance.pcp_end_action === 'buy'
      ? (m.finance.balloon_payment ?? 0)
      : 0;

  return savingsLeft + extraSaved + assetAtEnd - balloon;
}

const TABLE_ROWS: RowDef[] = [
  { label: 'Finance Type', getValue: m => FINANCE_LABELS[m.finance.finance_type] ?? m.finance.finance_type, section: 'Finance' },
  { label: 'Purchase Price', getValue: m => dash(m.finance.purchase_price), getNumber: m => m.finance.purchase_price ?? 0 },
  { label: 'Deposit', getValue: m => {
    if (m.finance.finance_type === 'lease') return dash((m.finance.initial_rental_months ?? 0) * (m.finance.monthly_payment ?? 0));
    return dash(m.finance.deposit);
  }, getNumber: m => m.finance.finance_type === 'lease' ? (m.finance.initial_rental_months ?? 0) * (m.finance.monthly_payment ?? 0) : (m.finance.deposit ?? 0) },
  { label: 'Monthly Payment', getValue: m => {
    if (m.finance.finance_type === 'cash') return `${fmtMo(m.monthly_finance_cost)} (dep.)`;
    if (m.finance.finance_type === 'bank_loan') return `${fmtMo(m.monthly_finance_cost)} (calc.)`;
    return fmtMo(m.finance.monthly_payment ?? 0);
  }, getNumber: m => m.monthly_finance_cost },
  { label: 'Term', getValue: m => {
    const months = getTermMonths(m.finance);
    if (m.finance.finance_type === 'cash') return `${m.finance.ownership_years ?? 3} yrs`;
    if (m.finance.finance_type === 'lease') return `${m.finance.initial_rental_months ?? 3}+${months} mo`;
    return `${months} mo`;
  }},
  { label: 'APR', getValue: m => m.finance.finance_type === 'bank_loan' ? pct(m.finance.apr) : '—' },
  { label: 'Balloon / GMFV', getValue: m => m.finance.finance_type === 'pcp' ? dash(m.finance.balloon_payment) : '—', getNumber: m => m.finance.finance_type === 'pcp' ? (m.finance.balloon_payment ?? 0) : 0 },
  { label: 'End of Term', getValue: m => {
    if (m.finance.finance_type === 'pcp') return m.finance.pcp_end_action === 'buy' ? 'Buy balloon' : 'Hand back';
    if (m.finance.finance_type === 'lease') return 'Return car';
    return 'You own it';
  }},
  { label: 'Depreciation', getValue: m => ['cash','bank_loan','hp'].includes(m.finance.finance_type) || (m.finance.finance_type === 'pcp' && m.finance.pcp_end_action === 'buy') ? pct(m.finance.depreciation_rate) : '—' },
  { label: 'Residual Value', lowerIsBetter: false, getValue: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 'N/A';
    const dep = m.finance.depreciation_rate ?? 15;
    return fmt(price * Math.pow(1 - dep / 100, m.tco_months / 12));
  }, getNumber: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 0;
    return price * Math.pow(1 - (m.finance.depreciation_rate ?? 15) / 100, m.tco_months / 12);
  }},
  { label: 'Dep. Loss', getValue: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 'N/A';
    const dep = m.finance.depreciation_rate ?? 15;
    return `−${fmt(price - price * Math.pow(1 - dep / 100, m.tco_months / 12))}`;
  }, getNumber: m => {
    const ft = m.finance.finance_type;
    const price = m.finance.purchase_price ?? 0;
    if (!price || ft === 'lease' || (ft === 'pcp' && m.finance.pcp_end_action !== 'buy')) return 0;
    return price - price * Math.pow(1 - (m.finance.depreciation_rate ?? 15) / 100, m.tco_months / 12);
  }},

  { label: 'Finance / mo', getValue: m => fmtMo(m.monthly_finance_cost), getNumber: m => m.monthly_finance_cost, section: 'Monthly Summary' },
  { label: 'Running / mo', getValue: m => fmtMo(m.monthly_running_cost), getNumber: m => m.monthly_running_cost },
  { label: 'Total / mo', getValue: m => fmtMo(m.total_monthly_cost), getNumber: m => m.total_monthly_cost },
  { label: 'Kept %', lowerIsBetter: false, getValue: m => {
    const breakdown = calcMoneyBreakdown(m.finance, m.annual_running_cost);
    const equity = breakdown.find(b => b.type === 'equity');
    if (!equity || equity.amount <= 0) return '0%';
    const total = breakdown.reduce((s, b) => s + b.amount, 0);
    return total > 0 ? `${Math.round(equity.amount / total * 100)}%` : '0%';
  }, getNumber: m => {
    const breakdown = calcMoneyBreakdown(m.finance, m.annual_running_cost);
    const equity = breakdown.find(b => b.type === 'equity');
    if (!equity || equity.amount <= 0) return 0;
    const total = breakdown.reduce((s, b) => s + b.amount, 0);
    return total > 0 ? equity.amount / total * 100 : 0;
  }},

  { label: 'TCO', getValue: m => fmt(m.tco), getNumber: m => m.tco, section: 'Ownership' },
  { label: 'Annual Mileage', getValue: m => `${m.running_costs.annual_mileage.toLocaleString('en-GB')} mi/yr` },
  { label: 'Cost / mile', getValue: m => `${(m.cost_per_mile * 100).toFixed(1)}p`, getNumber: m => m.cost_per_mile * 100 },
  { label: 'Extra Saved', lowerIsBetter: false, getValue: m => fmtSigned((MONTHLY_BUDGET - m.total_monthly_cost) * m.tco_months), getNumber: m => (MONTHLY_BUDGET - m.total_monthly_cost) * m.tco_months },
  {
    label: 'Total Equity at End of Term',
    note: `£${(SAVINGS_POT / 1000).toFixed(0)}k savings − upfront + extra saved + asset`,
    lowerIsBetter: false,
    getValue: m => fmtSigned(calcTotalEquity(m)),
    getNumber: m => calcTotalEquity(m),
  },
];

// ─── Custom tooltip ───────────────────────────────────────────────────────────

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

  const [cars, setCars] = useState<CarWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fuelPrice, setFuelPrice] = useState(DEFAULT_FUEL_PRICE);
  const [electricityPrice, setElectricityPrice] = useState(DEFAULT_ELECTRICITY_PRICE);
  const [showStickyLegend, setShowStickyLegend] = useState(false);

  const carCardsRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() =>
    cars.map(d => calcMetrics({
      ...d,
      running_costs: { ...d.running_costs, fuel_price_ppl: fuelPrice, electricity_price_pkwh: electricityPrice },
    })),
    [cars, fuelPrice, electricityPrice]
  );

  // Show sticky legend when car cards scroll out of view
  useEffect(() => {
    if (!carCardsRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyLegend(!entry.isIntersecting),
      { rootMargin: '-80px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(carCardsRef.current);
    return () => obs.disconnect();
  }, [metrics.length]);

  const syncHeaderScroll = useCallback(() => {
    if (headerScrollRef.current && tableScrollRef.current) {
      headerScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    if (ids.length < 2) { setLoading(false); return; }
    Promise.all(ids.map(id => fetch(`/api/cars/${id}`).then(r => r.json())))
      .then(results => {
        const valid = results.filter((r): r is CarWithDetails => !!r.car && !!r.running_costs && !!r.finance);
        setCars(valid);
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

  if (error || cars.length === 0) return (
    <div className="text-center py-24">
      <p className="text-gray-400 mb-4">{error ?? 'Could not load car data.'}</p>
      <button onClick={() => router.push('/')} className="text-blue-400 hover:text-blue-300">← Back to garage</button>
    </div>
  );

  const stickyTableTop = showStickyLegend ? '104px' : '64px';

  const monthlyChartData = metrics.map((m, i) => ({
    name: m.car.nickname.length > 12 ? m.car.nickname.slice(0, 12) + '…' : m.car.nickname,
    Finance: Math.round(m.monthly_finance_cost),
    Running: Math.round(m.monthly_running_cost),
    color: CAR_COLORS[i % CAR_COLORS.length],
  }));

  const tcoChartData = metrics.map((m, i) => ({
    name: m.car.nickname.length > 12 ? m.car.nickname.slice(0, 12) + '…' : m.car.nickname,
    TCO: Math.round(m.tco),
    color: CAR_COLORS[i % CAR_COLORS.length],
  }));

  return (
    <div className="space-y-5 pb-8">

      {/* ── Sticky car legend — fixed below nav when cards scroll out of view ── */}
      {showStickyLegend && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-md border-b border-gray-800/80 shadow-md">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <span className="text-gray-600 text-xs flex-shrink-0 mr-1">Comparing:</span>
            {metrics.map((m, i) => (
              <div key={m.car.id} className="flex items-center gap-1.5 flex-shrink-0 bg-gray-800/80 rounded-full px-2.5 py-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
                <span className="text-white text-xs font-semibold whitespace-nowrap">{m.car.nickname}</span>
                <span className="text-gray-500 text-xs whitespace-nowrap">· {fmtMo(m.total_monthly_cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div>
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-sm mb-2 flex items-center gap-1 transition-colors">
          ← Garage
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Comparison</h1>
        <p className="text-gray-400 mt-1 text-sm">Comparing {metrics.length} cars</p>
      </div>

      {/* ── Global prices ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 sm:px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="text-gray-400 text-sm font-medium">Global Prices</span>
          <div className="flex items-center gap-2">
            <label className="text-gray-500 text-sm">Fuel</label>
            <div className="relative">
              <input
                type="number" min={0} step={0.5} value={fuelPrice}
                onChange={e => setFuelPrice(parseFloat(e.target.value) || DEFAULT_FUEL_PRICE)}
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm pr-8 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">p/L</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-500 text-sm">Electricity</label>
            <div className="relative">
              <input
                type="number" min={0} step={0.5} value={electricityPrice}
                onChange={e => setElectricityPrice(parseFloat(e.target.value) || DEFAULT_ELECTRICITY_PRICE)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm pr-12 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">p/kWh</span>
            </div>
          </div>
          <span className="text-gray-600 text-xs">Applied to all cars</span>
        </div>
      </div>

      {/* ── Car header cards — horizontal scroll on mobile ── */}
      <div ref={carCardsRef} className="overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="grid gap-3 pb-1" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(260px, 1fr))` }}>
          {metrics.map((m, i) => (
            <div key={m.car.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="w-3 h-3 rounded-full mb-3" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">{m.car.year} · {m.car.fuel_type}</p>
              <h3 className="text-white font-semibold text-lg leading-tight mb-1">{m.car.nickname}</h3>
              <div className="inline-block text-xs text-gray-500 bg-gray-800 rounded-full px-2.5 py-0.5 mb-4">
                {FINANCE_LABELS[m.finance.finance_type]}
              </div>
              <p className="text-3xl font-bold text-white">{fmtMo(m.total_monthly_cost)}</p>
              <p className="text-gray-500 text-xs mt-0.5">total per month</p>
              <div className="mt-3 pt-3 border-t border-gray-800 space-y-1">
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
                  return showDep ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Dep. loss</span>
                      <span className="text-red-400 font-medium">−{fmt(price - price * Math.pow(1 - dep / 100, years))}</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">per mile</span>
                  <span className="text-gray-300 font-medium">{(m.cost_per_mile * 100).toFixed(1)}p</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold text-sm mb-0.5">Monthly Cost Breakdown</h3>
          <p className="text-gray-500 text-xs mb-4">Finance vs running costs</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyChartData} barSize={32} margin={{ top: 0, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `£${v}`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="Finance" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Running" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold text-sm mb-0.5">Total Cost of Ownership</h3>
          <p className="text-gray-500 text-xs mb-4">Net cost over term (incl. running)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tcoChartData} barSize={40} margin={{ top: 0, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="TCO" radius={[4, 4, 0, 0]}>
                {tcoChartData.map((_entry, i) => <Cell key={i} fill={CAR_COLORS[i % CAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Detailed breakdown table ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Detailed Breakdown</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            <span className="text-emerald-400">Green</span> = best · <span className="text-amber-400">Amber</span> = highest cost
          </p>
        </div>

        {/* Sticky header row — syncs scroll with the table body below */}
        <div
          className="sticky z-20 bg-gray-900 border-b-2 border-gray-700 shadow-sm overflow-x-hidden"
          style={{ top: stickyTableTop }}
          ref={headerScrollRef}
        >
          <div className="flex text-sm" style={{ minWidth: 'max-content' }}>
            <div className="sticky left-0 bg-gray-900 flex-shrink-0 w-28 sm:w-40 py-3 px-3 sm:px-5 text-gray-500 font-medium z-10 border-r border-gray-800/50">
              Metric
            </div>
            {metrics.map((m, i) => (
              <div key={m.car.id} className="flex-shrink-0 min-w-[120px] sm:min-w-[150px] py-3 px-3 sm:px-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
                  <span className="text-white font-semibold truncate text-xs sm:text-sm">{m.car.nickname}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable table body */}
        <div className="overflow-x-auto" ref={tableScrollRef} onScroll={syncHeaderScroll}>
          <table className="w-full text-sm">
            <tbody>
              {TABLE_ROWS.map((row, rowIdx) => {
                const numbers = row.getNumber ? metrics.map(row.getNumber) : [];
                return (
                  <>
                    {row.section && (
                      <tr key={`section-${rowIdx}`}>
                        <td colSpan={metrics.length + 1} className="px-3 sm:px-5 py-2.5 bg-gray-950 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {row.section}
                        </td>
                      </tr>
                    )}
                    <tr key={row.label} className={`border-t border-gray-800/50 ${rowIdx % 2 === 0 ? '' : 'bg-gray-800/20'}`}>
                      <td className="py-3 px-3 sm:px-5 text-gray-400 text-xs sm:text-sm w-28 sm:w-40 sticky left-0 bg-gray-900 z-10 border-r border-gray-800/50">
                        {row.label}
                        {row.note && <div className="text-gray-600 text-[10px] mt-0.5 leading-tight">{row.note}</div>}
                      </td>
                      {metrics.map((m, i) => {
                        const cellNumber = row.getNumber ? row.getNumber(m) : 0;
                        const cellClass = row.getNumber ? highlightClass(cellNumber, numbers, row.lowerIsBetter ?? true) : '';
                        return (
                          <td key={m.car.id} className={`py-3 px-3 sm:px-4 font-medium text-xs sm:text-sm min-w-[120px] sm:min-w-[150px] ${cellClass || 'text-gray-200'}`}>
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

      {/* ── Where Your Money Goes — horizontal scroll on mobile ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Where Your Money Goes</h3>
          <p className="text-gray-500 text-xs mt-0.5">Total money spent or retained over the ownership period</p>
        </div>

        <div className="overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <div className="grid gap-6 p-4 sm:p-6" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(280px, 1fr))` }}>
            {metrics.map((m, i) => {
              const breakdown = calcMoneyBreakdown(m.finance, m.annual_running_cost);
              const costs = breakdown.filter(b => b.type !== 'equity');
              const equity = breakdown.find(b => b.type === 'equity');
              const barTotal = breakdown.reduce((s, b) => s + b.amount, 0);
              const netCost = costs.reduce((s, b) => s + b.amount, 0);
              return (
                <div key={m.car.id}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAR_COLORS[i % CAR_COLORS.length] }} />
                    <p className="text-white font-semibold text-sm truncate">{m.car.nickname}</p>
                  </div>

                  {/* Stacked bar */}
                  <div className="h-2.5 rounded-full overflow-hidden flex mb-1 gap-px">
                    {costs.map((item, j) => (
                      <div key={j} style={{ width: `${(item.amount / barTotal) * 100}%`, background: BREAKDOWN_COLORS[item.type] }} />
                    ))}
                    {equity && (
                      <div style={{ width: `${(equity.amount / barTotal) * 100}%`, background: BREAKDOWN_COLORS.equity }} />
                    )}
                  </div>
                  {equity && (
                    <div className="flex justify-between text-xs text-gray-600 mb-3">
                      <span>← spent</span>
                      <span>retained →</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {costs.map((item, j) => (
                      <div key={j}>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: BREAKDOWN_COLORS[item.type] }} />
                            <span className="text-gray-400">{item.label}</span>
                          </div>
                          <span className={`font-semibold ${item.type === 'running' ? 'text-emerald-400' : item.type === 'interest' ? 'text-amber-400' : item.type === 'depreciation' ? 'text-red-400' : 'text-indigo-400'}`}>
                            −{fmt(item.amount)}
                          </span>
                        </div>
                        {item.note && <p className="text-gray-600 text-xs ml-4 mt-0.5">{item.note}</p>}
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm border-t border-gray-800 pt-2.5">
                      <span className="text-gray-400 font-medium">Net cost</span>
                      <span className="text-white font-bold">−{fmt(netCost)}</span>
                    </div>
                    {equity && (
                      <div className="bg-teal-950/40 border border-teal-800/40 rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0 bg-teal-500" />
                            <span className="text-teal-300 font-medium">{equity.label}</span>
                          </div>
                          <span className="text-teal-300 font-bold">+{fmt(equity.amount)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-600 pt-0.5">
                      <span>Over {Math.round(m.tco_months / 12 * 10) / 10} yrs</span>
                      <span>{fmt(netCost / m.tco_months)}/mo effective</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 sm:px-6 pb-5 pt-1 flex flex-wrap gap-3 border-t border-gray-800/50">
          {([
            { type: 'running', label: 'Running costs' },
            { type: 'depreciation', label: 'Depreciation' },
            { type: 'interest', label: 'Interest / charges' },
            { type: 'lost_payments', label: 'Payments (no equity)' },
            { type: 'equity', label: 'Asset retained' },
          ] as const).map(({ type, label }) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: BREAKDOWN_COLORS[type] }} />
              {label}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

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
