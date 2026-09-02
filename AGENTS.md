# Base44 Dev Environment

## Stack
- React 18 + Vite frontend using `@base44/sdk` and `@base44/vite-plugin`.
- No local backend — the app talks to a **hosted Base44 backend** via the vite-plugin's `/api` proxy.
- Source lives in `src/`; entity/function definitions live in `base44/`.

## Running
```
docker compose -f docker-compose.base44.yml up -d
```
- Service `web` (node:22) bind-mounts the repo at `/app`, runs `npm install && npm run dev`, and maps host port **3000** -> container 5173.
- Vite dev server has live reload; edits appear without rebuilding the image.
- `node_modules` is a named volume so installs persist across restarts.

## Required environment (secrets)
Both are needed for the app to reach its backend. Delivered via `/run/base44/app.env` (platform-managed, outside the repo); placeholders in `.env.base44-defaults` let the dev server boot without them.
- `VITE_BASE44_APP_ID` — the Base44 app ID.
- `VITE_BASE44_APP_BASE_URL` — the Base44 app backend URL (the proxy target for `/api`).

Without `VITE_BASE44_APP_BASE_URL` the `/api` proxy points at a placeholder and all backend calls fail; the UI shell still renders.

## Vite config notes
- `vite.config.js` sets `server.host: true` and `server.allowedHosts: true` so the preview's external hostname is accepted.
- The `@base44/vite-plugin` enables the `/api -> VITE_BASE44_APP_BASE_URL` proxy and injects HMR/navigation/error helpers.

## Verify
```
curl -sf -H "Host: external-preview.example.com" http://localhost:3000/   # -> 200, serves index.html
docker compose -f docker-compose.base44.yml logs --tail=20 web            # look for "[base44] Proxy enabled: /api -> <real url>"
```
