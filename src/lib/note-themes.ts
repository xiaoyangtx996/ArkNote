export const NOTE_THEMES = [
  { id: 'business', label: '商务白' },
  { id: 'eyecare', label: '护眼绿' },
  { id: 'dark', label: '暗色' },
] as const

export type NoteThemeId = (typeof NOTE_THEMES)[number]['id']
