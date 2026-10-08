// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { POST } from "../route";
import { GET } from "../../../upload/[filename]/route";

let directory: string;
let previousDirectory: string | undefined;
beforeEach(async () => {
  previousDirectory = process.env.UPLOAD_DATA_DIR;
  directory = await mkdtemp(join(tmpdir(), "ogui-uploads-"));
  process.env.UPLOAD_DATA_DIR = directory;
});
afterEach(async () => {
  if (previousDirectory === undefined) delete process.env.UPLOAD_DATA_DIR;
  else process.env.UPLOAD_DATA_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});

it("serves a newly uploaded image from persistent storage without rebuilding", async () => {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "test.png");
  const saved = await POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
  expect(saved.status).toBe(201);
  const { filename, path } = await saved.json();
  const response = await GET(new Request(`http://localhost${path}`), { params: Promise.resolve({ filename }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

it.each(["../../.env", "unknown.svg", "00000000-0000-0000-0000-000000000000.png"])("returns 404 for unsafe or missing upload %s", async (filename) => {
  const response = await GET(new Request("http://localhost/upload/test"), { params: Promise.resolve({ filename }) });
  expect(response.status).toBe(404);
});
