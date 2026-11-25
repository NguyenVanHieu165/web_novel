# TTS Worker + R2

1. In this directory run `npx wrangler r2 bucket create lacatruyen-tts` (once).
2. Run `npx wrangler secret put TTS_WORKER_SECRET` and enter a strong random secret.
3. Run `npm run deploy` after authenticating Wrangler.
4. Set server-only Next.js TTS_WORKER_URL to the deployed HTTPS Worker URL and TTS_WORKER_SECRET to the same secret, then redeploy Next.js.
5. Check GET /health; check a free chapter and purchased/unpurchased VIP chapter through /api/tts/chapters/:id/meta and /chunk/0. A repeated authorized request should return X-TTS-Cache: HIT-R2.

No Prisma migration is required. R2 must remain private. Cache keys include the normalized chapter fingerprint, voice and chunk index. Access checks run before every cache lookup. R2 write errors are logged and never prevent audio playback. Edge is an external unofficial service; its protocol can change. Audio frames stream immediately; only a successful turn.end permits writing the complete chunk to R2. Configure an R2 lifecycle policy to expire stale chunks according to storage requirements.
