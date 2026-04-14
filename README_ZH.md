# ClawGod

[English](README.md) | [中文](README_ZH.md) | [日本語](README_JP.md)

> [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 上帝模式。

**这不是第三方 Claude Code 客户端。** ClawGod 是作用在官方 Claude Code 之上的运行时补丁。它兼容任何版本——随着 Claude Code 持续更新，补丁始终生效。

## 安装

**macOS / Linux:**
```bash
curl -fsSL https://github.com/0Chencc/clawgod/releases/latest/download/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://github.com/0Chencc/clawgod/releases/latest/download/install.ps1 | iex
```

绿色 Logo = 已 Patch。橙色 Logo = 原版。

![ClawGod 效果展示](bypass.png)

## 功能一览

### 功能解锁

| 补丁 | 效果 |
|------|------|
| **内部用户模式** | 24+ 隐藏命令（`/share`、`/teleport`、`/issue`、`/bughunter`...），调试日志，API 请求记录 |
| **GrowthBook 覆盖** | 通过配置文件覆盖任意 Feature Flag |
| **Agent Teams** | 多智能体协作，无需额外参数 |
| **Computer Use** | 无需 Max/Pro 订阅即可使用屏幕控制（macOS） |
| **Ultraplan** | 通过 Claude Code Remote 进行多智能体规划 |
| **Ultrareview** | 通过 Claude Code Remote 自动化 Bug 查找 |

### 限制移除

| 补丁 | 移除内容 |
|------|---------|
| **CYBER_RISK_INSTRUCTION** | 安全测试拒绝提示（渗透测试、C2 框架、漏洞利用） |
| **URL 限制** | "禁止生成或猜测 URL" 指令 |
| **操作审慎** | 破坏性操作前的强制确认 |
| **登录提示** | 启动时的 "未登录" 提醒 |

### 视觉

| 补丁 | 效果 |
|------|------|
| **绿色主题** | 品牌色 → 绿色，一眼辨别是否已 Patch |
| **消息过滤** | 显示对非 Anthropic 用户隐藏的内容 |

## 使用

```bash
claude              # 已 Patch 的 Claude Code
claude.orig         # 原版未修改版本
```

## 更新

重新运行安装命令，自动获取最新版本并重新应用补丁：

**macOS / Linux:**
```bash
curl -fsSL https://github.com/0Chencc/clawgod/releases/latest/download/install.sh | bash
```

**Windows:**
```powershell
irm https://github.com/0Chencc/clawgod/releases/latest/download/install.ps1 | iex
```

## 卸载

**macOS / Linux:**
```bash
curl -fsSL https://github.com/0Chencc/clawgod/releases/latest/download/install.sh | bash -s -- --uninstall
hash -r  # 刷新 shell 缓存
```

**Windows:**
```powershell
irm https://github.com/0Chencc/clawgod/releases/latest/download/install.ps1 -OutFile install.ps1; .\install.ps1 -Uninstall
```

> 安装或卸载后，如果命令未立即生效，请重启终端或执行 `hash -r`。

## 要求

- Node.js >= 18 + npm
- Claude Code 账号（`claude auth login`）

## 许可证

GPL-3.0 — 与 Anthropic 无关，风险自负。
