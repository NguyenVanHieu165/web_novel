import { z } from "zod";

export const voiceSchema = z.enum(["female-warm", "male-deep", "female-story"]);
export type StoryVoice = z.infer<typeof voiceSchema>;

export const storyVoices = {
  "female-warm": { label: "Nữ dịu dàng", name: "vi-VN-HoaiMyNeural", rate: "-4%", pitch: "+0Hz", paragraphPause: "…", browserRate: 0.96, browserPitch: 1 },
  "male-deep": { label: "Nam trầm ấm", name: "vi-VN-NamMinhNeural", rate: "-3%", pitch: "-3%", paragraphPause: "…", browserRate: 0.97, browserPitch: 0.97 },
  "female-story": { label: "Nữ truyền cảm", name: "vi-VN-HoaiMyNeural", rate: "-7%", pitch: "+2%", paragraphPause: "……", browserRate: 0.93, browserPitch: 1.02 },
} as const;

export const playbackRates = [0.85, 1, 1.15, 1.25, 1.5] as const;
export const audioPreferencesSchema = z.object({
  version: z.literal(1),
  voice: voiceSchema,
  rate: z.number().refine((rate) => playbackRates.some((candidate) => candidate === rate)),
  autoNext: z.boolean(),
});
export const defaultAudioPreferences = { version: 1 as const, voice: "female-warm" as StoryVoice, rate: 1, autoNext: false };
export type AudioPreferences = z.infer<typeof audioPreferencesSchema>;

export const audioResponseSchema = z.object({
  audioUrl: z.string().startsWith("/api/chapters/"),
  cached: z.boolean(),
});
