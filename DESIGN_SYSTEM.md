# Poker Client Design System

## Intent

The poker client is a monochrome command surface with gold reserved for value,
attention, and confirmed success. Components consume semantic design tokens
only. Do not introduce component-local color names or raw hex values.

## Foundations

### Color Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#080808` | App background |
| `--color-surface` | `#111111` | Panels and cards |
| `--color-surface-raised` | `#1a1a1a` | Hovered or layered panels |
| `--color-border` | `#303030` | Default boundaries |
| `--color-border-strong` | `#525252` | Focus and active boundaries |
| `--color-text` | `#f5f5f4` | Primary content |
| `--color-text-muted` | `#a3a3a3` | Supporting content |
| `--color-text-subtle` | `#737373` | Disabled and metadata |
| `--color-accent` | `#d4af37` | Gold: pot, action, confirmed win |
| `--color-accent-strong` | `#f5cf54` | Hover or focused gold |
| `--color-danger` | `#e05a47` | Fold, loss, destructive action |
| `--color-success` | `#78b35a` | Check and connection success |
| `--color-info` | `#89a8c8` | Neutral status information |

Gold is never used for body copy. Green and red are status colors only and
must always be paired with text or an icon.

### Typography

`--font-display`: `"Space Grotesk", "IBM Plex Sans", sans-serif` for table
labels and headings. `--font-body`: `"IBM Plex Sans", sans-serif` for UI copy.
`--font-mono`: `"IBM Plex Mono", monospace` for chips, blinds, IDs, and time.

| Level | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| Display | `32px / 1.1` | 700 | Result overlays |
| H1 | `24px / 1.2` | 700 | Page title |
| H2 | `18px / 1.3` | 650 | Panel title |
| Body | `14px / 1.5` | 400 | Default UI copy |
| Label | `12px / 1.3` | 600 | Controls and metadata |
| Micro | `11px / 1.3` | 600 | Table status |

### Spacing, Radius, and Shadow

Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64px`.

Radius tokens: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`,
`--radius-pill: 999px`. Use `md` for controls and `lg` for panels.

Shadow tokens: `--shadow-panel: 0 16px 40px rgba(0,0,0,.35)`,
`--shadow-float: 0 24px 64px rgba(0,0,0,.5)`, and
`--shadow-focus: 0 0 0 3px rgba(212,175,55,.28)`. Shadows establish elevation;
they must not encode component state.

## Layout and Responsive Rules

| Breakpoint | Layout policy |
| --- | --- |
| Desktop `>= 993px` | Full oval table, fixed action panel, persistent action log. |
| Tablet `768-992px` | Reduce table padding; action panel moves below table; seats retain an oval. |
| Phone `481-767px` | Table uses a scrollable, snap-aligned seat rail if the oval would overlap. Community cards and player action remain visible. |
| Narrow `<= 480px` | One column. Seat rail becomes horizontal cards; action controls are full width and sticky above the safe area. |

Never hide the current player, their chips, call amount, or action controls.
Use `env(safe-area-inset-bottom)` for bottom-fixed controls.

## Interaction and Motion

All transitions use only `transform` and `opacity`, use
`cubic-bezier(.22, 1, .36, 1)`, and set `will-change` only during active
animation. Durations: `120ms` feedback, `220ms` control state, `360ms` card,
and `600ms` celebration. Respect `prefers-reduced-motion` by disabling
non-essential animation.

- Deal: translate and rotate into place, then settle opacity.
- Street reveal: cards enter with a short stagger and opacity only.
- Bet: chip stack scales from `.88` to `1` while fading in.
- Winner: one celebration overlay at `SHOWDOWN`; never stack overlays.

## Component Contract

Buttons use `.ui-button` plus a semantic variant: `primary`, `neutral`, or
`danger`. Panels use `.ui-panel`. Inputs use `.ui-range` or `.ui-input`.
Components may not define new palette classes, raw colors, or bespoke spacing
values. New tokens must be added to `client/src/style.css` and this document.

## Sound Contract

One Howler-backed singleton owns eight events: `deal`, `check`, `fold`,
`call`, `raise`, `win`, `lose`, `street`, plus one low-volume looping ambient
bed. Everything starts muted until an explicit user toggle enables it; the
ambient loop must never autoplay. The preference is stored as
`poker.sound.muted` in `localStorage`. Missing assets fail silently and must
not affect game state.

## Required UI States and Copy

All primary views implement these states using the approved language selected
by the app locale. The current client uses Simplified Chinese, with compact
English game terms only where they are part of a proper game label.

| State | Approved copy |
| --- | --- |
| Loading | `正在加载牌桌…` |
| Empty | `暂无可加入的牌桌` / `牌局尚未开始` |
| Error | `连接出现问题，请重试。追踪号：{id}` |
| Permission | `你没有进入此牌桌的权限` |
| Narrow screen | `已切换为紧凑牌桌视图` |

Replace standalone `PLAYER`, `LOBBY`, and `WAITING` with `玩家`, `大厅`, and
`等待中`. Do not mix languages inside one control.
