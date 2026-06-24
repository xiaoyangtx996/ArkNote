import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svg = path.join(root, 'public', 'tray-icon.svg')
const trayIcon = path.join(root, 'src-tauri', 'icons', 'tray-icon.png')

await sharp(svg).resize(32, 32).png().toFile(trayIcon)
console.log('Generated src-tauri/icons/tray-icon.png')
