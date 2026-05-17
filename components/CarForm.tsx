'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CarWithDetails, CarFormData, defaultFormData, FuelType, FinanceType, FormFinance, FormRunningCosts } from '@/lib/types';
import { calcLoanMonthlyPayment, calcAnnualFuelCost } from '@/lib/calculations';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <h2 className="text-white font-semibold text-lg">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';
const selectCls = inputCls + ' cursor-pointer';

function CurrencyInput({ value, onChange, placeholder = '0', min = 0 }: {
  value: number; onChange: (v: number) => void; placeholder?: string; min?: number;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
      <input
        type="number" min={min} step="1" value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
        className={`${inputCls} pl-8`}
      />
    </div>
  );
}

function NumberInput({ value, onChange, suffix, placeholder = '0', min = 0, step = 1 }: {
  value: number; onChange: (v: number) => void; suffix?: string; placeholder?: string; min?: number; step?: number;
}) {
  return (
    <div className="relative">
      <input
        type="number" min={min} step={step} value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
        className={suffix ? `${inputCls} pr-12` : inputCls}
      />
      {suffix && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{suffix}</span>
      )}
    </div>
  );
}

function GridRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

function DepreciationEstimator({ value, onChange, make, model, year, fuelType, annualMileage }: {
  value: number; onChange: (v: number) => void;
  make: string; model: string; year: number; fuelType: FuelType; annualMileage: number;
}) {
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState<{ rate: number; year1_rate?: number; explanation: string; confidence: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const canEstimate = !!(make && model);

  const handleEstimate = async () => {
    setEstimating(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch('/api/depreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ make, model, year, fuel_type: fuelType, annual_mileage: annualMileage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setResult(data);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Estimation failed');
    } finally {
      setEstimating(false);
    }
  };

  const confidenceColor = result?.confidence === 'high' ? 'text-emerald-400' : result?.confidence === 'low' ? 'text-amber-400' : 'text-blue-400';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">Annual Depreciation</label>
      <div className="flex gap-2">
        <div className="flex-1">
          <NumberInput value={value} onChange={onChange} suffix="%" step={0.5} min={0} />
        </div>
        <button
          onClick={handleEstimate}
          disabled={!canEstimate || estimating}
          title={!canEstimate ? 'Fill in make and model first' : `Estimate depreciation for the ${year} ${make} ${model}`}
          className="flex-shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-violet-900/30 hover:bg-violet-900/50 text-violet-300 border-violet-800"
        >
          {estimating ? '…' : '✨ AI'}
        </button>
      </div>
      {apiError && (
        <p className="text-red-400 text-xs mt-1.5">{apiError}</p>
      )}
      {result && (
        <div className="mt-2 bg-violet-950/40 border border-violet-800/50 rounded-lg p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-violet-200 font-semibold">{result.rate}%/yr compound</span>
              {result.year1_rate && result.year1_rate !== result.rate && (
                <span className="text-gray-500 text-xs ml-2">(yr 1: ~{result.year1_rate}%)</span>
              )}
              <span className={`text-xs ml-2 ${confidenceColor}`}>· {result.confidence} confidence</span>
            </div>
            <button
              onClick={() => { onChange(result.rate); setResult(null); }}
              className="flex-shrink-0 text-xs bg-violet-600 hover:bg-violet-500 text-white px-3 py-1 rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">{result.explanation}</p>
        </div>
      )}
      <p className="text-xs text-gray-600 mt-1">
        {canEstimate ? '✨ AI button gives a model-specific estimate' : 'Fill in make & model above to enable AI estimate'}
      </p>
    </div>
  );
}

// Finance type descriptions
const FINANCE_DESCRIPTIONS: Record<FinanceType, string> = {
  cash:      'Pay upfront. We estimate your monthly depreciation loss as the effective cost.',
  bank_loan: 'Borrow from a bank or lender. You own the car from day one. Monthly payment is calculated from your inputs.',
  hp:        'Hire Purchase: monthly payments through a dealership. You own the car once all payments are made.',
  pcp:       'Personal Contract Purchase: lower monthly payments with a final balloon payment (GMFV). Option to hand back, buy, or part-ex.',
  lease:     'Personal Contract Hire: you never own the car. Fixed monthly payments for an agreed term and mileage.',
};

