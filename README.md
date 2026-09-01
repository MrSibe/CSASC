# CSASC 官网

中国观天者小行星搜寻项目公共网站，使用 Astro 与官方 Starlight 模板构建。

## 本地开发

```bash
pnpm install
pnpm dev
```

报名接口依赖 Cloudflare Pages Functions 和 D1。本地联调时复制 `.dev.vars.example` 为 `.dev.vars`，先构建网站，再使用 Wrangler 启动 Pages：

```bash
pnpm build
pnpm wrangler pages dev dist
```

## 检查

```bash
pnpm test
pnpm astro check
pnpm build
```

生产构建输出到 `dist/`。Cloudflare Pages 的项目根目录应指向本目录，构建命令为 `pnpm build`，输出目录为 `dist`。
