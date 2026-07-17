# Poker client

Vue 3 + TypeScript + Vite + Tailwind CSS client. Game state is derived only by
folding the uppercase WebSocket event stream from `ws://<host>:8080`.

```bash
npm install
npm run dev
```

Set `VITE_POKER_WS_URL` only when the WebSocket endpoint is not on port 8080 of
the current browser host. `npm run build` performs a Vue type-check before the
production Vite build.

The client now exposes `/` as the lobby and `/table/:id` as the table route. Set
`VITE_API_BASE_URL` when `/api/v1/user/me` is hosted on another origin, and set
`VITE_LOBBY_TABLES_URL` when the table catalogue endpoint is not
`/api/v1/tables`. If the table catalogue endpoint is unavailable, the lobby
keeps the `default` WebSocket table available as a development fallback.

The production build includes a PWA manifest and service worker. Static JS,
CSS, HTML, SVG, and `woff2` assets are precached; the UI takes over with a
`DISCONNECTED - RETRYING...` screen when the browser reports no network.
