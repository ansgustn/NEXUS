import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');

// Windows에서 프로젝트 경로에 한글이 있으면(예: "NEXUS - 복사본") Node 24의 fs.rmSync(recursive)가
// 오류 메시지 없이 프로세스를 종료시킨다. Vite는 빌드 전에 이 함수로 dist를 비우므로,
// dist가 이미 있으면 `npm run build`가 조용히 실패하고 예전 빌드가 그대로 남는다.
// 그래서 Vite의 비우기 기능을 끄고, 파일을 하나씩 지우는 방식으로 직접 비운다.
function emptyDirSafely(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      emptyDirSafely(target);
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
  }
}

const safeEmptyOutDir = {
  name: 'nexus-safe-empty-outdir',
  apply: 'build',
  buildStart() {
    emptyDirSafely(outDir);
  }
};

export default defineConfig({
  plugins: [react(), safeEmptyOutDir],
  build: {
    emptyOutDir: false
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/public/videos/**', '**/public/audio/**', '**/public/images/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        timeout: 180000,
        proxyTimeout: 180000
      },
      '/videos': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/audio': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/images': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
