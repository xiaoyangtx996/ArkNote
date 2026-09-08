# -*- coding: utf-8 -*-
"""Regenerate ArkNote README section visuals for v1.0.1 (hero PNG kept as-is)."""
from pathlib import Path

root = Path(r"D:\workspace\XYTX\ArkNote\assets\readme")
root.mkdir(parents=True, exist_ok=True)

workflow = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1200 280" role="img" aria-labelledby="title desc">
  <title id="title">ArkNote 工作方式</title>
  <desc id="desc">托盘入口、贴边便签窗口与本地 Documents/ArkNote 目录协作。</desc>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8FAFC"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="280" rx="24" fill="#F1F5F9"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif">
    <text x="48" y="48" fill="#64748B" font-size="18" font-weight="600" letter-spacing="1">HOW IT WORKS · v1.0.1</text>

    <g transform="translate(48 72)">
      <rect width="320" height="160" rx="20" fill="url(#panel)" stroke="#E2E8F0"/>
      <circle cx="44" cy="44" r="18" fill="#DBEAFE"/>
      <text x="38" y="51" fill="#1D4ED8" font-size="20" font-weight="700">1</text>
      <text x="78" y="52" fill="#0F172A" font-size="24" font-weight="700">托盘</text>
      <text x="28" y="96" fill="#475569" font-size="18">左键显示 · 右键设置</text>
      <text x="28" y="126" fill="#475569" font-size="18">可选：新建默认置顶</text>
    </g>

    <path d="M388 152 L428 152" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
    <path d="M416 140 L432 152 L416 164" fill="none" stroke="#60A5FA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

    <g transform="translate(440 72)">
      <rect width="320" height="160" rx="20" fill="url(#panel)" stroke="#E2E8F0"/>
      <circle cx="44" cy="44" r="18" fill="#DBEAFE"/>
      <text x="38" y="51" fill="#1D4ED8" font-size="20" font-weight="700">2</text>
      <text x="78" y="52" fill="#0F172A" font-size="24" font-weight="700">便签窗口</text>
      <text x="28" y="96" fill="#475569" font-size="18">置顶贴边 → 书签收起</text>
      <text x="28" y="126" fill="#475569" font-size="18">拖选松手自动复制</text>
    </g>

    <path d="M780 152 L820 152" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
    <path d="M808 140 L824 152 L808 164" fill="none" stroke="#60A5FA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

    <g transform="translate(832 72)">
      <rect width="320" height="160" rx="20" fill="url(#panel)" stroke="#E2E8F0"/>
      <circle cx="44" cy="44" r="18" fill="#DBEAFE"/>
      <text x="38" y="51" fill="#1D4ED8" font-size="20" font-weight="700">3</text>
      <text x="78" y="52" fill="#0F172A" font-size="24" font-weight="700">本地目录</text>
      <text x="28" y="96" fill="#475569" font-size="18">Documents/ArkNote</text>
      <text x="28" y="126" fill="#475569" font-size="18">.md + .assets 清晰可管</text>
    </g>
  </g>
