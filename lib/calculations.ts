import { FuelType, RunningCosts, FinanceOption, CarMetrics, CarWithDetails } from './types';

const LITRES_PER_GALLON = 4.54609;

export function calcAnnualFuelCost(rc: RunningCosts, fuelType: FuelType): number {
  if (rc.fuel_method === 'manual' && rc.fuel_annual !== null) {
    return rc.fuel_annual ?? 0;
  }
  if (fuelType === 'electric') {
    const mpkwh = rc.miles_per_kwh ?? 3.5;
    const pkwh = rc.electricity_price_pkwh ?? 57;
    return mpkwh > 0 ? (rc.annual_mileage / mpkwh * pkwh) / 100 : 0;
  }
  // petrol, diesel, hybrid, phev — use MPG
  const mpg = rc.mpg ?? 35;
  const ppl = rc.fuel_price_ppl ?? 155;
  const litresPerMile = mpg > 0 ? LITRES_PER_GALLON / mpg : 0;
  return (rc.annual_mileage * litresPerMile * ppl) / 100;
}

export function calcAnnualRunningCost(rc: RunningCosts, fuelType: FuelType): number {
  return (
    (rc.insurance ?? 0) +
    (rc.ved ?? 0) +
    calcAnnualFuelCost(rc, fuelType) +
    (rc.mot ?? 0) +
    (rc.servicing ?? 0) +
    (rc.tyres ?? 0)
  );
}

