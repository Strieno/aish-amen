# Audio System

## File storage

Imported audio is copied into `server/data/audio/<id>-<safe-name>` (managed copies, never
relying on fragile external paths). Files are referenced by internal IDs; the server streams
them at `GET /api/audio/files/:id/file`.

## Playback

Playback is **client-side** with the Web Audio / HTML5 `Audio` elements — a
zustand store (`frontend/src/lib/audio-player.ts`) manages concurrent sounds:

- `play(id, url, volume, loop)` — stops an existing sound with the same id first,
  so the same file can't double-play.
- `stopAll()` — stops everything (used when a Sound Scene starts or focus ends).
- `setVolume` / `setLoop` / `setMaster` — per-track and master volume with smooth,
  per-element updates.

This gives simultaneous layers (rain + brown noise + fireplace), per-track volume, loop,
and a master level — the ambient mixer core.

## Sound Scenes

A scene is a named list of `{ fileId, url, title, volume, loop }` tracks persisted in
`sound_scenes`. Playing a scene stops all active sounds and starts its tracks.
Scenes can also be triggered from a focus session's "ambient sound" picker.

## Focus integration

`POST /api/focus/start` logs a session; the frontend optionally starts the chosen ambient
track and stops it when the session ends or is cancelled. Sessions are aggregated by the
Insights module.

## Speech and read-aloud

- Assistant replies and smart suggestions expose a read-aloud button.
- The default server voice is OpenAI `tts-1` with the `alloy` voice. The API key stays on
  the Express server or Vercel function; it is never sent to the browser.
- Local mode can use an OpenAI-compatible provider that implements `/audio/speech`.
- Cloud mode uses the authenticated `/api/ai/tts` route and respects maximum-privacy mode.
- Browser speech remains an explicit fallback when the user selects the automatic engine.
- Speech requests and active audio can be stopped without a delayed response starting later.

Ambient ducking (lowering sound-scene volume during speech) remains a future enhancement.
# وضع التكلم المباشر

من صفحة المحادثة يمكن تشغيل **التكلم المباشر**. يطلب المتصفح إذن الميكروفون مرة واحدة، ثم يستخدم WebRTC مع OpenAI Realtime ليستمع تلقائيًا، يكتشف نهاية الكلام، ويرد بصوت Alloy. يمكن للمستخدم مقاطعة الرد بمجرد أن يبدأ الكلام، كما تُحفظ النصوص المستخرجة من الطرفين داخل نفس المحادثة.

يبقى `OPENAI_API_KEY` في الخادم ولا يُرسل إلى المتصفح. الإعدادات الاختيارية:

```env
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
OPENAI_REALTIME_VOICE=alloy
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

يتطلب الوضع اتصالًا بالإنترنت وHTTPS (أو localhost أثناء التطوير) وإذن الميكروفون. إعداد الخصوصية القصوى يمنع إنشاء جلسة Realtime السحابية.
