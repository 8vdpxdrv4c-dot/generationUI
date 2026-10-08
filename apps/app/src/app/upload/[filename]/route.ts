import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { uploadDirectory, UPLOAD_MIME_TYPES } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const mimeType = UPLOAD_MIME_TYPES[extname(filename).toLowerCase()];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(filename) || !mimeType) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bytes = await readFile(join(uploadDirectory(), filename));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    console.error("[upload] failed to read upload", error);
    return new Response("Unable to read file", { status: 500 });
  }
}
