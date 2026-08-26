import { DEEPSEEK_PROVIDER_ID, assertCloudAiAllowed, authContext, deepSeekConfigured } from '../../serverless/cloud-ai';
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await authContext(req);
  if (!ctx) return res.status(401).json({ error: 'Authentication required' });
  try { await assertCloudAiAllowed(ctx); } catch { return res.json({ providers: [{ id: DEEPSEEK_PROVIDER_ID, status: 'blocked', modelCount: 0 }], cloud: true, privacyBlocked: true }); }
  const connected = deepSeekConfigured();
  return res.json({ providers: [{ id: DEEPSEEK_PROVIDER_ID, status: connected ? 'connected' : 'error', modelCount: 2 }], cloud: true });
}
