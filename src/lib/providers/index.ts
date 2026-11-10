import { isLiveFor, type ResolvedKeys } from "../keys";
import { configuredLlm } from "./llm";
import { MockImage, OpenAIImage } from "./image";
import { KlingVideo, MockVideo } from "./video";
import { MockTts, OpenAITts } from "./tts";
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

export function tts(keys: ResolvedKeys): TtsProvider {
  if (isLiveFor(keys, "tts") && keys.openaiKey) return new OpenAITts(keys.openaiKey);
  return new MockTts();
}
