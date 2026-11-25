# R2 cache + Vercel TTS relay

Next.js checks chapter/story visibility and VIP access before calling this Worker. Worker authenticates TTS_WORKER_SECRET, checks private R2 chunks/<cacheKey>.mp3, then on MISS POSTs { text, voice } to VERCEL_TTS_RELAY_URL with the same Bearer secret. The Node.js relay uses the existing msedge-tts dependency; it does not call this Worker. Successful, nonempty MP3 buffers alone are cached asynchronously. Responses retain audio/mpeg and X-TTS-Cache: HIT-R2 or MISS.

1. Configure TTS_WORKER_SECRET in Next.js and with `npx wrangler secret put TTS_WORKER_SECRET` in this directory (same value).
2. Deploy Next.js first so POST /api/internal/tts-relay exists.
3. Set vars.VERCEL_TTS_RELAY_URL in wrangler.jsonc to that deployment's relay endpoint, then `npm run deploy`.
4. Keep TTS_WORKER_URL pointing to the Worker on Next.js. Never point VERCEL_TTS_RELAY_URL at the public /api/tts route (that would recurse).
5. Verify a free and purchased/unpurchased VIP chapter, then repeat an authorized chunk request to confirm HIT-R2.

No Google API key is used. No local/public files or Prisma migrations are needed. This implementation requires no new dependencies or third-party API key. Hosting/storage usage remains subject to provider quotas; Edge is an unofficial external service and availability from Vercel must be verified after deployment. Remove the obsolete GOOGLE_TTS_API_KEY secret separately if it was previously configured.
