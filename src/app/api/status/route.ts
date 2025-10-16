import { NextRequest } from 'next/server';
import { DEFAULT_CHAT_MODEL_NAME, AVAILABLE_CHAT_MODELS } from '@/Oracle_Config';
import { ensureRagWarmup, isRagActive } from '@/utils/rag';
import { getCurrentModel } from '@/utils/modelRegistry';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  // Best-effort warmup (non-blocking for status return)
  ensureRagWarmup().catch(() => {});

  const model = getCurrentModel();
  const rag = isRagActive() ? 'active' : 'loading';

  return new Response(
    JSON.stringify({ model, rag, availableModels: AVAILABLE_CHAT_MODELS }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}


