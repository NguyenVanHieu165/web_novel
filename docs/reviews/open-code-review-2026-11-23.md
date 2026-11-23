# Open Code Review Report — 2026-11-23

## Summary

- Review mode: Open Code Review delegation mode.
- OCR CLI: `@alibaba-group/open-code-review` 1.14.2.
- Phase 5 target: commit `8a8eed7`.
- Phase 5 coverage: 12/12 files reviewed, 0 skipped, 100% coverage.
- Targeted critical-path scan: 10/10 files reviewed, 0 skipped.
- Findings: 0 critical, 1 high, 5 medium, 2 low.
- Fixes: not applied; this run was review-only.

## Scope

### Phase 5 commit

1. `app/(reader)/truyen/[slug]/[chapterSlug]/error.tsx`
2. `components/chapter/ChapterDrawer.tsx`
3. `components/chapter/ChapterNavigation.tsx`
4. `components/chapter/ChapterUnlockCard.tsx`
5. `components/chapter/ReaderNavigationProvider.tsx`
6. `components/chapter/ReaderSettingsPanel.tsx`
7. `components/chapter/ReaderSpeech.tsx`
8. `components/chapter/ReaderView.tsx`
9. `components/chapter/ReadingDock.tsx`
10. `components/chapter/ReadingProgress.tsx`
11. `components/comments/CommentSection.tsx`
12. `components/reading/ChapterAudioPlayer.tsx`

### Critical-path scan

1. `app/api/auth/login/route.ts`
2. `app/api/auth/register/route.ts`
3. `lib/server/auth-session.ts`
4. `app/api/chapters/[id]/purchase/route.ts`
5. `app/api/chapters/[id]/progress/route.ts`
6. `app/api/chapters/[id]/audio/route.ts`
7. `app/api/truyen/[slug]/comments/route.ts`
8. `app/api/comments/[id]/route.ts`
9. `app/api/comments/[id]/like/route.ts`
10. `lib/prisma.ts`

## High

### 1. Audio streaming bypasses generation rate limiting

- Category: security / performance
- Location: `app/api/chapters/[id]/audio/route.ts:60-73`
- Evidence: rate limiting runs only when `stream` is absent, but the `stream=1` path still calls `getChapterAudio()` before serving the bytes. The `v` fingerprint is optional.
- Impact: an unauthenticated caller can request `?stream=1` for free chapters and trigger or join expensive TTS generation without the 15 requests/minute gate. Repeating requests across chapter/voice combinations can consume CPU, external TTS quota, storage and function duration.
- Recommendation: rate-limit every path that can reach `getChapterAudio()`. Prefer separating “generate/resolve metadata” from “serve an already generated fingerprint”, and require a valid fingerprint or signed short-lived token for the streaming path.

## Medium

### 2. Comment mutations do not enforce same-origin checks in production code

- Category: security
- Locations:
  - `app/api/truyen/[slug]/comments/route.ts:40-53`
  - `app/api/comments/[id]/route.ts:8-17`
  - `app/api/comments/[id]/like/route.ts:8-22`
  - `lib/server/auth-session.ts:30-42`
- Evidence: the routes call `requireUser()`, but `requireUser()` only validates the session cookie and does not validate `Origin` or `Sec-Fetch-Site`. Purchase, progress, follow and rating mutations already perform explicit origin checks.
- Test gap: `tests/story-comments.test.mjs:82-96` injects origin rejection into the mocked `requireUser()`, so the “cross-origin posting” test can pass even though the real helper does not implement that behavior.
- Impact: mutation protection depends solely on cookie SameSite behavior. A compromised same-site sibling origin or future cookie policy change could submit likes or other mutations with the user session.
- Recommendation: use one shared same-origin guard before authentication for all comment POST/DELETE/like routes, and make tests exercise that real guard instead of adding behavior to the mock.

### 3. Locked and banned account names can be enumerated before password verification

