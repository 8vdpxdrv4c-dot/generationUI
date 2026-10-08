export type DemoCategory =
  | "3D / 动画"
  | "数据可视化"
  | "示意图"
  | "交互"
  | "UI 组件";

export interface DemoItem {
  id: string;
  title: string;
  description: string;
  category: DemoCategory;
  emoji: string;
  prompt: string;
}

export const DEMO_EXAMPLES: DemoItem[] = [
  {
    id: "demo-pue",
    title: "PUE 能效仪表盘",
    description: "固定圆环指针，量程 0–2；每 5 秒读取模拟接口更新数值",
    category: "数据可视化",
    emoji: "🌡️",
    prompt: "请展示 PUE 能效仪表盘。先调用 plan_visualization，然后调用 pueGauge，无需参数。组件会自行请求 /get_pue，每 5 秒刷新模拟数据。",
  },
  {
    id: "demo-pitch-roll-yaw",
    title: "俯仰、滚转与偏航",
    description: "交互式 3D 飞机，用控制按钮讲解俯仰、滚转和偏航",
    category: "3D / 动画",
    emoji: "✈️",
    prompt:
      "用 Three.js 创建一个 3D 飞机，解释俯仰、滚转和偏航是如何工作的。给我控制各轴的按钮，并标注每种旋转。",
  },
  {
    id: "demo-weather",
    title: "天气卡片",
    description: "实时天气卡片：温度、湿度、风力、空气质量，每5秒自动刷新",
    category: "UI 组件",
    emoji: "🌤️",
    prompt:
      "请使用 weatherCard 组件展示北京的实时天气（温度、湿度、风力、空气质量、未来5天预报）。只需传入 city=\"北京\"（也支持 101010100 这类9位城市编码），卡片会自行每5秒刷新数据。不要用 generateSandboxedUi。",
  },
  {
    id: "demo-binary-search",
    title: "二分查找",
    description: "在有序数组上逐步演示二分查找过程",
    category: "示意图",
    emoji: "🔍",
    prompt:
      "可视化二分查找在有序列表上的工作过程。逐步动画，展示 high、low、mid 指针的移动。",
  },
  {
    id: "demo-solar-system",
    title: "太阳系",
    description: "可点击行星查看科普的 3D 太阳系",
    category: "3D / 动画",
    emoji: "🪐",
    prompt:
      "用 Three.js 构建带轨道行星的 3D 太阳系。点击每颗行星可查看相关事实。包含相对真实的尺寸和轨道速度。",
  },
  {
    id: "demo-dashboard",
    title: "KPI 仪表盘",
    description: "季度业绩仪表盘，含指标卡片与柱状图",
    category: "数据可视化",
    emoji: "📊",
    prompt:
      "创建一个 KPI 仪表盘，展示 2026 年 Q1 业绩：收入、活跃用户和转化率。包含月度收入柱状图与趋势指示。",
  },
  {
    id: "demo-sorting",
    title: "排序对比",
    description: "冒泡排序与快速排序的并行动画对比",
    category: "示意图",
    emoji: "📶",
    prompt:
      "创建冒泡排序与快速排序在同一随机数组上并行动画对比。加入速度控制和步数计数器。",
  },
  {
    id: "demo-pomodoro",
    title: "番茄钟",
    description: "带环形进度、会话计数和控制按钮的专注计时器",
    category: "交互",
    emoji: "🍅",
    prompt:
      "做一个番茄钟：环形进度条、开始/暂停/重置按钮和会话计数。使用 25 分钟工作 / 5 分钟休息，界面简洁。",
  },
  {
    id: "demo-neural-network",
    title: "神经网络",
    description: "可交互的神经网络图，带动画前向传播",
    category: "示意图",
    emoji: "🧠",
    prompt:
      "可视化一个简单的神经网络（输入层、隐藏层、输出层）。动画展示前向传播中数据如何流动。允许调整每层神经元数量。",
  },
  {
    id: "demo-invoice",
    title: "发票卡片",
    description: "含金额、客户信息与操作按钮的紧凑发票卡",
    category: "UI 组件",
    emoji: "🧾",
    prompt:
      "创建一张发票卡片，展示月度账单摘要：客户名、应付金额、发票编号，以及发送/展开操作按钮。",
  },
  {
    id: "demo-music-visualizer",
    title: "音乐均衡器",
    description: "带动画频谱条与控制的音频均衡器可视化",
    category: "3D / 动画",
    emoji: "🎵",
    prompt:
      "创建一个音乐均衡器可视化，用动画条响应频率滑块。加入低音、中音、高音控制，使用渐变配色。",
  },
];

export const DEMO_CATEGORIES: DemoCategory[] = [
  "3D / 动画",
  "数据可视化",
  "示意图",
  "交互",
  "UI 组件",
];
