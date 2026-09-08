<p align="center">
  <img src="./assets/readme/hero.png" width="100%" alt="ArkNote — Windows 桌面便签，托盘常驻，Markdown 编辑并保存到本地文档">
</p>

<p align="center">
  <a href="https://github.com/xiaoyangtx996/ArkNote/releases/tag/v1.0.1"><img src="https://img.shields.io/badge/download-v1.0.1-2563EB?style=flat-square" alt="Download v1.0.1"></a>
  <img src="https://img.shields.io/badge/platform-Windows-1D4ED8?style=flat-square" alt="Windows">
  <img src="https://img.shields.io/badge/stack-Tauri%202%20%2B%20React-0F172A?style=flat-square" alt="Tauri 2 + React">
</p>

**ArkNote** 是托盘常驻的 Windows 桌面便签：每张便签一个原生窗口，支持 Markdown 与粘贴图片，内容自动写入「文档 / ArkNote」。v1.0.1 起，置顶便签可贴边收起为书签，拖选松手即可复制。

<p align="center">
  <img src="./assets/readme/showcase.png" width="100%" alt="ArkNote 1.0.1：便签窗口、贴边书签、选区复制与托盘置顶等亮点">
</p>

## 它能做什么

- **托盘常驻** — 左键显示全部便签；右键新建、主题、设置与关于
- **贴边书签** — 置顶后靠近屏幕边缘，收起为 logo + 标题标签；悬停展开
- **选区复制** — 拖选文字松手后自动写入剪贴板，选区旁浅色提示
- **新建默认置顶** — 托盘「设置」可开关，新建便签直接置顶
- **Markdown + 图片** — Vditor IR；粘贴图片落到 `note-{id}.assets/`（Typora 风格相对路径）
- **自动保存** — 正文进 `note-{id}.md`，几何 / 主题记在 `index.json`

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="托盘、贴边便签窗口与 Documents/ArkNote 本地目录三步协作">
</p>

## 快速开始

### 下载安装（推荐）

从 [Releases · v1.0.1](https://github.com/xiaoyangtx996/ArkNote/releases/tag/v1.0.1) 获取：

| 文件 | 说明 |
| --- | --- |
| `ArkNote_1.0.1_x64-setup.exe` | NSIS 安装包 |
| `ArkNote_1.0.1_x64.zip` | 绿色版，解压后运行 `ArkNote.exe` |

### 开发运行

```bash
npm install
npm run tauri:dev
```

仅预览前端（localStorage，不落盘图片）：

```bash
npm run dev
```

### 本地打包

```bash
npm run tauri:build
```

产物：`src-tauri/target/release/bundle/nsis/ArkNote_1.0.1_x64-setup.exe`

## 怎么用

| 操作 | 说明 |
| --- | --- |
| 托盘左键 | 显示所有便签窗口 |
| 托盘右键 | 显示便签 / 新建 / 主题 / **设置（新建默认置顶）** / 关于 / 退出 |
| `Ctrl+N` | 新建便签 |
| 置顶 + 贴边 | 靠近屏幕边缘 → 收起为书签；悬停或聚焦展开 |
| 拖选文字 | 松手后自动复制，选区末尾提示「已复制」 |
| 编辑区 | Markdown 输入，可直接粘贴图片 |

## 数据目录

```text
Documents/ArkNote/
  index.json          # 窗口状态与索引
  note-{id}.md        # 便签正文（自动保存）
  note-{id}.assets/   # 图片资源（相对路径引用）
```

从列表删除便签时，会同步清理对应 `.md` 与资源目录。

## 技术栈

- **壳**：Tauri 2（托盘、多窗口、本地文件）
- **界面**：React + Vite + Tailwind
- **编辑器**：Vditor IR

| 模式 | 命令 | 数据 |
| --- | --- | --- |
| 桌面 | `npm run tauri:dev` / 安装包 | `Documents/ArkNote` |
| 浏览器预览 | `npm run dev` | localStorage |

## 链接

- 仓库：https://github.com/xiaoyangtx996/ArkNote
- 最新版：https://github.com/xiaoyangtx996/ArkNote/releases/latest
- 友情链接：[Linux.do](https://linux.do)
