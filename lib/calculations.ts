import { FuelType, RunningCosts, FinanceOption, CarMetrics, CarWithDetails } from './types';

const LITRES_PER_GALLON = 4.54609;

export function calcAnnualFuelCost(rc: RunningCosts, fuelType: FuelType): number {
  if (rc.fuel_method === 'manual' && rc.fuel_annual !== null) {
    return rc.fuel_annual ?? 0;
  }
  if (fuelType === 'electric') {
    const mpkwh = rc.miles_per_kwh ?? 3.5;
    const pkwh = rc.electricity_price_pkwh ?? 28;
    return mpkwh > 0 ? (rc.annual_mileage / mpkwh * pkwh) / 100 : 0;
  }
  // petrol, diesel, hybrid, phev — use MPG
  const mpg = rc.mpg ?? 35;
  const ppl = rc.fuel_price_ppl ?? 148;
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
    (rc.tyres ?? 0) +
    (rc.breakdown_cover ?? 0) +
    (rc.parking ?? 0) +
    (rc.other ?? 0)
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
