# Contributing to ApolloKit

感谢你愿意贡献 ApolloKit！本文档记录我们的工作流、代码风格、提交与发布流程。在提交 PR 前请通读。

> 项目总体上下文、命令速查、scaffold 历史都在 [`AGENTS.md`](./AGENTS.md)。本文档专注于**「如何贡献」**。

## 行为准则

请保持友善、聚焦于技术讨论。对事不对人，欢迎不同意见，但不欢迎人身攻击。维护者保留关闭越界讨论的权利。

## 开发环境

- **Node**: `>=18`
- **pnpm**: `10.x`（版本锁定于 `package.json` `packageManager`）
- **操作系统**: macOS / Linux 均可；Windows 推荐 WSL2
- **Cloudflare 账号**: 本地不强制；部署或调试 Worker secrets 时需要
- **Postgres**: Neon 免费档即可；也可本地 `docker run postgres`

```bash
git clone https://github.com/<fork>/apollokit.git
cd apollokit
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars
# 填入 DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL
pnpm --filter=server db:migrate
pnpm dev
```

关于外部服务细节、部署流程，见 [README.md](./README.md)。

## 分支策略

- `main` —— 可发布分支。受保护，只能通过 PR 合入。
- `feat/<short-name>` —— 新特性
- `fix/<short-name>` —— bug 修复
- `chore/<short-name>` —— 杂项（依赖升级、CI、文档等非功能性改动）
- `docs/<short-name>` —— 仅文档改动
- `refactor/<short-name>` —— 纯重构，不改外部行为

一个 PR 一个 scope。尽量小，尽量让 reviewer 在 10 分钟内读完。

## Commit 风格

