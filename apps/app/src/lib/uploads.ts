import { join } from "node:path";

export function uploadDirectory(): string {
  return process.env.UPLOAD_DATA_DIR?.trim() || join(process.cwd(), "public", "upload");
}

export const UPLOAD_MIME_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".avif": "image/avif", ".glb": "model/gltf-binary",
};
