import { invoke } from '@tauri-apps/api/core'

/**
 * About window for ArkNote (tray → 关于).
 * Uses logo.png = app mark + product name lockup.
 */
const GITHUB_URL = 'https://github.com/xiaoyangtx996/ArkNote'

export function AboutApp() {
  const openGithub = () => {
    void invoke('open_url_cmd', { url: GITHUB_URL }).catch(() => {
      window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-white px-6 text-center text-slate-800">
      <img
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt="ArkNote"
        className="h-40 w-auto max-w-[280px] object-contain"
        draggable={false}
      />
      <p className="text-sm text-slate-500">桌面便签 · v1.0.0</p>
      <button
        type="button"
        onClick={openGithub}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-slate-50"
      >
        GitHub
      </button>
      <p className="max-w-xs break-all text-xs text-slate-400">{GITHUB_URL}</p>
    </div>
  )
}
