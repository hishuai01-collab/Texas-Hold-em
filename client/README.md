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
