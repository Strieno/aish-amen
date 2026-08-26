Aish Amen - HTTP 404 Cloud AI fix

انسخ محتويات هذا المجلد إلى جذر مشروع aish-amen المحلي واختر Replace عند الطلب.

بعد النسخ يجب أن ترى في GitHub Desktop ملفات جديدة/معدلة منها:
- serverless/cloud-ai.ts
- api/ai/action.ts
- api/chat/stream.ts
- api/ai/status.ts
- api/ai/breakdown.ts
- api/ai/suggest.ts
- api/ai/propose.ts
- api/ai/assist/stream.ts

ثم Commit -> Pull origin (إن ظهر) -> Push origin -> انتظر Vercel Ready.

تأكد في Vercel Environment Variables من:
DEEPSEEK_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
