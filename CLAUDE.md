# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在该仓库中工作的指导。

## 项目概述

ClawGod 是对官方 `@anthropic-ai/claude-code` npm 包的运行时补丁工具。它**不是**第三方客户端，而是下载官方 bundle 后，应用补丁并替换系统的 `claude` 命令。

Claude Code 在 v2.1.114 发生了重大架构变化：从 JS bundle (`cli.js`) 切换为原生编译二进制。ClawGod 已适配这一变化，支持两种工作模式：

| 模式 | 条件 | 完整补丁 | 环境变量注入 |
|------|------|----------|-------------|
| **Legacy** | `cli.js` 存在（v2.1.112 及更早） | ✅ | ✅ |
| **Native** | 仅原生二进制（v2.1.114 及更新） | ❌ 不可用 | ✅ |

Native 模式下，源码级补丁（绿色主题、消息过滤器、内部用户模式等）不可用，但 API 代理、模型别名、GrowthBook 功能标志覆盖仍通过环境变量注入生效。

## 仓库结构

- `install.sh` — macOS/Linux 引导脚本。验证 Node.js，下载 CLI 源码到 `~/.clawgod/`，创建 `clawgod` 命令，然后运行 `clawgod install`。
- `install.ps1` — Windows PowerShell 引导脚本。与 `install.sh` 行为一致。
- `bin/clawgod.mjs` — CLI 入口点。
- `src/index.mjs` — 参数解析和命令路由。
- `src/commands/` — CLI 子命令实现：`install.mjs`, `uninstall.mjs`, `patch.mjs`, `status.mjs`。
- `src/core/` — 核心逻辑模块：
  - `downloader.mjs` — `npm install` Claude Code，检测架构（Legacy/Native），复制 `cli.js` 或定位原生二进制。
  - `patcher.mjs` — 对 `cli.original.js` 应用正则补丁。支持 `optional`、`unique`、`selectIndex`、`validate` 标志。
  - `wrapper.mjs` — 生成 `~/.clawgod/cli.js`。Legacy 模式下 `import()` JS bundle；Native 模式下 `spawnSync()` 原生二进制。
  - `extractor.mjs` — Mach-O / ELF / PE 解析器，从官方二进制中提取内嵌 `.node` 原生模块。
  - `vendor.mjs` — 复制 `vendor/`（ripgrep、tree-sitter）到 `~/.clawgod/vendor/`。
- `src/utils/` — 跨平台工具：`paths.mjs`（路径常量）、`platform.mjs`（平台检测）、`shell.mjs`（进程/FS 辅助）。
- `package.json` — ESM 项目配置，`bin: { "clawgod": "./bin/clawgod.mjs" }`。
- `index.html` / `bypass.png` — 官网素材。
- `README.md` / `README_ZH.md` / `README_JP.md` — 用户文档。
- `docs/superpowers/` — 设计规范和实现计划（CLI 重构）。

## 常用开发命令

```bash
# 首次安装（引导脚本安装 CLI 到 PATH 并运行 install）
bash install.sh               # macOS/Linux
.\install.ps1                 # Windows

# CLI 命令（安装后可用）
clawgod install               # 安装最新版本（自动检测 Legacy/Native）
clawgod install --version 2.1.112   # 强制使用 Legacy 版本（完整补丁）
clawgod install --version 2.1.117   # Native 版本（wrapper-only）
clawgod patch --dry-run       # 测试补丁兼容性
clawgod patch --verify        # 检查补丁状态
clawgod patch --revert        # 回滚补丁
clawgod uninstall             # 卸载，恢复原始 claude
clawgod status                # 查看安装状态
```

## 补丁工作原理

### Legacy 模式（完整流程）

1. **下载** — `npm install @anthropic-ai/claude-code` 到 `~/.clawgod/node_modules`。
2. **架构检测** — 检查 `cli.js` 是否存在。存在则进入 Legacy 模式。
3. **提取** — 复制 `cli.js` → `~/.clawgod/cli.original.js`。
4. **Vendor 设置** — 复制 `vendor/`。可选：从原生二进制提取 `.node` 模块。
5. **打补丁** — `patcher.mjs` 对 `cli.original.js` 应用 23 条正则替换。
6. **包装** — `wrapper.mjs` 生成 `cli.js`，注入环境变量后 `await import('./cli.original.js')`。
7. **安装启动器** — 替换系统 `claude` 命令，备份原始为 `claude.orig`。

### Native 模式（简化流程）

1. **下载** — 同上。
2. **架构检测** — `cli.js` 不存在，检测到原生二进制（`bin/claude.exe` 或平台特定包）。
3. **包装** — `wrapper.mjs` 生成 `cli.js`，注入环境变量后通过 `spawnSync()` 调用原生二进制。
4. **安装启动器** — 同上。跳过了 patch 和 vendor 步骤。

### 补丁分类

| 类别 | 补丁 | Legacy | Native |
|------|------|--------|--------|
| 功能解锁 | USER_TYPE→ant、Agent Teams、Computer Use、Ultraplan、Ultrareview、Voice Mode，111及以后的版本不支持auto mode。 | ✅ | ❌ |
| GrowthBook | 环境变量覆盖、配置文件覆盖 | ✅ | ✅（通过 `CLAUDE_INTERNAL_FC_OVERRIDES`） |
| 限制移除 | CYBER_RISK、URL 限制、Cautious Actions、登录提示 | ✅ | ❌ |
| 视觉 | 绿色主题（RGB/ANSI/Hex/Shimmer） | ✅ | ❌ |
| 消息过滤 | Attachment bypass、Message list bypass | ✅ | ❌ |

## 重要架构说明

- **单一事实来源**：核心逻辑在 `src/core/` 下的独立 ESM 模块中。`install.sh` 和 `install.ps1` 只是引导脚本，负责将 CLI 安装到 PATH。
- **补丁双向同步**：`install.sh` 和 `install.ps1` 的引导逻辑仍需保持同步（虽然核心逻辑已提取到 CLI 中，但引导脚本本身也存在于两个平台）。
- **包装器差异**：macOS/Linux 在设置了 provider API key 时隔离 `CLAUDE_CONFIG_DIR` 到 `~/.clawgod`；Windows 保持 `~/.claude`。
- **补丁安全性**：每个补丁支持 `optional`（不存在不报错）、`unique`（必须唯一匹配）、`selectIndex`（只取第 N 个匹配）、`validate`（上下文验证函数）。
- **原生模块提取器**：扫描官方 Claude Code 二进制中的 Mach-O / ELF / PE section，提取 `audio-capture`、`image-processor`、`computer-use-input`、`url-handler` 等 `.node` 模块到 `~/.clawgod/vendor/`。这是可选步骤，失败仅警告不中断安装。
- **版本分界**：v2.1.112 是最后一个包含 `cli.js` 的版本。v2.1.114 起改为原生二进制。

## 环境要求

- Node.js >= 18 + npm
- Claude Code 账号（`claude auth login`）
