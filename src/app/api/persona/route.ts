import { NextRequest } from 'next/server';
import { getCurrentSystemPersona, setCurrentSystemPersona } from '@/Oracle_Config';

export const runtime = 'nodejs';

export async function GET() {
  return new Response(
    JSON.stringify({ persona: getCurrentSystemPersona() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { persona } = await req.json();
    if (typeof persona !== 'string' || persona.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'persona must be a non-empty string' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    setCurrentSystemPersona(persona);
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


