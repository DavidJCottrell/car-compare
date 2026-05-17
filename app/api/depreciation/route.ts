import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set. Add it to your Vercel environment variables.' },
      { status: 503 }
    );
  }

  const { make, model, year, fuel_type, annual_mileage } = await request.json();

  if (!make || !model) {
    return NextResponse.json({ error: 'Make and model are required.' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'You are a UK automotive market expert. Respond only with valid JSON, no markdown, no backticks.',
        messages: [{
          role: 'user',
          content: `Estimate the compound annual depreciation rate for a ${year} ${make} ${model} (${fuel_type}) in the UK, driven approximately ${annual_mileage.toLocaleString()} miles per year.

Consider: model's historical residual value reputation, fuel type impact (EVs currently depreciate faster due to battery concerns and rapid tech change), desirability, reliability record, running costs, and how mileage affects this specific model.

Respond with ONLY a JSON object:
{
  "rate": <number: annual depreciation % to apply each year, e.g. 14>,
  "year1_rate": <number: first-year depreciation % — often higher, e.g. 20>,
  "explanation": "<2-3 sentences: why this model depreciates at this rate, key factors, how it compares to average>",
  "confidence": "<high|medium|low>"
}

Guidance: average UK car depreciates ~15-20%/yr compound. EVs often 20-30%/yr. Premium German brands 18-25%/yr. Japanese reliability brands (Toyota, Mazda) 10-15%/yr. Sports/performance cars vary widely. Use the compound annual rate (not year 1 only) as the primary "rate" field.`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return NextResponse.json({ error: 'AI service error.' }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json(parsed);
    } catch {
      // Try to extract JSON if there's any surrounding text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return NextResponse.json(JSON.parse(match[0]));
      return NextResponse.json({ error: 'Could not parse AI response.' }, { status: 500 });
    }
  } catch (error) {
    console.error('Depreciation API error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
