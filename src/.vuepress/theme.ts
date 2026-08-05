import { hopeTheme } from "vuepress-theme-hope";

import navbar from "./navbar.js";
import sidebar from "./sidebar.js";

export default hopeTheme({
  hostname: "https://skywatcher.pages.dev",

  darkmode: "enable",

  author: {
    name: "中国观天者小行星搜寻活动",
  },

  iconAssets: "fontawesome-with-brands",

  logo: "/中文徽章.png",

  docsDir: "src",

  // 导航栏
  navbar,

  // 侧边栏
  sidebar,

  // 页脚
  footer: "从现在开始搜寻属于你的小行星！ | 版权所有 © 2022-2024 CSASC",
  displayFooter: false,

  print: false,

  // 插件配置
  plugins: {
    comment: false,

    components: {
      components: ["Badge", "VPCard"],
    },

    markdownImage: {
      figure: true,
      lazyload: true,
      size: true,
    },

    mdEnhance: {
      align: true,
      attrs: true,
      component: true,
      mark: true,
      sub: true,
      sup: true,
      tasklist: true,
      vPre: true,
    },

    // PWA：离线访问 + 可安装
    pwa: {
      favicon: "/icons/icon-192.png",
      themeColor: "#0a0f1e",
      cacheHTML: true,
      // 允许离线缓存标题字体（2.2MB）与教程截图
      maxSize: 4096,
      apple: {
        icon: "/icons/apple-icon-180.png",
        statusBarColor: "black",
      },
      manifest: {
        name: "中国观天者小行星搜寻项目",
        short_name: "CSASC",
        description: "中国观天者小行星搜寻项目（CSASC）官方活动官网。",
        theme_color: "#0a0f1e",
        background_color: "#0a0f1e",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    },

    // SEO：统一分享卡片图片为项目徽章
    seo: {
      fallBackImage: "https://skywatcher.pages.dev/icons/icon-512.png",
      ogp: (ogp) => {
        ogp["og:image"] = "https://skywatcher.pages.dev/icons/icon-512.png";

        return ogp;
      },
    },
  },
});
