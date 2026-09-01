# CSASC 报名系统部署

报名系统由公共 Pages 项目、D1 数据库和独立 Admin Worker 组成。以下配置中的 ID、域名和邮箱都必须替换为实际值，密钥不得提交到仓库。

## 1. 安装与本地检查

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm docs:build
pnpm admin:build
```

公共 Pages Functions 使用根目录的 `wrangler.jsonc`。本地运行前复制 `.dev.vars.example` 为 `.dev.vars`；示例中的 Turnstile 密钥是 Cloudflare 官方测试密钥，不能用于生产。

## 2. 创建并初始化 D1

```bash
pnpm wrangler d1 create csasc-registrations --location apac
```

把返回的数据库 ID 同时写入根目录和 `admin-worker/wrangler.jsonc`。随后执行：

```bash
pnpm db:migrate:remote
```

迁移现有生产数据库前先导出：

```bash
pnpm wrangler d1 export csasc-registrations --remote --output=csasc-registrations-backup.sql
```

备份包含个人信息，应存放在受控位置，不要提交到 Git。

## 3. 配置公共报名站点

1. 在 Cloudflare Turnstile 创建站点，允许 `skywatcher.pages.dev`，取得 Site Key 和 Secret Key。
2. 在 `wrangler.jsonc` 设置真实 D1 ID、当前届次、北京时间开放/截止时间和 Turnstile Site Key。
3. 在 Pages 项目的 Settings → Variables and Secrets 中添加加密变量 `TURNSTILE_SECRET`。
4. Pages 构建命令使用 `pnpm docs:build`，输出目录使用 `src/.vuepress/dist`。
5. 部署后调用 `/api/registration-config`，确认届次、时间和开放状态正确。

切换下一届时只修改 `CAMPAIGN_CODE`、`CAMPAIGN_TITLE`、`REGISTRATION_OPENS_AT` 和 `REGISTRATION_CLOSES_AT`。开放和截止时间必须包含时区，例如 `2026-09-01T09:00:00+08:00`。

## 4. 配置管理后台与 Cloudflare Access

1. 在 Zero Trust → Access → Applications 中为 `csasc-registration-admin` Worker 创建 Access 应用。
2. Access 策略只允许明确列出的管理员邮箱，并配置 One-time PIN 或现有身份提供商。
3. 从 Access 应用复制 Audience Tag，并取得团队域名 `https://<team>.cloudflareaccess.com`。
4. 在 `admin-worker/wrangler.jsonc` 填写 `TEAM_DOMAIN` 和 `POLICY_AUD`；可选地用 `ADMIN_EMAILS` 再设置一层逗号分隔邮箱白名单。
5. 构建并部署：

```bash
pnpm admin:deploy
```

Admin Worker 会按照 Cloudflare 官方要求验证 `Cf-Access-Jwt-Assertion` 的签名、签发者、Audience 和有效期；只检查请求头存在是不够的。

## 5. 上线验收与备份

- 使用 Turnstile 生产密钥分别提交一次个人、2 人团队和 9 人团队报名。
- 重复提交同一邮箱应收到冲突提示；使用相同幂等键重试应返回原报名编号。
- 未登录浏览器不能打开 Admin Worker；允许的管理员可筛选、查看、导出 CSV。
- 删除测试报名时必须输入完整报名编号。
- 每届结束后执行一次 D1 导出并妥善保管，确认备份后再开始下一届。
