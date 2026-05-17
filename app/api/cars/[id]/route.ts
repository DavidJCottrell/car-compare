import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { mapCar, mapRunningCosts, mapFinanceOption } from '@/lib/mappers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { rows: carRows } = await sql`SELECT * FROM cars WHERE id = ${params.id}`;
    if (!carRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { rows: rcRows } = await sql`SELECT * FROM running_costs WHERE car_id = ${params.id}`;
    const { rows: fRows } = await sql`SELECT * FROM finance_options WHERE car_id = ${params.id}`;

    return NextResponse.json({
      car: mapCar(carRows[0] as Record<string, unknown>),
      running_costs: rcRows[0] ? mapRunningCosts(rcRows[0] as Record<string, unknown>) : null,
      finance: fRows[0] ? mapFinanceOption(fRows[0] as Record<string, unknown>) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    const { nickname, year, make, model, colour, fuel_type, running_costs: rc, finance: f } = body;

    await sql`
      UPDATE cars
      SET nickname = ${nickname}, year = ${year}, make = ${make}, model = ${model},
          colour = ${colour || null}, fuel_type = ${fuel_type}, updated_at = NOW()
      WHERE id = ${params.id}
    `;

    await sql`
      UPDATE running_costs
      SET insurance = ${rc.insurance}, ved = ${rc.ved}, annual_mileage = ${rc.annual_mileage},
          fuel_method = ${rc.fuel_method}, fuel_annual = ${rc.fuel_annual ?? null},
          mpg = ${rc.mpg ?? null}, fuel_price_ppl = ${rc.fuel_price_ppl ?? null},
          miles_per_kwh = ${rc.miles_per_kwh ?? null}, electricity_price_pkwh = ${rc.electricity_price_pkwh ?? null},
          mot = ${rc.mot}, servicing = ${rc.servicing}, tyres = ${rc.tyres},
          breakdown_cover = ${rc.breakdown_cover}, parking = ${rc.parking}, other = ${rc.other}
      WHERE car_id = ${params.id}
    `;

    await sql`
      UPDATE finance_options
      SET finance_type = ${f.finance_type}, purchase_price = ${f.purchase_price ?? null},
          deposit = ${f.deposit ?? null}, term_months = ${f.term_months ?? null},
          monthly_payment = ${f.monthly_payment ?? null}, apr = ${f.apr ?? null},
          balloon_payment = ${f.balloon_payment ?? null}, pcp_end_action = ${f.pcp_end_action ?? null},
          initial_rental_months = ${f.initial_rental_months ?? null},
          lease_annual_mileage = ${f.lease_annual_mileage ?? null},
          ownership_years = ${f.ownership_years ?? null}, depreciation_rate = ${f.depreciation_rate ?? null}
      WHERE car_id = ${params.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/cars/[id] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await sql`DELETE FROM cars WHERE id = ${params.id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
