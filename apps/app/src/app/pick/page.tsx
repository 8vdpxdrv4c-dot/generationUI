"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Pool of visualization prompts — 3 are randomly selected per visit */
/* ------------------------------------------------------------------ */
const ALL_PROMPTS = [
  {
    emoji: "🌌",
    title: "太阳系",
    prompt:
      "创建一个交互式 3D 太阳系，行星沿轨道运行，带真实纹理与轨道线，并为每颗行星添加标签。",
  },
  {
    emoji: "🧬",
    title: "DNA 双螺旋",
    prompt:
      "可视化旋转的 3D DNA 双螺旋，展示碱基对、磷酸骨架与平滑动画，并对核苷酸碱基着色区分。",
  },
  {
    emoji: "📊",
    title: "收入仪表盘",
    prompt:
      "构建收入分析仪表盘：月度收入柱状图、按类别的收入饼图，以及总收入、增长率和头部类别的 KPI 卡片。",
  },
  {
    emoji: "🏗️",
    title: "微服务架构",
    prompt:
      "绘制微服务架构图：API 网关、认证服务、用户服务、订单服务、通知服务，以及连接它们的消息队列，并展示数据流。",
  },
  {
    emoji: "🌊",
    title: "海浪场景",
    prompt:
      "创建交互式 3D 海洋场景，含真实波浪物理、动态光照与日落天空渐变，并提供相机控制以便探索。",
  },
  {
    emoji: "🔮",
    title: "神经网络",
    prompt:
      "可视化神经网络的输入层、隐藏层与输出层。用发光脉冲动画展示数据沿连接流动，用线宽表示权重。",
  },
  {
    emoji: "🗺️",
    title: "力导向图",
    prompt:
      "创建力导向图，展示约 30 个节点的社交网络。节点可拖拽，按社群着色，按连接数调整大小。",
  },
  {
    emoji: "🎵",
    title: "音频可视化",
    prompt:
      "构建彩色音频频谱可视化，用动画条响应模拟频谱，采用渐变配色与平滑动画。",
  },
  {
    emoji: "🏔️",
    title: "3D 地形",
    prompt:
      "生成带程序化高度图、水面与大气雾效的 3D 地形，并提供轨道控制以便从不同角度观察。",
  },
  {
    emoji: "⚛️",
    title: "原子模型",
    prompt:
      "创建交互式 3D 碳原子玻尔模型：绕核运动的电子、含质子中子的原子核与轨道环，并动画电子路径。",
  },
  {
    emoji: "🌳",
    title: "分形树",
    prompt:
      "可视化递归生长的分形树动画，加入风吹摇曳，使用自然的绿到棕渐变。",
  },
  {
    emoji: "🚀",
    title: "火箭发射",
    prompt:
      "创建 3D 火箭发射动画：尾焰粒子、发射台与星空背景，相机跟随火箭运动。",
  },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function PickPageWrapper() {
  return (
    <Suspense fallback={<div style={styles.container}><p style={{ color: "rgba(255,255,255,0.6)" }}>加载中...</p></div>}>
      <PickPage />
    </Suspense>
  );
}

function PickPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [picked, setPicked] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => pickRandom(ALL_PROMPTS, 3), []);

  // Notify desktop that QR was scanned
  useEffect(() => {
    if (sessionId) {
      fetch("/api/pick", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, [sessionId]);

  const handlePick = async (prompt: string) => {
    if (!sessionId || picked) return;
    setPicked(true);
    try {
      const res = await fetch("/api/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, prompt }),
      });
      if (!res.ok) throw new Error("Failed to submit");
    } catch {
      setError("出错了，请重试。");
      setPicked(false);
    }
  };

  if (!sessionId) {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>链接无效 — 请从主应用扫描二维码。</p>
      </div>
    );
  }

  if (picked) {
    return (
      <div style={styles.container}>
        <div style={styles.successCard}>
          <span style={{ fontSize: 48 }}>&#10003;</span>
          <h2 style={styles.successTitle}>已发送！</h2>
          <p style={styles.successSub}>请看大屏幕，可视化即将生成。</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>选择一个可视化</h1>
      <p style={styles.subheading}>点选一项，AI 将实时构建。</p>

      <div style={styles.grid}>
        {options.map((opt) => (
          <button
            key={opt.title}
            onClick={() => handlePick(opt.prompt)}
            style={styles.card}
          >
            <span style={styles.emoji}>{opt.emoji}</span>
            <span style={styles.cardTitle}>{opt.title}</span>
          </button>
        ))}
      </div>

      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline styles — self-contained page, no dependency on app theme   */
/* ------------------------------------------------------------------ */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    background: "linear-gradient(145deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
    color: "#fff",
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 4px",
    textAlign: "center" as const,
  },
  subheading: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    margin: "0 0 32px",
    textAlign: "center" as const,
  },
  grid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    width: "100%",
    maxWidth: 340,
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 20px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 0.15s, background 0.15s",
    WebkitTapHighlightColor: "transparent",
    textAlign: "left" as const,
    fontFamily: "inherit",
  },
  emoji: {
    fontSize: 28,
    lineHeight: 1,
  },
  cardTitle: {
    flex: 1,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center" as const,
  },
  successCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    color: "#85e0ce",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  successSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    margin: 0,
    textAlign: "center" as const,
  },
};
