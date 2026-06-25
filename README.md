# 便签

Windows 桌面便签。托盘常驻，每张便签一个原生窗口。

## 功能

- 托盘左键：显示所有便签
- 托盘右键：系统菜单（显示便签 / 新建 / 颜色 / 暗色模式 / 退出）
- 每张便签独立窗口，透明背景，只显示便签本体
- 标题栏拖动、边缘缩放、置顶
- 编辑 / Markdown 预览、自动保存
- `Ctrl+N` 新建便签

## 架构（简单直接）

```
托盘 (Rust 原生菜单)
  ├─ 左键 → 显示所有便签窗口
  ├─ 右键 → 菜单项直接调 Rust
  └─ Ctrl+N → Rust 创建新窗口

便签窗口 note-{id} (React)
  ├─ 按窗口 label 加载对应便签
  ├─ localStorage 读写数据
  └─ 拖动/缩放 → 原生窗口 API

note-1 额外职责：启动时打开其余已保存便签；响应托盘主题切换事件
```

**没有** manager 隐藏窗口、没有 React 托盘菜单、没有 renderer_ready / sync 握手。

## 开发

```bash
npm run tauri:dev    # 桌面版
npm run dev          # 浏览器单页预览（仅开发 UI 用）
```

## 打包

```bash
npm run tauri:build
```

产物：`src-tauri/target/release/bundle/nsis/便签_1.0.0_x64-setup.exe`
