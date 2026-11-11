import { isLiveFor, type ResolvedKeys } from "../keys";
import { TTS, TTS_PROVIDER, VOICESTUDIO } from "../config";
import { configuredLlm } from "./llm";
import { MockImage, OpenAIImage } from "./image";
import { KlingVideo, MockVideo } from "./video";
import { MockTts, OpenAiCompatibleTts, openAiTts } from "./tts";
import type { ImageProvider, LlmProvider, TtsProvider, VideoProvider } from "./types";

export { configuredLlm };

export function llm(keys: ResolvedKeys): LlmProvider {
  return configuredLlm(keys);
}

export function image(keys: ResolvedKeys): ImageProvider {
  if (isLiveFor(keys, "image") && keys.openaiKey) return new OpenAIImage(keys.openaiKey);
  return new MockImage();
}

export function video(keys: ResolvedKeys): VideoProvider {
  if (isLiveFor(keys, "video") && keys.klingAccess && keys.klingSecret) {
    return new KlingVideo(keys.klingAccess, keys.klingSecret);
  }
  return new MockVideo();
}

/**
 * Narration. OpenAI and VoiceStudio share one adapter because VoiceStudio
 * mirrors OpenAI's /v1/audio/speech contract — only the endpoint changes.
 */
export function tts(keys: ResolvedKeys): TtsProvider {
  if (!isLiveFor(keys, "tts")) return new MockTts();

  switch (TTS_PROVIDER) {
    case "voicestudio":
      return new OpenAiCompatibleTts(
        "voicestudio",
        `${VOICESTUDIO.url.replace(/\/+$/, "")}/v1`,
        VOICESTUDIO.apiKey,
        VOICESTUDIO.model,
        VOICESTUDIO.voice,
      );
    case "custom":
      return new OpenAiCompatibleTts("custom-tts", TTS.baseUrl, TTS.apiKey, TTS.model, TTS.voice);
    default:
      return openAiTts(keys.openaiKey);
  }
}