- Category: security
- Location: `app/api/auth/login/route.ts:41-63`
- Evidence: an existing locked/banned account returns HTTP 403 and “Tài khoản của bạn đã bị khóa” before `verifyPassword()` runs, while unknown or active accounts with a wrong password return HTTP 401 and a generic message.
- Impact: attackers can distinguish locked/banned usernames from unknown or active accounts without knowing the password.
- Recommendation: verify credentials before exposing account status, or return the same status/message for every failed login and show the lock reason only after a valid password has been established.

### 4. Concurrent registrations can return an incorrect 500 response

- Category: bug / reliability
- Location: `app/api/auth/register/route.ts:25-50` and `83-87`
- Evidence: duplicate username/email is checked before the transaction. Two concurrent requests can both pass the check; the database unique constraint rejects one create with `P2002`, which falls into the generic 500 handler.
- Impact: a normal duplicate-registration race appears as a server failure instead of a deterministic 409 conflict.
- Recommendation: keep the pre-check for user feedback, but also translate Prisma `P2002` from the transactional create into the same 409 response.

### 5. Chapter comment login redirects users away from the chapter

- Category: bug / user workflow
- Location: `components/comments/CommentSection.tsx:25-26`
- Evidence: both branches of `const redirect = chapterId ? ... : ...` resolve to `/truyen/${storySlug}`.
- Impact: a guest who chooses “Đăng nhập” below a chapter returns to the story detail page instead of the chapter and loses reading position/context.
- Recommendation: pass the current reader path or `chapterSlug` into `CommentSection` and use it as the authenticated return destination.

### 6. Comment submission allows duplicate in-flight requests

- Category: bug
- Location: `components/comments/CommentSection.tsx:41-45` and `67-73`
- Evidence: there is no submitting state or in-flight guard; the submit button remains enabled until the request finishes.
- Impact: double-clicking or pressing Enter repeatedly can create duplicate comments. The server rate limit permits several requests and there is no idempotency key.
- Recommendation: track submission state, disable the form while pending, and ignore subsequent submits until the first request settles.

## Low

### 7. Some Reader controls still bypass semantic reader colors

- Category: style / maintainability
- Locations:
  - `components/chapter/ChapterDrawer.tsx:146`
  - `components/chapter/ReadingProgress.tsx:258-259`
  - `app/(reader)/truyen/[slug]/[chapterSlug]/error.tsx:22`
- Evidence: selected chapter, progress bar and error icon still use hard-coded blue utilities instead of `--reader-accent` and related reader variables.
- Impact: these elements can look inconsistent in sepia, mint and dark reader themes.
- Recommendation: replace the remaining blue utilities with the existing semantic Reader variables.

### 8. Like-button accessible name hides the current like count

- Category: accessibility
- Location: `components/comments/CommentSection.tsx:85`
- Evidence: `aria-label` replaces the button’s visible accessible content but omits `comment.likeCount`.
- Impact: screen-reader users hear the action and author but not the current count shown visually.
- Recommendation: include the count in the accessible name or move the author context to visually hidden text without overriding the visible count.

## Positive observations

- Phase 5 preserved `--reader-*` declarations and uses CSS-variable inheritance for reader appearance.
- `ReaderChapterContent` is memoized, so changing appearance settings does not rebuild the chapter paragraph tree.
- Reader navigation keeps keyboard guards for dialogs, form controls and editable content.
- Purchase flow derives the charged price from the database, locks wallets and performs debit, entitlement and ledger writes in one transaction.
- Reading progress enforces server identity, access checks and bounded validated inputs.
- `lib/prisma.ts` reuses a single client and keeps production logging restricted to errors.

## Installation files

- `.agents/skills/open-code-review-delegate/SKILL.md`
- `skills-lock.json`
- `.opencodereview/rule.json`

The OCR CLI is installed globally, so no runtime dependency was added to `package.json`.
