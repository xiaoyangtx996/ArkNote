# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(r"D:\workspace\XYTX\ArkNote\assets\readme")
root.mkdir(parents=True, exist_ok=True)

hero = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1200 360" role="img" aria-labelledby="title desc">
  <title id="title">ArkNote</title>
  <desc id="desc">Windows desktop sticky notes: tray, Markdown, local Documents storage.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EFF6FF"/>
      <stop offset="55%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#EEF2FF"/>
    </linearGradient>
    <linearGradient id="mark" x1="0.15" y1="0.1" x2="0.9" y2="0.95">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1E3A8A" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="1200" height="360" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="312" rx="22" fill="none" stroke="#BFDBFE" stroke-width="1.5"/>
  <g transform="translate(72 78)" filter="url(#soft)">
    <rect x="0" y="18" width="148" height="148" rx="34" fill="url(#mark)"/>
    <rect x="34" y="46" width="80" height="92" rx="10" fill="#F8FAFC"/>
    <path d="M98 120 L114 104 L114 128 Z" fill="#DBEAFE"/>
    <rect x="50" y="72" width="48" height="8" rx="4" fill="#93C5FD"/>
    <rect x="50" y="90" width="36" height="8" rx="4" fill="#93C5FD"/>
    <circle cx="48" cy="40" r="14" fill="#2563EB"/>
    <circle cx="48" cy="40" r="6" fill="#DBEAFE"/>
    <path d="M48 52 L42 78" stroke="#1E40AF" stroke-width="4" stroke-linecap="round"/>
  </g>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
    <text x="280" y="108" fill="#2563EB" font-size="22" font-weight="600" letter-spacing="2">WINDOWS · 桌面便签</text>
    <text x="280" y="178" fill="#0F172A" font-size="64" font-weight="700">ArkNote</text>
    <text x="280" y="228" fill="#334155" font-size="26">托盘常驻的 Markdown 便签，图片可直接粘贴，</text>
    <text x="280" y="264" fill="#334155" font-size="26">自动保存到「文档 / ArkNote」。</text>
    <text x="280" y="312" fill="#64748B" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">v1.0.0 · Tauri 2 · React · Vditor</text>
  </g>
</svg>
"""

workflow = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1200 280" role="img" aria-labelledby="title desc">
  <title id="title">ArkNote workflow</title>
  <desc id="desc">Tray, note window, and Documents/ArkNote local folder.</desc>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8FAFC"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="280" rx="24" fill="#F1F5F9"/>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
    <text x="48" y="48" fill="#64748B" font-size="18" font-weight="600" letter-spacing="1">HOW IT WORKS</text>
    <g transform="translate(48 72)">
      <rect width="320" height="160" rx="20" fill="url(#panel)" stroke="#E2E8F0"/>
      <circle cx="44" cy="44" r="18" fill="#DBEAFE"/>
      <text x="38" y="51" fill="#1D4ED8" font-size="20" font-weight="700">1</text>
      <text x="78" y="52" fill="#0F172A" font-size="24" font-weight="700">托盘</text>
      <text x="28" y="96" fill="#475569" font-size="18">左键显示全部便签</text>
      <text x="28" y="126" fill="#475569" font-size="18">右键新建 / 主题 / 关于</text>
    </g>
    <path d="M388 152 L428 152" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
    <path d="M416 140 L432 152 L416 164" fill="none" stroke="#60A5FA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(440 72)">
      <rect width="320" height="160" rx="20" fill="url(#panel)" stroke="#E2E8F0"/>
      <circle cx="44" cy="44" r="18" fill="#DBEAFE"/>
      <text x="38" y="51" fill="#1D4ED8" font-size="20" font-weight="700">2</text>
      <text x="78" y="52" fill="#0F172A" font-size="24" font-weight="700">便签窗口</text>
      <text x="28" y="96" fill="#475569" font-size="18">Markdown · 粘贴图片</text>
      <text x="28" y="126" fill="#475569" font-size="18">置顶 · 字数 · 自动保存</text>
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

(root / "hero.svg").write_text(hero, encoding="utf-8")
(root / "workflow.svg").write_text(workflow, encoding="utf-8")
print("ok", (root / "hero.svg").stat().st_size, (root / "workflow.svg").stat().st_size)
