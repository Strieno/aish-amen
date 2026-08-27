import chat from '../serverless/routes/chat';
import chatStream from '../serverless/routes/chat-stream';
import aiAction from '../serverless/routes/ai-action';
import aiAssistStream from '../serverless/routes/ai-assist-stream';
import aiBreakdown from '../serverless/routes/ai-breakdown';
import aiPropose from '../serverless/routes/ai-propose';
import aiStatus from '../serverless/routes/ai-status';
import aiSuggest from '../serverless/routes/ai-suggest';
import aiTts from '../serverless/routes/ai-tts';
import aiRealtimeCall from '../serverless/routes/ai-realtime-call';
import conversationCategorize from '../serverless/routes/conversation-categorize';
import linksDiscover from '../serverless/routes/links-discover';
import providerTest from '../serverless/routes/provider-test';

export const config = { maxDuration: 60 };

type Handler = (req: any, res: any) => any;

const handlers: Record<string, Handler> = {
  chat,
  'chat-stream': chatStream,
  'ai-action': aiAction,
  'ai-assist-stream': aiAssistStream,
  'ai-breakdown': aiBreakdown,
  'ai-propose': aiPropose,
  'ai-status': aiStatus,
  'ai-suggest': aiSuggest,
  'ai-tts': aiTts,
  'ai-realtime-call': aiRealtimeCall,
  'conversation-categorize': conversationCategorize,
  'links-discover': linksDiscover,
  'provider-test': providerTest,
};

export default async function handler(req: any, res: any) {
  const routeValue = Array.isArray(req.query?.route) ? req.query.route[0] : req.query?.route;
  const route = String(routeValue || '').trim();
  const target = handlers[route];
  if (!target) return res.status(404).json({ error: 'Unknown cloud AI route', route });
  return target(req, res);
}
