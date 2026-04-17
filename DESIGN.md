# Design Overview — "obs" dashboard

A reference for styling the next app to match this one. Warm-light theme, sand + charcoal base with burnt-orange accents. Inspired by hirecody.dev.

## Layout

- **Shell**: persistent left sidebar + main content area. Flex row on `md+`, stacks to column on mobile (sidebar becomes a sticky top bar with hamburger drawer).
- **Sidebar width**: `232px`, sticky full-height (`h-screen`), right border in `--border`.
- **Content max-width**: `1240px`, centered (`mx-auto`).
- **Content padding**: `px-4 py-4` mobile, `md:px-8 md:py-8` desktop.
- **Mobile drawer**: 260px wide, max 80vw, dark overlay (`bg-black/60`), locks body scroll when open.

## Typography

- **Sans (body/UI)**: Inter / system stack — `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Arial, sans-serif`.
- **Serif (display/headings/hero metrics)**: Lora (weights 500/600/700), loaded from Google Fonts. Class: `.font-serif`.
- **Numerics**: tabular figures everywhere — `font-feature-settings: "tnum"`. Use `.tnum` utility for metric numbers.
- **Antialiasing**: `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`.
- **Label/eyebrow text**: 10–12px, uppercase, letter-spacing `0.08–0.15em`, weight 500–600.

## Color tokens (CSS variables)

Defined on `:root` in `globals.css`. Always reference via `var(--token)` — don't hardcode hex.

### Surfaces
| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#FAF7F2` | page background (warm off-white) |
| `--bg-elev` | `#F1E9DD` | cards (soft sand) |
| `--bg-elev-2` | `#EDE5D8` | nested / hover surface |
| `--bg-hover` | `#E4D8C5` | active hover fill |
| `--border` | `#E5DDD0` | standard border |
| `--border-soft` | `#ECE4D6` | subtle divider |

### Text
| Token | Hex | Use |
| --- | --- | --- |
| `--fg` | `#2B2B2B` | primary text (charcoal) |
| `--fg-muted` | `#6B6B6B` | secondary text |
| `--fg-dim` | `#8A8A84` | tertiary / footer |
| `--fg-label` | `#6B6B6B` | eyebrow labels |

### Accents
| Token | Hex | Use |
| --- | --- | --- |
| `--primary` / `--accent` | `#C56A2D` | burnt orange — primary brand accent |
| `--primary-fg` | `#FAF7F2` | text on primary fills |
| `--accent-anthropic` | `#C56A2D` | terracotta |
| `--accent-openai` | `#4F7A58` | muted olive-teal |
| `--accent-other` | `#7A6BB0` | dusty violet |
| `--danger` | `#B04A3B` | |
| `--warn` | `#C56A2D` | |
| `--ok` | `#4F7A58` | |

Hover variant of primary used inline: `#A85A24`.

## Components / primitives

### Cards
- `.card` — `bg-elev` background, `1px` border, `0.75rem` radius.
- `.card-header` — `1rem 1.25rem` padding, bottom border in `--border-soft`, uppercase `0.72rem` label, `0.08em` tracking.
- `.card-hover` — transitions background + inset shadow on hover; background shifts to `--bg-hover`, adds `inset 0 2px 6px rgba(0,0,0,0.08)`.

### Zones
Grouping container for related cards. `.zone`:
- `1rem` radius, `--border`, translucent sand fill (`rgba(241,233,221,0.35)`)
- radial-dot texture: `radial-gradient(circle, rgba(43,43,43,0.08) 1px, transparent 1px)` at `18px 18px`
- padding `2.5rem 1.25rem 1.25rem` (mobile) → `3rem 2rem 2rem` (md+)
- `.zone-label` — pill label top-left, 10px uppercase, `0.15em` tracking, on warm off-white fill

### Section eyebrow
`.section-eyebrow` — small uppercase orange label with a 2rem `1px` leading rule. Pattern: `— SECTION NAME`.

### Sidebar nav item
- `rounded-md px-3 py-2 text-sm`
- Active: `bg-[var(--bg-elev-2)] text-[var(--fg)]`
- Inactive: `text-[var(--fg-muted)]`, hover → `bg-[var(--bg-elev-2)] text-[var(--fg)]`
- Icon: `lucide-react`, size 16, paired with label text

### Brand mark
Lucide `Server` icon, size 20, color `#C56A2D`, `strokeWidth={2.25}`, followed by app name in `text-sm font-semibold`.

### "Back to portfolio" pill
Filled burnt-orange button at top of sidebar nav: `bg-[#C56A2D] text-white font-bold`, hover `#A85A24`, `ArrowLeft` icon + label.

## Motion

- **Fade-in** (new rows, live data): `obs-fade-in` keyframe — 220ms ease-out, opacity + `translateY(-2px → 0)`. Utility: `.fade-in`.
- **Card hover**: `background-color 200ms ease, box-shadow 200ms ease`.
- **Nav item hover**: `transition-colors`.

## Scrollbars

Custom warm-theme styling:
- width/height `10px`
- thumb `--border`, radius `8px`
- hover thumb `#D4C9B3`

## Native form elements

- `select` — `background: var(--bg-elev); color: var(--fg)` so it doesn't look like raw OS chrome.

## Icon library

`lucide-react` throughout. Common sizes: 16 (nav/inline), 18 (mobile brand), 20 (desktop brand).

## Page-level conventions

- `export const dynamic = "force-dynamic"` at root layout so server data (auth, banners) reflects each request.
- Preconnect + stylesheet load for Google Fonts in `<head>`.
- `html` gets `h-full antialiased`, `body` gets `min-h-full`.

## Quick-start checklist for the next app

1. Copy `globals.css` variable block + component classes (`.card`, `.zone`, `.section-eyebrow`, `.font-serif`, `.tnum`, `.fade-in`).
2. Load Lora from Google Fonts in root layout `<head>`.
3. Root layout = `flex md:flex-row` shell: Sidebar (232px) + `<main>` with `mx-auto max-w-[1240px] px-4 py-4 md:px-8 md:py-8`.
4. Use `lucide-react` for all icons; primary accent `#C56A2D`.
5. Numbers use `.tnum` or `.font-serif` (serif for hero metrics).
6. Reach for `.zone` when grouping related cards, `.section-eyebrow` for section headers.
