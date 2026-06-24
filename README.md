# 便签

Windows 桌面便签应用。常驻系统托盘，透明桌面悬浮，支持多便签、置顶、Markdown 预览。

基于 **Tauri 2**（Rust 后端 + React 前端）。

## 功能

- 系统托盘运行，不占用任务栏
- 透明背景，只显示便签本体
- 便签可拖拽、缩放、置顶
- 编辑 / 预览（Markdown + GFM 表格/任务列表）双模式
- 便签内容自动保存到本地（重启后恢复）
- 托盘菜单：显示便签、新建便签、快速颜色切换、切换暗色模式、退出
- 快捷键：`Ctrl + N` 新建便签

## 环境要求

- Node.js 18+
- Rust 1.77+（[安装 Rust](https://www.rust-lang.org/tools/install)）
- Windows 10 / 11

## 安装依赖

```bash
npm install
```

## 开发

```bash
npm run tauri:dev
```

## 打包

```bash
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/`：

| 文件 | 说明 |
|------|------|
| `nsis/便签_1.0.0_x64-setup.exe` | 安装包 |
| 同目录下绿色版可执行文件 | 可直接运行 |

## 使用说明

1. 启动后托盘出现便签图标
2. **左键**托盘：显示便签窗口（关闭穿透，可直接操作）
3. **右键**托盘：打开/关闭样式菜单
4. 菜单项「显示便签」：关闭菜单并恢复窗口可交互
5. 「快速颜色切换」：展开子菜单选择商务白 / 护眼绿 / 暗色，或循环切换全部便签主题
6. 每张便签内用 **编辑 / 预览** Tab 单独切换模式（托盘不再全局切换）
7. 关闭便签窗口不会退出应用，仍驻留托盘
8. 关闭所有便签后窗口自动隐藏，可从托盘再次显示或新建

## 项目结构

```
├── src/                 React 前端
├── src-tauri/           Rust 后端（托盘、窗口、快捷键）
│   ├── src/lib.rs       主逻辑
│   ├── tauri.conf.json  Tauri 配置
│   └── icons/           应用图标
├── public/              图标源文件
└── scripts/             图标生成脚本
```

## 技术栈

- Tauri 2 + Rust
- React 18 + TypeScript
- Vite 5
- Tailwind CSS

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run tauri:dev` | 开发模式（热更新 + Tauri） |
| `npm run tauri:build` | 构建安装包 |
| `npm run dev` | 仅启动 Vite（浏览器预览 UI） |
| `npm run icons` | 从 SVG 生成 PNG 图标 |
