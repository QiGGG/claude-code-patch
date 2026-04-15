# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在该仓库中工作的指导。

## 项目概述

ClawGod 是对官方 `@anthropic-ai/claude-code` npm 包的运行时补丁工具。它**不是**第三方客户端，而是下载官方 bundle 后，对压缩后的 JS 应用基于正则表达式的补丁，再包装启动器并替换系统的 `claude` 命令。

## 仓库结构

- `install.sh` — macOS/Linux 的 Bash 安装脚本。这是补丁逻辑和原生模块提取器的主要来源。
- `install.ps1` — Windows 的 PowerShell 安装脚本。包含补丁器和包装逻辑的副本。**补丁定义在此文件中重复出现**，必须与 `install.sh` 保持同步。
- `index.html` — 官网落地页 (`clawgod.0chen.cc`)。
- `bypass.png` — 落地页和 README 使用的截图素材。
- `README.md` / `README_ZH.md` / `README_JP.md` — 面向用户的文档。

本仓库中没有 `package.json`、构建系统或测试套件。

## 补丁工作原理

1. **下载**：从 npm 安装 `@anthropic-ai/claude-code` 到 `~/.clawgod/node_modules`。
2. **提取**：将 npm bundle 中的 `cli.js` 复制为 `~/.clawgod/cli.original.js`。
3. **Vendor 设置**：从 npm bundle 复制 `vendor/`（ripgrep、tree-sitter）。在 macOS/Linux 上，还会通过安装程序内嵌的自定义 Node.js 扫描器解析 Mach-O / ELF / PE 头，从官方 Bun 二进制文件中提取内嵌的原生 `.node` 模块（audio-capture、image-processor、computer-use、url-handler）。
4. **打补丁**：运行 `patch.js`，对 `cli.original.js` 应用基于正则的替换。补丁设计为版本无关。
5. **包装**：`cli.js` 是一个薄包装器，设置环境变量（API 密钥、base URL、功能标志），然后执行 `await import('./cli.original.js')`。
6. **安装**：将系统 `claude` 命令替换为指向 `~/.clawgod/cli.js` 的启动器脚本，并将原始命令备份为 `claude.orig`。

## 常用开发命令

```bash
# 安装/更新
bash install.sh               # macOS/Linux
.\install.ps1                 # Windows

# CLI 命令（安装后可用）
clawgod install               # 安装或更新补丁
clawgod install --version 2.1.89
clawgod patch --dry-run       # 测试补丁
clawgod patch --verify        # 检查补丁状态
clawgod patch --revert        # 回滚补丁
clawgod uninstall             # 卸载
clawgod status                # 查看状态
```

## 重要架构说明

- **单一事实来源**：核心逻辑（patcher、extractor、wrapper、downloader）全部位于 `src/core/` 下的独立 ESM 模块中。`install.sh` 和 `install.ps1` 只是将 `clawgod` CLI 安装到 PATH 的引导脚本。
- **包装器差异**：macOS/Linux 在设置了 provider API key 时隔离 `CLAUDE_CONFIG_DIR` 到 `~/.clawgod`；Windows 保持 `~/.claude`。
- **补丁安全性**：`patcher.mjs` 中每个补丁条目支持 `optional`、`unique`、`selectIndex` 和 `validate` 标志。

## 环境要求

- Node.js >= 18 + npm
- Claude Code 账号（`claude auth login`）
