import { NextResponse } from "next/server";
import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { readAsset } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const found = readAsset(id);
    if (!found) return json({ error: "Asset not found" }, 404);

    const { asset, data } = found;
    const headers: Record<string, string> = {
      "content-type": asset.mime,
      "content-length": String(data.length),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    };
    // Never render user-influenced HTML on our own origin — download it.
    if (asset.mime === "text/html") {
      headers["content-disposition"] = `attachment; filename="storyboard-${asset.id.slice(0, 8)}.html"`;
    }
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  });
}
