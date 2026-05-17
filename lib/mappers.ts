import { Car, RunningCosts, FinanceOption, CarWithDetails, FuelType, FinanceType, PCPEndAction, FuelMethod } from './types';

// @vercel/postgres returns NUMERIC columns as strings — coerce here
function n(v: unknown): number { return v == null ? 0 : Number(v); }
function nn(v: unknown): number | null { return v == null ? null : Number(v); }
function ns(v: unknown): string | null { return v == null ? null : String(v); }

export function mapCar(row: Record<string, unknown>): Car {
  return {
    id: row.id as string,
    nickname: row.nickname as string,
    year: n(row.year),
    make: row.make as string,
    model: row.model as string,
    colour: ns(row.colour) ?? undefined,
    fuel_type: row.fuel_type as FuelType,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function mapRunningCosts(row: Record<string, unknown>): RunningCosts {
  return {
    id: row.id as string,
    car_id: row.car_id as string,
    insurance: n(row.insurance),
    ved: n(row.ved),
    annual_mileage: n(row.annual_mileage),
    fuel_method: (row.fuel_method as FuelMethod) ?? 'calculated',
    fuel_annual: nn(row.fuel_annual),
    mpg: nn(row.mpg),
    fuel_price_ppl: nn(row.fuel_price_ppl),
    miles_per_kwh: nn(row.miles_per_kwh),
    electricity_price_pkwh: nn(row.electricity_price_pkwh),
    mot: n(row.mot),
    servicing: n(row.servicing),
    tyres: n(row.tyres),
    breakdown_cover: n(row.breakdown_cover),
    parking: n(row.parking),
    other: n(row.other),
  };
}

export function mapFinanceOption(row: Record<string, unknown>): FinanceOption {
  return {
    id: row.id as string,
    car_id: row.car_id as string,
    finance_type: row.finance_type as FinanceType,
    purchase_price: nn(row.purchase_price),
    deposit: nn(row.deposit),
    term_months: nn(row.term_months),
    monthly_payment: nn(row.monthly_payment),
    apr: nn(row.apr),
    balloon_payment: nn(row.balloon_payment),
    pcp_end_action: (row.pcp_end_action as PCPEndAction) ?? null,
    initial_rental_months: nn(row.initial_rental_months),
    lease_annual_mileage: nn(row.lease_annual_mileage),
    ownership_years: nn(row.ownership_years),
    depreciation_rate: nn(row.depreciation_rate),
  };
}

export function mapCarWithDetails(
  carRow: Record<string, unknown>,
  rcRow: Record<string, unknown>,
  fRow: Record<string, unknown>
): CarWithDetails {
  return {
    car: mapCar(carRow),
    running_costs: mapRunningCosts(rcRow),
    finance: mapFinanceOption(fRow),
  };
}