export function calcLoanMonthlyPayment(principal: number, apr: number, termMonths: number): number {
  if (!principal || termMonths <= 0) return 0;
  if (!apr || apr === 0) return principal / termMonths;
  const r = apr / 12 / 100;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export function getTermMonths(finance: FinanceOption): number {
  if (finance.term_months && finance.term_months > 0) return finance.term_months;
  return (finance.ownership_years ?? 3) * 12;
}

function estimateEndValue(price: number, annualDepRate: number, years: number): number {
  return price * Math.pow(1 - annualDepRate / 100, years);
}

export function calcMonthlyFinanceCost(finance: FinanceOption): number {
  switch (finance.finance_type) {
    case 'cash': {
      const price = finance.purchase_price ?? 0;
      const years = finance.ownership_years ?? 3;
      const dep = finance.depreciation_rate ?? 15;
      const loss = price - estimateEndValue(price, dep, years);
      return years > 0 ? loss / (years * 12) : 0;
    }
    case 'bank_loan': {
      const principal = (finance.purchase_price ?? 0) - (finance.deposit ?? 0);
      return calcLoanMonthlyPayment(principal, finance.apr ?? 7, finance.term_months ?? 48);
    }
    case 'hp':
    case 'pcp':
      return finance.monthly_payment ?? 0;
    case 'lease': {
      const monthly = finance.monthly_payment ?? 0;
      const initMonths = finance.initial_rental_months ?? 3;
      const term = finance.term_months ?? 24;
      // Spread the initial rental over the term for a fair effective monthly
      return term > 0 ? monthly + (initMonths * monthly) / term : monthly;
    }
    default:
      return 0;
  }
}

export function calcTCO(finance: FinanceOption, annualRunning: number): number {
  const termMonths = getTermMonths(finance);
  const termYears = termMonths / 12;
  const totalRunning = annualRunning * termYears;
  const price = finance.purchase_price ?? 0;
  const deposit = finance.deposit ?? 0;

  switch (finance.finance_type) {
    case 'cash': {
      const dep = finance.depreciation_rate ?? 15;
      const endValue = estimateEndValue(price, dep, termYears);
      return (price - endValue) + totalRunning;
    }
    case 'bank_loan': {
      const principal = price - deposit;
      const monthly = calcLoanMonthlyPayment(principal, finance.apr ?? 7, finance.term_months ?? 48);
      const dep = finance.depreciation_rate ?? 15;
      const endValue = estimateEndValue(price, dep, termYears);
      return deposit + (monthly * termMonths) + totalRunning - endValue;
    }
    case 'hp': {
      const monthly = finance.monthly_payment ?? 0;
      const dep = finance.depreciation_rate ?? 15;
      const endValue = estimateEndValue(price, dep, termYears);
      return deposit + (monthly * termMonths) + totalRunning - endValue;
    }
    case 'pcp': {
      const monthly = finance.monthly_payment ?? 0;
      const paid = deposit + monthly * termMonths;
      if (finance.pcp_end_action === 'buy') {
        const balloon = finance.balloon_payment ?? 0;
        const dep = finance.depreciation_rate ?? 15;
        const endValue = estimateEndValue(price, dep, termYears);
        return paid + balloon + totalRunning - endValue;
      }
      // Hand back — you paid but own nothing
      return paid + totalRunning;
    }
    case 'lease': {
      const monthly = finance.monthly_payment ?? 0;
      const initMonths = finance.initial_rental_months ?? 3;
      return (initMonths * monthly) + (monthly * termMonths) + totalRunning;
    }
    default:
      return totalRunning;
  }
}

export function calcMetrics(data: CarWithDetails): CarMetrics {
  const { car, running_costs, finance } = data;
  const annualFuel = calcAnnualFuelCost(running_costs, car.fuel_type);
  const annualRunning = calcAnnualRunningCost(running_costs, car.fuel_type);
  const monthlyRunning = annualRunning / 12;
  const monthlyFinance = calcMonthlyFinanceCost(finance);
  const tcoMonths = getTermMonths(finance);
  const tco = calcTCO(finance, annualRunning);
  const costPerMile = running_costs.annual_mileage > 0
    ? (tco / tcoMonths * 12) / running_costs.annual_mileage
    : 0;

  return {
    car,
    running_costs,
    finance,
    annual_fuel_cost: annualFuel,
    annual_running_cost: annualRunning,
    monthly_running_cost: monthlyRunning,
    monthly_finance_cost: monthlyFinance,
    total_monthly_cost: monthlyFinance + monthlyRunning,
    tco,
    tco_months: tcoMonths,
    cost_per_mile: costPerMile,
  };
}

export type BreakdownType = 'running' | 'depreciation' | 'interest' | 'lost_payments' | 'equity';

export interface BreakdownItem {
  label: string;
  amount: number;
  type: BreakdownType;
  note?: string;
}

export const MONTHLY_BUDGET = 800;
export const SAVINGS_POT = 4_000;

export function calcEquityBuiltPerYear(m: CarMetrics, monthlyBudget: number = MONTHLY_BUDGET): number {
  const years = m.tco_months / 12;
  return years > 0 ? calcTotalEquity(m, monthlyBudget) / years : 0;
}

export interface EquityBreakdownPerYear {
  assetPerYear: number;
  savedFromBudgetPerYear: number;
}

export function calcEquityBreakdownPerYear(m: CarMetrics, monthlyBudget: number = MONTHLY_BUDGET): EquityBreakdownPerYear {
  const ft = m.finance.finance_type;
  const price = m.finance.purchase_price ?? 0;
  const dep = m.finance.depreciation_rate ?? 15;
  const years = m.tco_months / 12;
  // Use the rounded monthly cost so this matches the "Total / month" figure shown
  // on the card — otherwise sub-£1 fractions make it non-zero when the displayed
  // numbers are equal (e.g. £479 budget vs a £478.66 cost shown as £479).
  const extraSaved = (Math.round(monthlyBudget) - Math.round(m.total_monthly_cost)) * m.tco_months;

  const assetAtEnd =
    price > 0 && ft !== 'lease' && !(ft === 'pcp' && m.finance.pcp_end_action !== 'buy')
      ? price * Math.pow(1 - dep / 100, years)
      : 0;

  const balloon =
    ft === 'pcp' && m.finance.pcp_end_action === 'buy'
      ? (m.finance.balloon_payment ?? 0)
      : 0;

  return {
    assetPerYear: years > 0 ? (assetAtEnd - balloon) / years : 0,
    // Only the budget-based savings: (max monthly budget − total monthly cost),
    // annualised. The leftover savings pot is part of total equity, not budget savings.
    savedFromBudgetPerYear: years > 0 ? extraSaved / years : 0,
  };
}

export function calcTotalEquity(m: CarMetrics, monthlyBudget: number = MONTHLY_BUDGET): number {
  const ft = m.finance.finance_type;
  const price = m.finance.purchase_price ?? 0;
  const dep = m.finance.depreciation_rate ?? 15;
  const years = m.tco_months / 12;
  // Use the rounded monthly cost so this matches the "Total / month" figure shown
  // on the card — otherwise sub-£1 fractions make it non-zero when the displayed
  // numbers are equal (e.g. £479 budget vs a £478.66 cost shown as £479).
  const extraSaved = (Math.round(monthlyBudget) - Math.round(m.total_monthly_cost)) * m.tco_months;

  const upfront =
    ft === 'cash' ? price
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

export function calcMoneyBreakdown(finance: FinanceOption, annualRunning: number): BreakdownItem[] {
  const termMonths = getTermMonths(finance);
  const termYears = termMonths / 12;
  const totalRunning = annualRunning * termYears;
  const price = finance.purchase_price ?? 0;
  const deposit = finance.deposit ?? 0;
  const running: BreakdownItem = { label: 'Running costs', amount: totalRunning, type: 'running' };

  function endValue(years: number): number {
    return price * Math.pow(1 - (finance.depreciation_rate ?? 15) / 100, years);
  }
  function depLoss(years: number): number {
    return price - endValue(years);
  }

  switch (finance.finance_type) {
    case 'cash': {
      const ev = endValue(termYears);
      return [
        { label: 'Depreciation loss', amount: depLoss(termYears), type: 'depreciation' },
        running,
        { label: 'Asset value at end', amount: ev, type: 'equity', note: 'Estimated sale value — yours to keep or reinvest' },
      ];
    }

    case 'bank_loan': {
      const monthly = calcLoanMonthlyPayment(price - deposit, finance.apr ?? 7, termMonths);
      const interest = Math.max(0, monthly * termMonths - (price - deposit));
      const ev = endValue(termYears);
      return [
        { label: 'Depreciation loss', amount: depLoss(termYears), type: 'depreciation' },
        { label: 'Interest paid', amount: interest, type: 'interest' },
        running,
        { label: 'Asset value at end', amount: ev, type: 'equity', note: 'Estimated sale value — yours to keep or reinvest' },
      ];
    }

    case 'hp': {
      const totalPaid = deposit + (finance.monthly_payment ?? 0) * termMonths;
      const charges = totalPaid - price;
      const ev = endValue(termYears);
      return [
        { label: 'Depreciation loss', amount: depLoss(termYears), type: 'depreciation' },
        ...(charges > 0 ? [{ label: 'Interest & HP charges', amount: charges, type: 'interest' as const }] : []),
        running,
        { label: 'Asset value at end', amount: ev, type: 'equity', note: 'Estimated sale value — yours to keep or reinvest' },
      ];
    }

    case 'pcp': {
      const monthly = finance.monthly_payment ?? 0;
      const totalPaid = deposit + monthly * termMonths;
      if (finance.pcp_end_action === 'buy') {
        const charges = Math.max(0, totalPaid + (finance.balloon_payment ?? 0) - price);
        const ev = endValue(termYears);
        return [
          { label: 'Depreciation loss', amount: depLoss(termYears), type: 'depreciation' },
          { label: 'Interest & PCP charges', amount: charges, type: 'interest', note: 'Total paid minus car purchase price' },
          running,
          { label: 'Asset value at end', amount: ev, type: 'equity', note: 'Estimated sale value — yours to keep or reinvest' },
        ];
      }
      return [
        { label: 'PCP payments (no equity)', amount: totalPaid, type: 'lost_payments', note: 'Car returned — nothing to show for payments' },
        running,
      ];
    }

    case 'lease': {
      const monthly = finance.monthly_payment ?? 0;
      const totalLease = ((finance.initial_rental_months ?? 3) + termMonths) * monthly;
      return [
        { label: 'Lease payments (no equity)', amount: totalLease, type: 'lost_payments', note: 'Car returned — nothing to show for payments' },
        running,
      ];
    }

    default:
      return [running];
  }
}