遵循 [Conventional Commits](https://www.conventionalcommits.org/)。基本格式：

```
<type>(<scope>): <短描述>

<可选的长描述，说明「为什么」而不是「做了什么」>

<可选 footer，比如 BREAKING CHANGE: 或 Closes #123>
```

常用 `type`：

| type       | 含义                 |
| ---------- | -------------------- |
| `feat`     | 新功能               |
| `fix`      | bug 修复             |
| `docs`     | 仅文档改动           |
| `refactor` | 重构（不改功能）     |
| `perf`     | 性能优化             |
| `test`     | 测试相关             |
| `chore`    | 构建 / 依赖 / CI     |
| `style`    | 代码格式（不改语义） |
| `build`    | 构建系统 / 外部依赖  |
| `revert`   | 回滚                 |

常用 `scope`（不是必填，但建议）：

- `admin` · `server` · `ui` · `sdk` · `docs` · `marketing` · `pricing` · `auth` · `economy` · `liveops` · `social`

示例：

```
feat(server): add leaderboard seasonal settlement cron

Currently rank cycles settle lazily on next fetch. This cron writes a
snapshot at cycleKey rollover so historical seasons are queryable even
if nobody hits the endpoint.

Closes #142
```

```
fix(admin): avoid landing hero period wrapping to its own line on mobile
```

```
chore(deps): bump wrangler from 4.70 to 4.72
```

不强制 emoji、不强制签名（Signed-off-by）。

## 代码风格

- **TypeScript 严格模式** —— `noUnusedLocals` / `noUnusedParameters` / `strict: true` 都开着。别 `@ts-ignore`，如果真有必要必须写原因注释。
- **ESLint 零警告** —— `--max-warnings 0`。CI 会拒掉任何新警告。
- **Prettier** —— 配置在根 `.prettierrc`。不要手工调格式，`pnpm format` 即可。
- **导入路径** —— admin 用 `#/*` 或 `@/*` 别名；不要写 `../../../../src/foo`。
- **命名** —— 文件 kebab-case，React 组件 PascalCase，TypeScript types UpperCamel，hooks `useXxx`。
- **避免新增 UI 组件库**。现有 shadcn/ui + fumadocs 足以满足 90% 场景。
- **国际化** —— 玩家可见的文案一律走 paraglide（`apps/admin/src/paraglide/messages.js`），不硬编码中英文字符串。

### 提交前检查

```bash
pnpm lint
pnpm check-types
```

两者必须通过，CI 也会跑一遍。测试：

```bash
pnpm --filter=admin test        # vitest
pnpm --filter=server test       # vitest
```

新功能建议配带测试；bug 修复**必须**配一个失败-转通过的回归测试。

## 数据库迁移

Schema 改动走 Drizzle 生成迁移文件，**禁止**用 `db:push` 强推远端：

```bash
# 1. 改 apps/server/src/schema/*.ts
# 2. 生成 .sql 迁移文件
pnpm --filter=server db:generate
# 3. 检查生成物，提交：apps/server/drizzle/NNNN_*.sql
# 4. 本地应用
pnpm --filter=server db:migrate
# 5. 提交代码（schema + 迁移文件）并发 PR
```

维护者在 merge 后会把迁移文件同步应用到生产 Neon 分支。

不要在同一个 PR 里做「大改 schema + 改业务逻辑」，拆成两个。

## 模块贡献

想加一个新的游戏通用模块（比如「每日挑战」「战令」「PVP 匹配」）？请先开 **Discussion** 或 **Issue** 描述：

1. **核心领域概念**（Entity / Aggregate / ValueObject）
2. **HTTP API 草案**（哪些端点、幂等性如何保证）
3. **控制台 UI 草案**（策划在哪里配什么）
4. **SDK 方法签名**（客户端调用形态）
5. **事件中心埋点契约**（哪些事件、字段形状）

这几个维度拍板后再开 PR，否则很容易返工。已上线模块可以直接参考（建议从 `apps/server/src/modules/checkin/` + `apps/admin/src/components/check-in/` 入手，这是最完整的一个）。

## 发布流程

ApolloKit 使用 [Changesets](https://github.com/changesets/changesets) 管理版本与 changelog：

```bash
# 在 PR 里写 changeset 条目
pnpm changeset
# 选择改动的包（目前主要是 apollokit-server / apollokit-admin），
# 选版本级别（patch / minor / major），写一行面向用户的 changelog。
# 会在 .changeset/ 下生成一个 md 文件，提交进 PR。
```

每个对用户可见（API / 行为 / 迁移）的改动都应该带一个 changeset；纯内部重构可以不写。

发布由维护者处理：merge 后 `pnpm changeset version` 更新版本号与 CHANGELOG → `pnpm changeset publish` 发布（如果包是 public）。Worker 由 `wrangler deploy` 部署。

## 文档 & 截图

- 主 README 的截图存放在 `screenshots/`
- 要更新截图：运行 `pnpm dev` 把 admin 跑起来，然后在**另一个终端**安装 playwright 并运行脚本：
  ```bash
  pnpm add -D -w playwright        # 临时安装；不要提交到 package.json
  pnpm exec playwright install chromium
  pnpm screenshots
  git checkout package.json pnpm-lock.yaml
  ```
- 提交 PR 时带上新截图

## Issue & Bug 报告模板

提 bug 请至少包含：

1. **复现步骤**（最好到 gif / 录屏 / 最小仓库）
2. **期望行为 vs 实际行为**
3. **环境**：OS / Node 版本 / pnpm 版本 / 是否部署在 Cloudflare
4. **相关日志**（Worker tail、浏览器 console、`wrangler tail` 输出）
5. **你已经尝试过的排查**（避免大家做重复劳动）

## Security

如果你发现**安全问题**（例如认证绕过、SSRF、注入），**请不要开公开 issue**。发邮件到 `security@apollokit.dev`，维护者会在 72 小时内回复。

## 评审承诺

PR 提交后预期 72 小时内会有维护者首次响应（周末顺延）。如果超过一周没动静，可以在 PR 里 at 维护者或发邮件。

## 许可

贡献视为你同意按 [MIT License](./LICENSE) 发布所提交的代码，并授权所有其他项目参与者使用、复制、分发、修改、合并的权利。
