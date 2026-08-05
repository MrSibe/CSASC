import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/": [
    {
      text: "首页",
      link: "/",
      icon: "home",
    },
    {
      text: "活动介绍",
      link: "/portfolio",
      icon: "lightbulb",
    },
    {
      text: "搜寻教程",
      link: "/tutor",
      icon: "computer",
    },
    {
      text: "报名参与",
      link: "/application",
      icon: "flag",
    },
  ],
});
