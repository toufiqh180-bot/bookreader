// `npm run dev`: starts Vite's dev server (hot reload) and opens the desktop
// app pointed at it. For the browser version alone, use `npm run dev:web`.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
server.printUrls();

const electron = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
