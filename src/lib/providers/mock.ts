/**
 * Offline stand-ins. They exist so the full pipeline — script → stills →
 * clips → narration → assembly — is runnable and testable with no API keys
 * and no spend. They are deterministic, which makes tests meaningful.
 */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function dimensions(aspect: string): { w: number; h: number } {
  if (aspect === "16:9") return { w: 1280, h: 720 };
  if (aspect === "1:1") return { w: 1024, h: 1024 };
  return { w: 720, h: 1280 }; // 9:16 default
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine) {
      if (line) lines.push(line.trim());
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines;
}

/** A viewable still that encodes the prompt it was generated from. */
export function svgStill(args: {
  index: number;
  title: string;
  prompt: string;
  aspect: string;
  badge?: string;
}): Buffer {
  const { w, h } = dimensions(args.aspect);
  const lines = wrap(args.prompt, 34, 6);
  const badge = args.badge ?? "MOCK STILL";
  const lineHeight = Math.round(h * 0.028);
  const blockTop = Math.round(h * 0.52);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12141b"/>
      <stop offset="55%" stop-color="#1b2030"/>
      <stop offset="100%" stop-color="#0b0d12"/>
    </linearGradient>
    <radialGradient id="halo" cx="30%" cy="32%" r="55%">
      <stop offset="0%" stop-color="#c9f24d" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#c9f24d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#halo)"/>
  <g stroke="#2b3140" stroke-width="1" opacity="0.55">
    <line x1="0" y1="${h * 0.36}" x2="${w}" y2="${h * 0.36}"/>
    <line x1="0" y1="${h * 0.78}" x2="${w}" y2="${h * 0.78}"/>
  </g>
  <text x="${w * 0.06}" y="${h * 0.12}" fill="#c9f24d" font-family="monospace" font-size="${Math.round(w * 0.026)}" letter-spacing="4">${escapeXml(badge)}</text>
  <text x="${w * 0.06}" y="${h * 0.26}" fill="#e6eaf1" font-family="sans-serif" font-weight="700" font-size="${Math.round(w * 0.085)}">${escapeXml(String(args.index).padStart(2, "0"))}</text>
  <text x="${w * 0.06}" y="${h * 0.315}" fill="#98a1b3" font-family="sans-serif" font-size="${Math.round(w * 0.032)}">${escapeXml(args.title)}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="${w * 0.06}" y="${blockTop + i * lineHeight}" fill="#c3cad6" font-family="sans-serif" font-size="${Math.round(w * 0.024)}">${escapeXml(l)}</text>`,
    )
    .join("\n  ")}
  <text x="${w * 0.06}" y="${h - Math.round(h * 0.04)}" fill="#4b5366" font-family="monospace" font-size="${Math.round(w * 0.02)}">no API key configured · placeholder asset</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

/** A valid 16-bit PCM mono WAV of silence. */
export function silentWav(seconds: number, sampleRate = 22050): Buffer {
  const nSamples = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = nSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}
