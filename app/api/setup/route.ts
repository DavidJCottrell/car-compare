import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cars (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nickname TEXT NOT NULL,
        year INTEGER NOT NULL,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        colour TEXT,
        fuel_type TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS running_costs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        insurance NUMERIC(10,2) DEFAULT 0,
        ved NUMERIC(10,2) DEFAULT 0,
        annual_mileage INTEGER DEFAULT 10000,
        fuel_method TEXT DEFAULT 'calculated',
        fuel_annual NUMERIC(10,2),
        mpg NUMERIC(7,2),
        fuel_price_ppl NUMERIC(7,2),
        miles_per_kwh NUMERIC(7,2),
        electricity_price_pkwh NUMERIC(7,3),
        mot NUMERIC(10,2) DEFAULT 0,
        servicing NUMERIC(10,2) DEFAULT 0,
        tyres NUMERIC(10,2) DEFAULT 0,
        breakdown_cover NUMERIC(10,2) DEFAULT 0,
        parking NUMERIC(10,2) DEFAULT 0,
        other NUMERIC(10,2) DEFAULT 0
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS finance_options (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        finance_type TEXT NOT NULL,
        purchase_price NUMERIC(12,2),
        deposit NUMERIC(12,2),
        term_months INTEGER,
        monthly_payment NUMERIC(10,2),
        apr NUMERIC(6,3),
        balloon_payment NUMERIC(12,2),
        pcp_end_action TEXT,
        initial_rental_months INTEGER,
        lease_annual_mileage INTEGER,
        ownership_years INTEGER,
        depreciation_rate NUMERIC(5,2)
      )
    `;

    return NextResponse.json({ success: true, message: 'Database tables created successfully.' });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
