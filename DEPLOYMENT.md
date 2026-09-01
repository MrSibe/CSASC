# CSASC Astro 报名系统部署

公共站点由 Astro Starlight、Cloudflare Pages Functions 和 D1 组成。独立管理 Worker 不在本目录内。

## 1. 安装与检查

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm astro check
pnpm build
```

本地联调报名接口前，将 `.dev.vars.example` 复制为 `.dev.vars`。示例中的 Turnstile 密钥只能用于开发环境。

## 2. D1 数据库

首次创建数据库后，将数据库 ID 写入 `wrangler.jsonc`，然后执行：

```bash
pnpm db:migrate:remote
```

迁移生产数据库前先导出备份：

```bash
pnpm wrangler d1 export csasc-registrations --remote --output=csasc-registrations-backup.sql
```

备份包含个人信息，应存放在受控位置，不要提交到 Git。

## 3. Cloudflare Pages

1. Pages 项目的根目录设置为本 Astro 项目目录。
2. 构建命令设置为 `pnpm build`，输出目录设置为 `dist`。
3. 在 `wrangler.jsonc` 配置 D1、当前届次、北京时间开放与截止时间以及 Turnstile Site Key。
4. 在 Pages 的 Variables and Secrets 中添加加密变量 `TURNSTILE_SECRET`。
5. Turnstile 允许域名应包含 `skywatcher.pages.dev` 和使用中的预览域名。
6. 部署后访问 `/api/registration-config`，确认届次、时间和开放状态正确。

切换下一届时只修改 `CAMPAIGN_CODE`、`CAMPAIGN_TITLE`、`REGISTRATION_OPENS_AT` 和 `REGISTRATION_CLOSES_AT`。时间必须包含时区，例如 `2026-09-01T09:00:00+08:00`。

## 4. 上线验收

- 检查 `/`、`/portfolio`、`/tutor`、`/application` 及相应 `.html` 地址。
- 使用生产 Turnstile 分别提交一次个人、2 人团队和 9 人团队报名。
- 重复邮箱应收到冲突提示；使用相同幂等键重试应返回原报名编号。
- 在独立管理 Worker 中确认能够查看、筛选和导出新报名。
