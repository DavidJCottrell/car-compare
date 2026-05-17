export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric';
export type FinanceType = 'cash' | 'bank_loan' | 'hp' | 'pcp' | 'lease';
export type PCPEndAction = 'hand_back' | 'buy';
export type FuelMethod = 'manual' | 'calculated';

export interface Car {
  id: string;
  nickname: string;
  year: number;
  make: string;
  model: string;
  colour?: string;
  fuel_type: FuelType;
  created_at: string;
  updated_at: string;
}

export interface RunningCosts {
  id: string;
  car_id: string;
  insurance: number;
  ved: number;
  annual_mileage: number;
  fuel_method: FuelMethod;
  fuel_annual: number | null;
  mpg: number | null;
  fuel_price_ppl: number | null;
  miles_per_kwh: number | null;
  electricity_price_pkwh: number | null;
  mot: number;
  servicing: number;
  tyres: number;
  breakdown_cover: number;
  parking: number;
  other: number;
}

export interface FinanceOption {
  id: string;
  car_id: string;
  finance_type: FinanceType;
  purchase_price: number | null;
  deposit: number | null;
  term_months: number | null;
  monthly_payment: number | null;
  apr: number | null;
  balloon_payment: number | null;
  pcp_end_action: PCPEndAction | null;
  initial_rental_months: number | null;
  lease_annual_mileage: number | null;
  ownership_years: number | null;
  depreciation_rate: number | null;
}

export interface CarWithDetails {
  car: Car;
  running_costs: RunningCosts;
  finance: FinanceOption;
}

export interface CarMetrics extends CarWithDetails {
  annual_fuel_cost: number;
  annual_running_cost: number;
  monthly_running_cost: number;
  monthly_finance_cost: number;
  total_monthly_cost: number;
  tco: number;
  tco_months: number;
  cost_per_mile: number;
}

// Flat form types (all numbers, no nulls, for the form state)
export interface FormRunningCosts {
  insurance: number;
  ved: number;
  annual_mileage: number;
  fuel_method: FuelMethod;
  fuel_annual: number;
  mpg: number;
  miles_per_kwh: number;
  mot: number;
  servicing: number;
  tyres: number;
}

export interface FormFinance {
  finance_type: FinanceType;
  purchase_price: number;
  deposit: number;
  term_months: number;
  monthly_payment: number;
  apr: number;
  balloon_payment: number;
  pcp_end_action: PCPEndAction;
  initial_rental_months: number;
  lease_annual_mileage: number;
  ownership_years: number;
  depreciation_rate: number;
}

export interface CarFormData {
  nickname: string;
  year: number;
  make: string;
  model: string;
  colour: string;
  fuel_type: FuelType;
  running_costs: FormRunningCosts;
  finance: FormFinance;
}

export const defaultFormData: CarFormData = {
  nickname: '',
  year: new Date().getFullYear(),
  make: '',
  model: '',
  colour: '',
  fuel_type: 'petrol',
  running_costs: {
    insurance: 0,
    ved: 0,
    annual_mileage: 10000,
    fuel_method: 'calculated',
    fuel_annual: 0,
    mpg: 35,
    miles_per_kwh: 3.5,
    mot: 55,
    servicing: 350,
    tyres: 150,
  },
  finance: {
    finance_type: 'bank_loan',
    purchase_price: 0,
    deposit: 0,
    term_months: 48,
    monthly_payment: 0,
    apr: 7.0,
    balloon_payment: 0,
    pcp_end_action: 'hand_back',
    initial_rental_months: 3,
    lease_annual_mileage: 10000,
    ownership_years: 3,
    depreciation_rate: 15,
  },
};
