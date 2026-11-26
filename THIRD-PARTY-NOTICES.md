# Fu Agent 第三方组件声明（THIRD-PARTY NOTICES）

本应用基于 GNU AGPL-3.0 开源发布（完整条款见随附 `LICENSE` 文件），并包含大量第三方开源组件。
各组件的完整许可文本随应用分发于 `resources/app/node_modules/<包名>/LICENSE`（或 `LICENSE.md` / `LICENSE.txt`），
本文件为主要组件的摘要索引。若本摘要与随包许可文本存在出入，以随包许可文本为准。

## 上游项目

| 组件 | 来源 | 许可 |
| --- | --- | --- |
| Proma（上游框架） | https://github.com/ErlichLiu/Proma | AGPL-3.0 |

## 运行时与框架

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| Electron | MIT | 桌面运行时 |
| Chromium（随 Electron 分发） | 各组件许可见 `LICENSES.chromium.html` | 渲染引擎 |
| Node.js（随 Electron 分发） | MIT | 主进程运行时 |
| electron-updater | MIT | 自动更新 |
| Vite / esbuild / TypeScript | MIT / Apache-2.0（esbuild）/ Apache-2.0（TypeScript） | 构建工具链（不随应用分发） |
| Tailwind CSS / tailwindcss-animate / @tailwindcss/typography | MIT | 样式（构建期） |

## UI 与交互

| 组件 | 许可 |
| --- | --- |
| React / React DOM | MIT |
| Radix UI（react-dialog / dropdown-menu / popover / switch / toast / tooltip 等） | MIT |
| TipTap（starter-kit 及各 extension） | MIT |
| lucide-react | ISC |
| cmdk | MIT |
| sonner | MIT |
| emoji-mart（data / react） | MIT |
| class-variance-authority | MIT（零条款 BSD 风格） |
| clsx / tailwind-merge | MIT |

## 数据与文档处理

| 组件 | 许可 |
| --- | --- |
| react-markdown / remark-gfm | MIT |
| lowlight / highlight.js | MIT / BSD-3-Clause |
| pdf-parse | MIT |
| officeparser | MIT |
| word-extractor | 随包 LICENSE 为准 |
| undici | MIT |
| node-cron | ISC |
| minisearch | Apache-2.0 |
| zod | MIT |
| chokidar | MIT |
| use-stick-to-bottom | MIT |

## Agent 与技能

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| @anthropic-ai/claude-agent-sdk | 随包 `LICENSE.md` 为准 | Agent 运行核心 |
| Anthropic 官方内置 Skills（docx / pdf / pptx / xlsx / skill-creator） | 随包 `LICENSE.txt`（MIT） | 随应用 `default-skills/` 分发 |

## 图标与标识

| 组件 | 许可 |
| --- | --- |
| lucide 图标集 | ISC |
| Fu Agent 应用图标 / 托盘图标 | 本项目随 AGPL-3.0 分发 |