function mapCarToForm(data: CarWithDetails): CarFormData {
  const { car, running_costs: rc, finance: f } = data;
  return {
    nickname: car.nickname,
    year: car.year,
    make: car.make,
    model: car.model,
    colour: car.colour ?? '',
    fuel_type: car.fuel_type,
    running_costs: {
      insurance: rc.insurance,
      ved: rc.ved,
      annual_mileage: rc.annual_mileage,
      fuel_method: rc.fuel_method,
      fuel_annual: rc.fuel_annual ?? 0,
      mpg: rc.mpg ?? 35,
      miles_per_kwh: rc.miles_per_kwh ?? 3.5,
      mot: rc.mot,
      servicing: rc.servicing,
      tyres: rc.tyres,
    },
    finance: {
      finance_type: f.finance_type,
      purchase_price: f.purchase_price ?? 0,
      deposit: f.deposit ?? 0,
      term_months: f.term_months ?? 48,
      monthly_payment: f.monthly_payment ?? 0,
      apr: f.apr ?? 7,
      balloon_payment: f.balloon_payment ?? 0,
      pcp_end_action: f.pcp_end_action ?? 'hand_back',
      initial_rental_months: f.initial_rental_months ?? 3,
      lease_annual_mileage: f.lease_annual_mileage ?? 10000,
      ownership_years: f.ownership_years ?? 3,
      depreciation_rate: f.depreciation_rate ?? 15,
    },
  };
}

// ─── Main Form ────────────────────────────────────────────────────────────────

interface CarFormProps {
  initialData?: CarWithDetails;
}

