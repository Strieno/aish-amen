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

## Future / not-yet-implemented

- **STT/TTS**: no local speech models are bundled. The chat mic button is present but shows
  a clear "speech recognition not configured" message rather than a fake action. The provider
  interfaces (`STTProvider` / `TTSProvider` with per-assistant voices, TTS cache, ducking)
  are designed for a later phase but not implemented.
- **Ducking**: the ambient ducking rule (TTS playback lowers ambient volume) is deferred
  until a TTS provider exists.
