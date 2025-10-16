import { NextRequest } from 'next/server';
import { listModels, getCurrentModel, setCurrentModel } from '@/utils/modelRegistry';

export const runtime = 'nodejs';

export async function GET() {
  return new Response(
    JSON.stringify({ current: getCurrentModel(), available: listModels() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { model } = await req.json();
    if (typeof model !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid model' }), { status: 400 });
    }
    setCurrentModel(model);
    return new Response(JSON.stringify({ current: getCurrentModel() }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Unknown error' }), { status: 400 });
  }
}


