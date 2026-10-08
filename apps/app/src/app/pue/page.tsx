import Link from "next/link";
import { PueGauge } from "@/components/generative-ui/pue-gauge";

export default function PuePage() {
  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "var(--surface-secondary, #f3f6f7)" }}>
      <div className="mx-auto max-w-md">
        <Link href="/" className="text-sm">← 返回对话</Link>
        <PueGauge />
      </div>
    </main>
  );
}
