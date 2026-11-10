import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '../..');

let cached = null;

// ES imports run before index.js loads .env, so pick up the COMFYUI_* overrides here directly.
function loadComfyEnvOverrides() {
  const envFile = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  try {
    for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*(COMFYUI_(?:DIR|INPUT_DIR|OUTPUT_DIR))\s*=\s*(.*?)\s*$/);
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

/**
 * Locate the ComfyUI portable install on this machine (same search order as run_comfyui.ps1).
 * Override with COMFYUI_DIR in .env when ComfyUI lives somewhere else.
 */
function resolve() {
  if (cached) return cached;
  loadComfyEnvOverrides();
  const home = os.homedir();
  const candidates = [
    process.env.COMFYUI_DIR,
    path.join(PROJECT_ROOT, 'ComfyUI_windows_portable'),
    path.join(home, 'Desktop', 'ComfyUI_windows_portable'),
    path.join(PROJECT_ROOT, '..', 'ComfyUI_windows_portable'),
    'C:\\ComfyUI_windows_portable',
    path.join(PROJECT_ROOT, 'ComfyUI'),
    path.join(home, 'ComfyUI')
  ].filter(Boolean);

  let root = null;
  let app = null;
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'ComfyUI', 'main.py'))) { root = dir; app = path.join(dir, 'ComfyUI'); break; }
    if (fs.existsSync(path.join(dir, 'main.py'))) { root = dir; app = dir; break; }
  }
  if (!root) {
    // Not installed locally: point at the project-local location (callers check existence)
    root = path.join(PROJECT_ROOT, 'ComfyUI_windows_portable');
    app = path.join(root, 'ComfyUI');
  }

  cached = {
    root,
    inputDir: process.env.COMFYUI_INPUT_DIR || path.join(app, 'input'),
    outputDir: process.env.COMFYUI_OUTPUT_DIR || path.join(app, 'output'),
    embeddedPython: path.join(root, 'python_embeded', 'python.exe')
  };
  return cached;
}

export const getComfyRoot = () => resolve().root;
export const getComfyInputDir = () => resolve().inputDir;
export const getComfyOutputDir = () => resolve().outputDir;
export const getComfyEmbeddedPython = () => resolve().embeddedPython;
