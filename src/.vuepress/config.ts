import { defineUserConfig } from "vuepress";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/",

  lang: "zh-CN",
  title: "中国观天者小行星搜寻项目",
  description:
    "中国观天者小行星搜寻项目（CSASC）——国际天文搜索合作计划（IASC）中国分区，面向中小学生与天文爱好者的公民科学活动，免费参与，搜寻属于你的小行星！",
  head: [
    ["link", { rel: "icon", href: "/icons/icon-192.png" }],
    ["meta", { name: "theme-color", content: "#0a0f1e" }],
  ],

  // 与 PWA 配合，避免预取冲突
  shouldPrefetch: false,

  theme,
});
