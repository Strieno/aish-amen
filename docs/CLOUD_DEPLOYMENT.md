# AishAman Cloud — Supabase, Vercel, and PWA

The cloud layer is optional. Without cloud environment variables the existing Express + SQLite app behaves exactly as before. With both Supabase variables present, authentication is required and supported CRUD routes use the signed-in user's Supabase data directly.

## 1. Create and prepare Supabase

1. Create a Supabase project and keep its region close to the intended users.
2. Open **SQL Editor**, paste the complete contents of `supabase/migrations/202608260001_aishaman_cloud.sql`, and run it once.
3. In **Authentication → Providers → Email**, enable email/password. Decide whether email confirmation is required.
4. In **Authentication → URL Configuration**, set the production Site URL and add these redirect URLs:
   - `http://localhost:5173`
   - the production Vercel URL
5. From **Project Settings → API**, copy the project URL and the publishable key. Do not use the service-role key in the frontend.

The migration creates normalized user-owned tables, update triggers, indexes, a private Storage bucket, explicit SELECT/INSERT/UPDATE/DELETE RLS policies, and Realtime publication entries for tasks, memories, goals, journal entries, and check-ins.

## 2. Local cloud-mode setup

Copy `frontend/.env.example` to `frontend/.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_API_BASE_URL=http://localhost:4321/api
```

Run the existing launcher or development commands. The app will show login, signup, password reset, session restoration, sync state, and logout.

## 3. Move existing SQLite data

Migration is intentionally not automatic because SQLite may contain private journal, memory, chat, and document data.

1. Keep the local Express app running so `/api/export` is reachable.
2. Sign in to the intended cloud account.
3. Open **Settings → Data → نقل بيانات SQLite المحلية**.
4. Review the record count and sensitive-data notice, then confirm.

Before upload, the untouched JSON export is saved in the browser's IndexedDB. Rows retain their original IDs, timestamps, memory source metadata, and relationships. A content fingerprint in `migration_runs` makes repeat runs idempotent. Newer cloud rows are not overwritten by an older local copy. SQLite is never deleted or cleared.

## 4. Deploy the frontend to Vercel

1. Import the repository into Vercel with the repository root as the project root.
2. `vercel.json` supplies the install command, build command, output folder, and baseline security headers. The app uses hash routing, so direct route refreshes do not need a server rewrite.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to Production, Preview, and Development as appropriate.
4. Deploy, then add the final Vercel URL to Supabase Authentication redirect URLs.
5. Open the deployed app on a phone and choose **Add to Home Screen**. The generated service worker caches the app shell; user records are cached separately in IndexedDB.

## 5. Offline and conflict behavior

- Reads use Supabase and refresh the IndexedDB cache.
- When the network is unavailable, cached records are shown.
- Creates, edits, and deletes are applied optimistically and queued in IndexedDB.
- The queue flushes after the `online` event or the next authenticated startup.
- Current conflict policy is last write received by PostgreSQL; every syncable table has `updated_at` maintained by the database.
- Realtime changes refresh the same UI event bus used by the local SSE implementation.

## 6. AI backend boundary

OpenAI/Ollama keys are intentionally not written to Supabase from browser code. The existing Express backend remains the trusted place for provider secrets and local knowledge/audio processing. `VITE_API_BASE_URL` can point to that backend while developing locally.

Do not publish the current SQLite backend as a shared public service: its local database is single-owner and its existing routes are not multi-tenant. A future hosted AI backend must validate the Supabase JWT on every request and use the user's token/RLS context (or an isolated per-user store) before it can safely be exposed. Until then, cloud CRUD/PWA works on every device; advanced AI and local-file processing require the trusted local backend.

## 7. Security checklist

- RLS remains enabled and forced on every private table.
- Test two separate accounts before production: each must see zero rows belonging to the other.
- Never add a service-role key or OpenAI key to `VITE_*` variables.
- Keep the Storage bucket private and use signed URLs.
- Use HTTPS in production (Vercel and Supabase provide it).
- Export user data from Settings before account/data deletion workflows.
