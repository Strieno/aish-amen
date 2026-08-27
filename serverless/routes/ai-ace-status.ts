import { authContext, cloudAceStatus } from '../cloud-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  let ctx;
  try { ctx = await authContext(req); }
  catch { return res.status(503).json({ error: 'تعذر التحقق من جلسة Supabase.' }); }
  if (!ctx) return res.status(401).json({ error: 'Authentication required' });
  return res.json(cloudAceStatus());
}
