import { useConfigureSuggestions } from "@copilotkit/react-core/v2";

export const useExampleSuggestions = () => {
  useConfigureSuggestions({
    suggestions: [
      { title: "北京实时天气", message: "请用 weatherCard 展示北京实时天气，每5秒自动刷新" },
      {
        title: "3D 飞机姿态控制",
        message:
          "用 Three.js 创建一个 3D 飞机，解释俯仰、滚转和偏航，并提供悬停时会动画的控制按钮。",
      },
      {
        title: "酷炫 3D 球体",
        message:
          "创建一个 3D 动画：鼠标悬停时球体变成二十面体，移开后又变回球体，效果要酷一点。",
      },
    ],
    available: "always", // Optional: when to show suggestions
  });
}
