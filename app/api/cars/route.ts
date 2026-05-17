import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { mapCar, mapRunningCosts, mapFinanceOption } from '@/lib/mappers';

export async function GET() {
  try {
    const { rows: carRows } = await sql`SELECT * FROM cars ORDER BY created_at DESC`;

    const results = await Promise.all(
      carRows.map(async (carRow) => {
        const { rows: rcRows } = await sql`SELECT * FROM running_costs WHERE car_id = ${carRow.id as string}`;
        const { rows: fRows } = await sql`SELECT * FROM finance_options WHERE car_id = ${carRow.id as string}`;
        if (!rcRows[0] || !fRows[0]) return null;
        return {
          car: mapCar(carRow as Record<string, unknown>),
          running_costs: mapRunningCosts(rcRows[0] as Record<string, unknown>),
          finance: mapFinanceOption(fRows[0] as Record<string, unknown>),
        };
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch (error) {
    console.error('GET /api/cars error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nickname, year, make, model, colour, fuel_type, running_costs: rc, finance: f } = body;

    const { rows: [carRow] } = await sql`
      INSERT INTO cars (nickname, year, make, model, colour, fuel_type)
      VALUES (${nickname}, ${year}, ${make}, ${model}, ${colour || null}, ${fuel_type})
      RETURNING *
    `;

    const carId = (carRow as Record<string, unknown>).id as string;

    await sql`
      INSERT INTO running_costs
        (car_id, insurance, ved, annual_mileage, fuel_method, fuel_annual,
         mpg, fuel_price_ppl, miles_per_kwh, electricity_price_pkwh,
         mot, servicing, tyres, breakdown_cover, parking, other)
      VALUES
        (${carId}, ${rc.insurance}, ${rc.ved}, ${rc.annual_mileage}, ${rc.fuel_method},
         ${rc.fuel_annual ?? null}, ${rc.mpg ?? null}, ${rc.fuel_price_ppl ?? null},
         ${rc.miles_per_kwh ?? null}, ${rc.electricity_price_pkwh ?? null},
         ${rc.mot}, ${rc.servicing}, ${rc.tyres}, ${rc.breakdown_cover}, ${rc.parking}, ${rc.other})
    `;

    await sql`
      INSERT INTO finance_options
        (car_id, finance_type, purchase_price, deposit, term_months, monthly_payment,
         apr, balloon_payment, pcp_end_action, initial_rental_months,
         lease_annual_mileage, ownership_years, depreciation_rate)
      VALUES
        (${carId}, ${f.finance_type}, ${f.purchase_price ?? null}, ${f.deposit ?? null},
         ${f.term_months ?? null}, ${f.monthly_payment ?? null}, ${f.apr ?? null},
         ${f.balloon_payment ?? null}, ${f.pcp_end_action ?? null}, ${f.initial_rental_months ?? null},
         ${f.lease_annual_mileage ?? null}, ${f.ownership_years ?? null}, ${f.depreciation_rate ?? null})
    `;

    return NextResponse.json({ success: true, id: carId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/cars error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
