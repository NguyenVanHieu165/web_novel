# Chapter audio

The headphones button in the reading dock opens the HTML5 chapter audio player.
msedge-tts runs on the Node server; clients never connect directly to Edge.
No paid TTS API key is used. Edge availability and hosting/storage costs are
outside this application's control.

## Playback

- Choose a narration profile, then press Play. Initial generation may take minutes.
- Playback rates: 0.85, 1, 1.15, 1.25, 1.5. Voice, rate and automatic next chapter
  are stored in versioned localStorage.
- MP3 seeking and Media Session controls use the same native audio element.
- iOS and other browsers may require another Play tap after asynchronous loading
  or chapter navigation. The player reports this instead of claiming playback.
- Network/server generation errors can use an installed Vietnamese browser voice.
  Permission errors never trigger this fallback. Browser narration has no MP3
  timeline and its next/previous controls still use chapter navigation.

## API and authorization

GET /api/chapters/[id]/audio?voice=female-warm returns { audioUrl, cached }.
The [id] name preserves the project's existing dynamic route segment.

audioUrl is another URL on this API with stream=1 and a content fingerprint.
Every metadata, streaming, HEAD and Range request checks the current chapter,
story and VIP access before reading content or cache. Chapters marked nonfree,
or carrying a positive coin price, require an active account with a purchase
or an administrator role. No schema or migration is needed.

Cache files live under
public/uploads/audio/[storySlug]/chuong-[number]-[voice].mp3.
Direct access to that entire directory is blocked by proxy.ts, including
metadata sidecars; do not expose it separately through a web server or CDN.

## Cache and service limits

- Same-process requests share an in-flight promise; at most two generation jobs
  run simultaneously. This is not a lock across server instances.
- Source text/profile fingerprints invalidate edited chapters. Files are written
  to unique temporary paths and renamed; failed generation publishes no audio.
- Chunks prefer paragraph/sentence boundaries and stay within 1,600 UTF-16 units.
- All output chunks use the same 24 kHz, 48 kbit/s mono CBR MP3 format.
- Limit: 200,000 source characters, 80 MiB output, 180 seconds per generation,
  one retry per failed chunk. Busy or unavailable synthesis returns 503.
- Edge Read Aloud accepts speak, voice and prosody, not arbitrary expressive SSML.
  Profiles use rate/pitch and punctuation pauses; they are not trained acting styles.
- Deploy on a Node host with a writable persistent disk. Read-only/ephemeral
  serverless filesystems require a private persistent storage implementation.
  Multiple instances need shared storage plus a distributed generation lock.

## Verification

Run node --test tests/chapter-audio.test.mjs for preprocessing, escaping,
chunk boundaries, paywall checks, Range responses, cache deduplication,
invalidation, failed-write cleanup and direct-file protection with test doubles.
Real service availability and sound quality require an integration listen;
these unit tests do not prove successful synthesis or device compatibility.
