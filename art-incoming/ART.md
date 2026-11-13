# Otzar art set (UI overhaul, Nov 13 2026)

Generated with ChatGPT's image model (chatgpt.com, one fresh chat, one image per message, no reference images).
Editorial still life in carved jade and brushed gold on warm ivory: a vault that guards Bitcoin with a second,
lattice-patterned (post-quantum) lock, a yield coin stream and a strike-price dial. It keeps the approved Otzar
jade/gold/blush palette. No face, no toy look, no ₿ symbol, no text.

## Palette (unchanged, from `docs/ART.md` and `packages/web/src/styles.css`)
| Role | Hex |
|---|---|
| Ivory (page, hero backdrop) | `#f7f3ea` |
| Ink | `#14120f` |
| Jade (objects, accent) | `#0fa36b` |
| Deep jade (depths, dark sections) | `#0b5d43` |
| Gold (trim, coins, CTA highlight) | `#f2b33d` |
| Blush (bounce light only) | `#ff9fb8` |

## Style line (appended to every prompt)
> Editorial still-life photograph in a luxury jewellery-catalogue style: objects carved from polished deep-green jade
> #0fa36b with darker #0b5d43 depths and natural soft stone veining, inlaid with brushed gold #f2b33d, set on warm
> ivory #f7f3ea; soft natural window daylight from the left, gentle soft shadows, shallow depth of field, a faint warm
> blush-pink #ff9fb8 bounce light, real materials and photographic detail, calm and expensive; not a 3D cartoon, not
> toy-like, no glossy plastic, no chrome, no neon, no face, no people, no hands; no text, no letters, no numbers, no
> logos, no currency symbols, no bitcoin B symbol.

## Files
| File | Size | Background | Intended use |
|---|---|---|---|
| `otzar-hero.png` | 1536×1024 | ivory | Landing hero: open jade vault with gold coins, a gold dial lock plus a lattice second lock; vault in the right third, headline on the left |
| `otzar-og.png` | 1536×1024 | ivory | OG / social card: closed vault with lattice padlock and a coin stack, right half; title on the left |
| `otzar-icon.png` | 1024×1024 | transparent outside the tile | App icon / logo-mark candidate: jade tile with a gold lattice vault door (check at 32 px) |
| `otzar-vault-lock.png` | 1024×1024 | transparent | Feature: quantum-safe vault (second, lattice lock on a BTC vault) |
| `otzar-yield-stream.png` | 1024×1024 | transparent | Feature: premium / yield paid each round (coins rising from a jade bowl) |
| `otzar-strike-dial.png` | 1024×1024 | transparent | Feature: strike price (dial with a raised pointer); vault page "How this vault earns" |
| `otzar-key.png` | 1024×1024 | transparent | Feature: post-quantum key (lattice-bow key); owner tools, "is your address exposed?" |
| `otzar-empty.png` | 1024×1024 | transparent | Empty state: no vaults / no rounds / no activity (empty jade dish) |

Transparent objects are trimmed to their bounds and padded to a square with an even margin, then palette-compressed
with pngquant. Hero and OG are the untouched originals; convert them to WebP/JPEG (q 82–88) when wiring them in.

README credit: "Art generated with ChatGPT".
