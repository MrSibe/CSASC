import { defineClientConfig, usePageData } from "vuepress/client";
import { onMounted, watch } from "vue";

interface Meteor {
  x: number;
  y: number;
  angle: number;
  speed: number;
  length: number;
  opacity: number;
  cooldown: number;
}

/**
 * 首页动效（借鉴 theme-hope snowFall 的 canvas 粒子模式）：
 * - 流星雨：随机角度/速度/尾巴长度，划过一次后间歇冷却再出现
 * - 副标题打字机：逐字显示，配合 index.scss 中的光标闪烁
 * 两者仅在首页（路径 "/"）生效。
 */
export default defineClientConfig({
  setup() {
    // 使用 @vuepress/client 提供的 usePageData 判断首页，避免直接依赖 vue-router
    const page = usePageData();

    let meteorCanvas: HTMLCanvasElement | null = null;
    let meteorRaf = 0;

    const startMeteors = () => {
      if (meteorCanvas) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const canvas = document.createElement("canvas");
      meteorCanvas = canvas;
      canvas.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;opacity:0;transition:opacity .4s ease";
      document.body.appendChild(canvas);

      const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      resize();
      window.addEventListener("resize", resize);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 流星从右上方出发，角度约 30°~45°（从右上划向左下）
      const spawn = (): Meteor => ({
        x: canvas.width * (0.9 + Math.random() * 0.4),
        y: canvas.height * Math.random() * 0.55,
        angle: Math.PI * (0.16 + Math.random() * 0.1),
        speed: 6 + Math.random() * 8,
        length: 100 + Math.random() * 180,
        opacity: 0.4 + Math.random() * 0.6,
        cooldown: Math.random() * 240,
      });

      const meteors: Meteor[] = [];
      for (let i = 0; i < 4; i++) meteors.push(spawn());

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const m of meteors) {
          if (m.cooldown > 0) {
            m.cooldown--;
            continue;
          }

          m.x += Math.cos(m.angle) * m.speed;
          m.y += Math.sin(m.angle) * m.speed;

          const dx = Math.cos(m.angle) * m.length;
          const dy = Math.sin(m.angle) * m.length;

          // 渐变尾巴：头部亮、尾部透明
          const grad = ctx.createLinearGradient(m.x, m.y, m.x - dx, m.y - dy);
          grad.addColorStop(0, `rgba(255,255,255,${m.opacity})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - dx, m.y - dy);
          ctx.stroke();

          // 头部光晕
          const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 5);
          glow.addColorStop(0, `rgba(255,255,255,${m.opacity})`);
          glow.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
          ctx.fill();

          // 滑出画布后重置，并冷却一段时间（流星雨是间歇性的）
          if (m.x < -150 || m.x > canvas.width + 150 || m.y > canvas.height + 150) {
            Object.assign(m, spawn());
            m.cooldown = 300 + Math.random() * 500;
          }
        }

        meteorRaf = requestAnimationFrame(draw);
      };

      draw();
    };

    const typeTagline = () => {
      const el = document.querySelector<HTMLElement>("#main-description");
      if (!el || el.dataset.typed) return;
      el.dataset.typed = "true";
      const text = el.textContent ?? "";
      el.textContent = "";
      let i = 0;
      const timer = window.setInterval(() => {
        el.textContent = text.slice(0, ++i);
        if (i >= text.length) window.clearInterval(timer);
      }, 120);
    };

    const apply = () => {
      const isHome = page.value.path === "/";
      if (meteorCanvas) meteorCanvas.style.opacity = isHome ? "1" : "0";
      if (isHome) window.setTimeout(typeTagline, 200);
    };

    onMounted(() => {
      startMeteors();
      apply();
      watch(() => page.value.path, apply);
    });
  },
});
