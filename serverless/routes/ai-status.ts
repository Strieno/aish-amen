import { assertCloudAiAllowed, authContext, cloudProviderCatalog, resolveCloudSelection } from '../cloud-ai';
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  let ctx;
  try { ctx = await authContext(req); }
  catch { return res.status(503).json({ error: 'تعذر التحقق من جلسة Supabase. حاول مرة أخرى.' }); }
  if (!ctx) return res.status(401).json({ error: 'Authentication required' });
  const catalog = cloudProviderCatalog();
  try {
    await assertCloudAiAllowed(ctx);
  } catch {
    return res.json({
      providers: catalog.map((provider) => ({ id: provider.id, name: provider.name, status: 'blocked', modelCount: 0, model: provider.defaultModel })),
      cloud: true,
      configured: catalog.some((provider) => provider.configured),
      privacyBlocked: true,
    });
  }
  const active = resolveCloudSelection();
  return res.json({
    providers: catalog.map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.configured ? 'configured' : 'error',
      modelCount: provider.configured ? provider.models.length : 0,
      model: provider.defaultModel,
      isPrimary: provider.id === active.providerId,
    })),
    cloud: true,
    configured: catalog.some((provider) => provider.configured),
    defaultProvider: active.providerId,
    defaultModel: active.model,
    privacyBlocked: false,
  });
}
