import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { uploadDirectory } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const SIGNATURES: Record<string, { mimeType: string; test: (bytes: Uint8Array) => boolean }> = {
  ".png": {
    mimeType: "image/png",
    test: (b) => b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n),
  },
  ".jpg": { mimeType: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".jpeg": { mimeType: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".gif": {
    mimeType: "image/gif",
    test: (b) => b.length >= 6 && String.fromCharCode(...b.slice(0, 6)).startsWith("GIF8"),
  },
  ".webp": {
    mimeType: "image/webp",
    test: (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
  ".bmp": { mimeType: "image/bmp", test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
  ".avif": {
    mimeType: "image/avif",
    test: (b) => b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(String.fromCharCode(...b.slice(8, 12))),
  },
  ".glb": {
    mimeType: "model/gltf-binary",
    test: (b) => {
      if (b.length < 20 || String.fromCharCode(...b.slice(0, 4)) !== "glTF") return false;
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const jsonChunkLength = view.getUint32(12, true);
      return view.getUint32(4, true) === 2 &&
        view.getUint32(8, true) === b.length &&
        jsonChunkLength > 0 &&
        20 + jsonChunkLength <= b.length &&
        String.fromCharCode(...b.slice(16, 20)) === "JSON";
    },
  },
};

export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_SIZE + 1024 * 1024) {
    return NextResponse.json({ error: "文件不能超过 50 MB。" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传文件。" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "缺少上传文件。" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "不能上传空文件。" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件不能超过 50 MB。" }, { status: 413 });
  }

  const extension = extname(file.name).toLowerCase();
  const signature = SIGNATURES[extension];
  if (!signature) {
    return NextResponse.json({ error: "仅支持 PNG、JPG、GIF、WebP、BMP、AVIF 图片或 GLB 模型。" }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signature.test(bytes)) {
    return NextResponse.json({ error: "文件内容与扩展名不匹配，或文件格式无效。" }, { status: 415 });
  }

  const filename = `${randomUUID()}${extension}`;
  const uploadDir = uploadDirectory();
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), bytes, { flag: "wx" });
  } catch (error) {
    console.error("[api/upload] failed to save upload", error);
    return NextResponse.json({ error: "文件保存失败，请重试。" }, { status: 500 });
  }

  return NextResponse.json({
    path: `/upload/${filename}`,
    url: new URL(`/upload/${filename}`, req.url).toString(),
    filename,
    originalName: file.name,
    size: file.size,
    mimeType: signature.mimeType,
  }, { status: 201 });
}