</svg>
"""

showcase = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1200 640" role="img" aria-labelledby="title desc">
  <title id="title">ArkNote 1.0.1 界面亮点</title>
  <desc id="desc">便签窗口、贴边书签、选区复制与托盘置顶等特性示意。</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EFF6FF"/>
      <stop offset="100%" stop-color="#F1F5F9"/>
    </linearGradient>
    <linearGradient id="mark" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <filter id="cardShadow" x="-8%" y="-8%" width="116%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1200" height="640" rx="28" fill="url(#bg)"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif">
    <text x="48" y="52" fill="#64748B" font-size="20" font-weight="600" letter-spacing="1">v1.0.1 · 界面亮点</text>

    <!-- Left feature chips -->
    <g transform="translate(48 120)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">贴边书签</text>
    </g>
    <g transform="translate(48 184)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">选区复制</text>
    </g>
    <g transform="translate(48 248)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">新建置顶</text>
    </g>
    <g transform="translate(48 312)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">Markdown</text>
    </g>

    <!-- Right feature chips -->
    <g transform="translate(984 120)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">托盘常驻</text>
    </g>
    <g transform="translate(984 184)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">粘贴图片</text>
    </g>
    <g transform="translate(984 248)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">自动保存</text>
    </g>
    <g transform="translate(984 312)">
      <rect width="168" height="44" rx="22" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"/>
      <text x="84" y="29" text-anchor="middle" fill="#1D4ED8" font-size="20" font-weight="600">本地文档</text>
    </g>

    <!-- Main note window -->
    <g transform="translate(280 96)" filter="url(#cardShadow)">
      <rect width="520" height="420" rx="16" fill="#FFFFFF" stroke="#E2E8F0"/>
      <!-- header -->
      <rect width="520" height="48" rx="16" fill="#FFFFFF"/>
      <rect y="32" width="520" height="16" fill="#FFFFFF"/>
      <line x1="0" y1="48" x2="520" y2="48" stroke="#E2E8F0"/>
      <!-- pin (active) -->
      <g transform="translate(18 14)">
        <circle cx="10" cy="8" r="5" fill="#2563EB"/>
        <path d="M10 13 L10 22" stroke="#1E40AF" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <text x="44" y="31" fill="#0F172A" font-size="18" font-weight="600">便签 #2</text>
      <text x="430" y="31" fill="#94A3B8" font-size="22">＋</text>
      <text x="462" y="31" fill="#94A3B8" font-size="18">☰</text>
      <text x="492" y="31" fill="#94A3B8" font-size="20">×</text>

      <!-- body lines -->
      <text x="24" y="92" fill="#0F172A" font-size="20" font-weight="600">今日待办</text>
      <text x="24" y="130" fill="#334155" font-size="18">- 提交周报</text>
      <text x="24" y="162" fill="#334155" font-size="18">- 复核数据</text>
      <text x="24" y="194" fill="#64748B" font-size="18">待审核 · 审批</text>
      <!-- selection hint -->
      <rect x="24" y="214" width="120" height="28" rx="6" fill="#DBEAFE"/>
      <text x="36" y="234" fill="#1D4ED8" font-size="16">已复制</text>
      <text x="156" y="234" fill="#94A3B8" font-size="16">← 拖选松手</text>

      <!-- thin scrollbar flush right -->
      <rect x="508" y="70" width="5" height="120" rx="2.5" fill="#CBD5E1"/>

      <!-- footer -->
      <line x1="0" y1="372" x2="520" y2="372" stroke="#E2E8F0"/>
      <text x="24" y="402" fill="#94A3B8" font-size="16">48 字</text>
      <text x="360" y="402" fill="#94A3B8" font-size="16">上次保存: 12:40:18</text>
    </g>

    <!-- Edge bookmark (right edge of note area) -->
    <g transform="translate(820 250)" filter="url(#cardShadow)">
      <rect width="120" height="40" rx="8" fill="#FFFFFF" fill-opacity="0.95" stroke="#E2E8F0"/>
      <rect x="0" y="0" width="4" height="40" fill="#93C5FD"/>
      <rect x="12" y="8" width="24" height="24" rx="6" fill="url(#mark)"/>
      <rect x="17" y="13" width="10" height="12" rx="2" fill="#F8FAFC"/>
      <circle cx="20" cy="12" r="2.5" fill="#DBEAFE"/>
      <text x="44" y="26" fill="#334155" font-size="14" font-weight="600">便签 #2</text>
    </g>
    <text x="820" y="312" fill="#64748B" font-size="16">贴边收起 · 悬停展开</text>

    <text x="600" y="600" text-anchor="middle" fill="#94A3B8" font-size="16">示意合成 · 真实交互以安装包为准</text>
  </g>
</svg>
"""

(root / "workflow.svg").write_text(workflow, encoding="utf-8")
(root / "showcase.svg").write_text(showcase, encoding="utf-8")
print("wrote workflow.svg + showcase.svg")