export function CarForm({ initialData }: CarFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CarFormData>(
    initialData ? mapCarToForm(initialData) : defaultFormData
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nicknameEdited, setNicknameEdited] = useState(!!initialData);

  // Auto-generate nickname from year + make + model
  useEffect(() => {
    if (!nicknameEdited && form.make && form.model) {
      setForm(prev => ({
        ...prev,
        nickname: `${prev.year} ${prev.make} ${prev.model}`,
      }));
    }
  }, [form.year, form.make, form.model, nicknameEdited]);

  // Helpers to update nested state
  const setFinance = (patch: Partial<FormFinance>) =>
    setForm(prev => ({ ...prev, finance: { ...prev.finance, ...patch } }));
  const setRC = (patch: Partial<FormRunningCosts>) =>
    setForm(prev => ({ ...prev, running_costs: { ...prev.running_costs, ...patch } }));

  // Live bank loan monthly payment calculation
  const calcLoanPayment = useMemo(() => {
    if (form.finance.finance_type !== 'bank_loan') return null;
    const principal = form.finance.purchase_price - form.finance.deposit;
    if (principal <= 0) return 0;
    return calcLoanMonthlyPayment(principal, form.finance.apr, form.finance.term_months);
  }, [form.finance.finance_type, form.finance.purchase_price, form.finance.deposit, form.finance.apr, form.finance.term_months]);

  // Live annual fuel estimate (uses default global prices of 148p/L, 28p/kWh)
  const estimatedFuelCost = useMemo(() => {
    if (form.running_costs.fuel_method === 'manual') return null;
    const rc = {
      ...form.running_costs,
      fuel_price_ppl: 148,
      electricity_price_pkwh: 28,
      breakdown_cover: 0,
      parking: 0,
      other: 0,
      fuel_annual: null,
      fuel_method: 'calculated' as const,
      id: '', car_id: '',
    };
    return calcAnnualFuelCost(rc, form.fuel_type);
  }, [form.running_costs, form.fuel_type]);

  const handleSubmit = async () => {
    if (!form.make || !form.model || !form.year) {
      setError('Please fill in make, model, and year.');
      return;
    }

    const payload = {
      ...form,
      nickname: form.nickname || `${form.year} ${form.make} ${form.model}`,
      running_costs: {
        ...form.running_costs,
        fuel_annual: form.running_costs.fuel_method === 'manual' ? form.running_costs.fuel_annual : null,
      },
    };

    setSaving(true);
    setError(null);
    try {
      const url = initialData ? `/api/cars/${initialData.car.id}` : '/api/cars';
      const method = initialData ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ft = form.finance.finance_type;
  const fuelType = form.fuel_type;
  const isElectric = fuelType === 'electric';
  const showsDepreciation = ft === 'cash' || ft === 'bank_loan' || ft === 'hp' || (ft === 'pcp' && form.finance.pcp_end_action === 'buy');

  const FINANCE_TABS: { key: FinanceType; label: string }[] = [
    { key: 'cash', label: 'Cash' },
    { key: 'bank_loan', label: 'Bank Loan' },
    { key: 'hp', label: 'HP' },
    { key: 'pcp', label: 'PCP' },
    { key: 'lease', label: 'Lease / PCH' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-white">{initialData ? 'Edit Car' : 'Add a Car'}</h1>
        <p className="text-gray-400 mt-1">Fill in the details below to add this car to your comparison garage.</p>
      </div>

      {/* ─── Section 1: Vehicle Details ─────────────────────────────────────── */}
      <Section title="Vehicle Details" icon="🚗">
        <GridRow>
          <Field label="Year">
            <NumberInput value={form.year} onChange={v => setForm(p => ({ ...p, year: v }))} min={1980} placeholder="2019" />
          </Field>
          <Field label="Fuel Type">
            <select value={form.fuel_type} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value as FuelType }))} className={selectCls}>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="phev">PHEV</option>
              <option value="electric">Electric</option>
            </select>
          </Field>
        </GridRow>
        <GridRow>
          <Field label="Make">
            <input value={form.make} onChange={e => setForm(p => ({ ...p, make: e.target.value }))} placeholder="e.g. Mazda" className={inputCls} />
          </Field>
          <Field label="Model">
            <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="e.g. MX-5" className={inputCls} />
          </Field>
        </GridRow>
        <GridRow>
          <Field label="Colour" hint="Optional">
            <input value={form.colour} onChange={e => setForm(p => ({ ...p, colour: e.target.value }))} placeholder="e.g. Soul Red" className={inputCls} />
          </Field>
          <Field label="Nickname" hint="Auto-generated from year/make/model. Override if needed.">
            <input
              value={form.nickname}
              onChange={e => { setNicknameEdited(true); setForm(p => ({ ...p, nickname: e.target.value })); }}
              placeholder={`${form.year} ${form.make} ${form.model}`}
              className={inputCls}
            />
          </Field>
        </GridRow>
      </Section>

      {/* ─── Section 2: Finance ─────────────────────────────────────────────── */}
      <Section title="Finance" icon="💰">
        {/* Finance type tabs */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Finance Type</p>
          <div className="flex flex-wrap gap-2">
            {FINANCE_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFinance({ finance_type: key })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  ft === key
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">{FINANCE_DESCRIPTIONS[ft]}</p>
        </div>

        {/* Cash */}
        {ft === 'cash' && (
          <>
            <Field label="Purchase Price">
              <CurrencyInput value={form.finance.purchase_price} onChange={v => setFinance({ purchase_price: v })} placeholder="15000" />
            </Field>
            <GridRow>
              <Field label="Planned Ownership" hint="How long do you plan to keep it?">
                <NumberInput value={form.finance.ownership_years} onChange={v => setFinance({ ownership_years: v })} suffix="years" min={1} />
              </Field>
              <DepreciationEstimator
                value={form.finance.depreciation_rate}
                onChange={v => setFinance({ depreciation_rate: v })}
                make={form.make} model={form.model} year={form.year}
                fuelType={form.fuel_type} annualMileage={form.running_costs.annual_mileage}
              />
            </GridRow>
            {form.finance.purchase_price > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Estimated value after {form.finance.ownership_years} yr{form.finance.ownership_years !== 1 ? 's' : ''}</span>
                  <span className="text-white">£{Math.round(form.finance.purchase_price * Math.pow(1 - form.finance.depreciation_rate / 100, form.finance.ownership_years)).toLocaleString('en-GB')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Depreciation loss</span>
                  <span className="text-red-400">
                    £{Math.round(form.finance.purchase_price - form.finance.purchase_price * Math.pow(1 - form.finance.depreciation_rate / 100, form.finance.ownership_years)).toLocaleString('en-GB')}
                  </span>
                </div>
                <div className="flex justify-between font-medium border-t border-gray-700 pt-1 mt-1">
                  <span className="text-gray-300">Monthly depreciation cost</span>
                  <span className="text-white">
                    £{Math.round((form.finance.purchase_price - form.finance.purchase_price * Math.pow(1 - form.finance.depreciation_rate / 100, form.finance.ownership_years)) / (form.finance.ownership_years * 12)).toLocaleString('en-GB')}/mo
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Bank Loan */}
        {ft === 'bank_loan' && (
          <>
            <GridRow>
              <Field label="Purchase Price">
                <CurrencyInput value={form.finance.purchase_price} onChange={v => setFinance({ purchase_price: v })} placeholder="15000" />
              </Field>
              <Field label="Deposit">
                <CurrencyInput value={form.finance.deposit} onChange={v => setFinance({ deposit: v })} placeholder="0" />
              </Field>
            </GridRow>
            <GridRow>
              <Field label="APR" hint="Your personal loan rate">
                <NumberInput value={form.finance.apr} onChange={v => setFinance({ apr: v })} suffix="%" step={0.1} />
              </Field>
              <Field label="Term">
                <NumberInput value={form.finance.term_months} onChange={v => setFinance({ term_months: v })} suffix="months" />
              </Field>
            </GridRow>
            <GridRow>
              <DepreciationEstimator
                value={form.finance.depreciation_rate}
                onChange={v => setFinance({ depreciation_rate: v })}
                make={form.make} model={form.model} year={form.year}
                fuelType={form.fuel_type} annualMileage={form.running_costs.annual_mileage}
              />
              <Field label="Calculated Monthly Payment">
                <div className="bg-gray-800 border border-blue-800 rounded-lg px-4 py-2.5 text-blue-300 font-semibold text-lg">
                  £{calcLoanPayment !== null ? Math.round(calcLoanPayment).toLocaleString('en-GB') : '—'}/mo
                </div>
              </Field>
            </GridRow>
            {form.finance.purchase_price > 0 && calcLoanPayment !== null && (
              <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Loan amount</span>
                  <span className="text-white">£{(form.finance.purchase_price - form.finance.deposit).toLocaleString('en-GB')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total repaid (deposit + payments)</span>
                  <span className="text-white">£{Math.round(form.finance.deposit + calcLoanPayment * form.finance.term_months).toLocaleString('en-GB')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total interest</span>
                  <span className="text-red-400">£{Math.round(calcLoanPayment * form.finance.term_months - (form.finance.purchase_price - form.finance.deposit)).toLocaleString('en-GB')}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* HP */}
        {ft === 'hp' && (
          <>
            <GridRow>
              <Field label="Purchase Price">
                <CurrencyInput value={form.finance.purchase_price} onChange={v => setFinance({ purchase_price: v })} placeholder="15000" />
              </Field>
              <Field label="Deposit">
                <CurrencyInput value={form.finance.deposit} onChange={v => setFinance({ deposit: v })} placeholder="0" />
              </Field>
            </GridRow>
            <GridRow>
              <Field label="Monthly Payment" hint="As quoted by the dealer">
                <CurrencyInput value={form.finance.monthly_payment} onChange={v => setFinance({ monthly_payment: v })} placeholder="250" />
              </Field>
              <Field label="Term">
                <NumberInput value={form.finance.term_months} onChange={v => setFinance({ term_months: v })} suffix="months" />
              </Field>
            </GridRow>
            <DepreciationEstimator
              value={form.finance.depreciation_rate}
              onChange={v => setFinance({ depreciation_rate: v })}
              make={form.make} model={form.model} year={form.year}
              fuelType={form.fuel_type} annualMileage={form.running_costs.annual_mileage}
            />
          </>
        )}

        {/* PCP */}
        {ft === 'pcp' && (
          <>
            <GridRow>
              <Field label="Purchase Price (OTR)">
                <CurrencyInput value={form.finance.purchase_price} onChange={v => setFinance({ purchase_price: v })} placeholder="25000" />
              </Field>
              <Field label="Deposit">
                <CurrencyInput value={form.finance.deposit} onChange={v => setFinance({ deposit: v })} placeholder="0" />
              </Field>
            </GridRow>
            <GridRow>
              <Field label="Monthly Payment" hint="As quoted">
                <CurrencyInput value={form.finance.monthly_payment} onChange={v => setFinance({ monthly_payment: v })} placeholder="299" />
              </Field>
              <Field label="Term">
                <NumberInput value={form.finance.term_months} onChange={v => setFinance({ term_months: v })} suffix="months" />
              </Field>
            </GridRow>
            <GridRow>
              <Field label="Balloon (GMFV)" hint="Guaranteed Minimum Future Value — the optional final payment">
                <CurrencyInput value={form.finance.balloon_payment} onChange={v => setFinance({ balloon_payment: v })} placeholder="10000" />
              </Field>
              <Field label="End of Term Plan">
                <select value={form.finance.pcp_end_action} onChange={e => setFinance({ pcp_end_action: e.target.value as 'hand_back' | 'buy' })} className={selectCls}>
                  <option value="hand_back">Hand back</option>
                  <option value="buy">Pay balloon & keep</option>
                </select>
              </Field>
            </GridRow>
            {form.finance.pcp_end_action === 'buy' && (
              <DepreciationEstimator
                value={form.finance.depreciation_rate}
                onChange={v => setFinance({ depreciation_rate: v })}
                make={form.make} model={form.model} year={form.year}
                fuelType={form.fuel_type} annualMileage={form.running_costs.annual_mileage}
              />
            )}
            {form.finance.monthly_payment > 0 && form.finance.term_months > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Total paid (deposit + payments)</span>
                  <span className="text-white">£{Math.round(form.finance.deposit + form.finance.monthly_payment * form.finance.term_months).toLocaleString('en-GB')}</span>
                </div>
                {form.finance.pcp_end_action === 'buy' && (
                  <div className="flex justify-between">
                    <span>+ Balloon payment</span>
                    <span className="text-white">£{form.finance.balloon_payment.toLocaleString('en-GB')}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t border-gray-700 pt-1 mt-1">
                  <span className="text-gray-300">Total finance cost</span>
                  <span className="text-white">
                    £{Math.round(form.finance.deposit + form.finance.monthly_payment * form.finance.term_months + (form.finance.pcp_end_action === 'buy' ? form.finance.balloon_payment : 0)).toLocaleString('en-GB')}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Lease */}
        {ft === 'lease' && (
          <>
            <GridRow>
              <Field label="Monthly Payment" hint="As quoted, excl. initial rental">
                <CurrencyInput value={form.finance.monthly_payment} onChange={v => setFinance({ monthly_payment: v })} placeholder="299" />
              </Field>
              <Field label="Initial Rental" hint="Months paid upfront (e.g. 3 = '3+23' deal)">
                <NumberInput value={form.finance.initial_rental_months} onChange={v => setFinance({ initial_rental_months: v })} suffix="months" min={1} />
              </Field>
            </GridRow>
            <GridRow>
              <Field label="Contract Term" hint="Number of monthly payments after initial rental">
                <NumberInput value={form.finance.term_months} onChange={v => setFinance({ term_months: v })} suffix="months" />
              </Field>
              <Field label="Annual Mileage Allowance">
                <NumberInput value={form.finance.lease_annual_mileage} onChange={v => setFinance({ lease_annual_mileage: v })} suffix="mi/yr" />
              </Field>
            </GridRow>
            {form.finance.monthly_payment > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Initial rental ({form.finance.initial_rental_months} months)</span>
                  <span className="text-white">£{Math.round(form.finance.initial_rental_months * form.finance.monthly_payment).toLocaleString('en-GB')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{form.finance.term_months} monthly payments</span>
                  <span className="text-white">£{Math.round(form.finance.term_months * form.finance.monthly_payment).toLocaleString('en-GB')}</span>
                </div>
                <div className="flex justify-between font-medium border-t border-gray-700 pt-1 mt-1">
                  <span className="text-gray-300">Total finance cost</span>
                  <span className="text-white">£{Math.round((form.finance.initial_rental_months + form.finance.term_months) * form.finance.monthly_payment).toLocaleString('en-GB')}</span>
                </div>
                <p className="text-xs text-gray-600 pt-1">You will not own the car at the end of the lease.</p>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ─── Section 3: Annual Running Costs ───────────────────────────────── */}
      <Section title="Monthly Running Costs" icon="📊">
        <GridRow>
          <Field label="Insurance" hint="Monthly premium">
            <CurrencyInput value={Math.round(form.running_costs.insurance / 12 * 100) / 100} onChange={v => setRC({ insurance: v * 12 })} placeholder="67" />
          </Field>
          <Field label="Road Tax (VED)" hint="Monthly — check gov.uk/check-vehicle-tax">
            <CurrencyInput value={Math.round(form.running_costs.ved / 12 * 100) / 100} onChange={v => setRC({ ved: v * 12 })} placeholder="15" />
          </Field>
        </GridRow>

        <Field label="Annual Mileage" hint="Used to calculate monthly fuel cost">
          <NumberInput value={form.running_costs.annual_mileage} onChange={v => setRC({ annual_mileage: v })} suffix="miles/yr" />
        </Field>

        {/* Fuel section */}
        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">Fuel / Energy Cost</p>
          <div className="flex gap-2 mb-4">
            {(['calculated', 'manual'] as const).map(method => (
              <button
                key={method}
                onClick={() => setRC({ fuel_method: method })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  form.running_costs.fuel_method === method
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {method === 'calculated' ? 'Calculate from consumption' : 'Enter monthly amount'}
              </button>
            ))}
          </div>

          {form.running_costs.fuel_method === 'manual' ? (
            <Field label="Monthly Fuel / Electricity Cost">
              <CurrencyInput value={Math.round(form.running_costs.fuel_annual / 12 * 100) / 100} onChange={v => setRC({ fuel_annual: v * 12 })} placeholder="100" />
            </Field>
          ) : isElectric ? (
            <>
              <Field label="Efficiency" hint="Miles per kWh (typical: 3–4)">
                <NumberInput value={form.running_costs.miles_per_kwh} onChange={v => setRC({ miles_per_kwh: v })} suffix="mi/kWh" step={0.1} />
              </Field>
              <p className="text-xs text-gray-500 -mt-2">Electricity price is set globally on the comparison page (default: 28p/kWh).</p>
            </>
          ) : (
            <>
              <Field label="Fuel Economy" hint="MPG (combined)">
                <NumberInput value={form.running_costs.mpg} onChange={v => setRC({ mpg: v })} suffix="MPG" step={0.5} />
              </Field>
              <p className="text-xs text-gray-500 -mt-2">Fuel price is set globally on the comparison page (default: 148p/L).</p>
            </>
          )}

          {estimatedFuelCost !== null && (
            <div className="mt-2 bg-gray-800/50 rounded-lg px-4 py-2.5 flex justify-between items-center">
              <span className="text-gray-400 text-sm">Estimated monthly {isElectric ? 'charging' : 'fuel'} cost</span>
              <span className="text-white font-semibold">£{Math.round(estimatedFuelCost / 12).toLocaleString('en-GB')}/mo</span>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-600 -mt-1">Costs below are annual — enter the yearly total.</p>
        <GridRow>
          <Field label="MOT" hint="Annual test (typically £54.85)">
            <CurrencyInput value={form.running_costs.mot} onChange={v => setRC({ mot: v })} placeholder="55" />
          </Field>
          <Field label="Servicing & Maintenance" hint="Annual total">
            <CurrencyInput value={form.running_costs.servicing} onChange={v => setRC({ servicing: v })} placeholder="350" />
          </Field>
        </GridRow>
        <Field label="Tyres" hint="Annual average (replacement cost ÷ lifespan)">
          <CurrencyInput value={form.running_costs.tyres} onChange={v => setRC({ tyres: v })} placeholder="150" />
        </Field>
      </Section>

      {/* ─── Save ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors shadow-lg shadow-blue-600/20"
        >
          {saving ? 'Saving…' : initialData ? 'Save Changes' : 'Add to Garage'}
        </button>
      </div>
    </div>
  );
}
