import { defineUserConfig } from "vuepress";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/",

  lang: "zh-CN",
  title: "中国观天者小行星搜寻项目",
  description: "从现在开始搜寻属于你的小行星！",
  theme,

  // 和 PWA 一起启用
  // shouldPrefetch: false,
});
