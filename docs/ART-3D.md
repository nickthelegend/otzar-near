# Otzar 3D object kit

Single polished objects, one per card, that add to the approved jade, gold and blush UI. The approved art stays as it
was: the jade-vault-with-gold-coins hero, the logo and the carved-jade art in `docs/ART.md`. Otzar is a finance
product, so the objects have no face.

- **Material:** polished jade enamel: a smooth, glossy jade-green body like polished nephrite with faint stone veining,
  inlaid with brushed-gold enamel trim. Rounded bevels, no carved cloud ornaments (the approved stickers have those),
  no chrome, no silver, no candy lacquer.
- **Palette (from `packages/web/src/styles.css`):** main jade `#0fa36b` with deep jade `#0b5d43` depths, accent gold
  `#f2b33d` (the trim, dials, checks and coins), rim light blush `#ff9fb8`. The warning object is gold with a jade
  mark, not red; red `#c9483a` stays a UI-only colour.
- **Face:** none.
- **Background:** transparent, with no ground shadow. Each object is cropped to its bounds on a square canvas and saved
  as a 640 px webp in `packages/web/public/art/3d/`.
- **Subjects:** closed vault, gold coin with a jade rim (BTC, with no ₿ mark), hourglass (when a round ends), strike
  level (rising jade columns under a gold price line; it replaced a thin ruler that didn't read at 48 px), lattice-bow key (the post-quantum key), shield with a padlock (safety locks), vault NFT card,
  premium coin stack, empty open vault (empty states), success seal, warning sign, and a jade tile with a gold dial (a
  logo-mark candidate; the approved logo stays).

The same style line went into every prompt:

> Polished jade enamel 3D render: smooth, glossy deep jade-green #0fa36b body like polished nephrite with faint soft
> stone veining and darker #0b5d43 depths, inlaid with brushed-gold #f2b33d enamel trim and details, and a soft
> blush-pink #ff9fb8 rim light, soft studio lighting, crisp reflections, rounded bevelled edges, gentle toy-like
> proportions, premium finance object, no face, no eyes, no carved cloud ornaments, centred, transparent background
> (no background, no ground shadow), square 1024x1024, no text, no letters, no numbers, no logos, no currency symbols.

## Where each object is used

| Object | Where |
|---|---|
| `vault` | How it works, step 1 (you put Bitcoin in a vault) |
| `strike` | How it works, step 2 (a higher price); vault page, *How this vault earns* fold |
| `coin-stack` | How it works, step 3 (you keep the premium) |
| `hourglass` | How it works, *A real round on testnet*; vault page, *Latest round* header |
| `shield` | How it works, *What keeps it safe*; vault page, *Safety locks* fold |
| `key` | How it works, *Is your address already exposed?*; vault page, *Owner tools* fold; every `setup` state |
| `nft-card` | Portfolio connect screen (floats 5 px, still under reduced motion) |
| `empty-vault` | Every `empty` state: vault list (Earning / All / Yours), no rounds yet, no activity, unknown vault ID |
| `warning` | Every `error` state (for example RPC down on the vault list); error toast on the vault page; error lines in the mint and round sheets |
| `seal` | Confirmed-transaction toast on the vault page; *Minted* line in the mint sheet; *Premium sent* line in the round sheet |
| `btc-coin`, `mark` | In the kit, not placed: the approved logo and the BTC chip stay as they are |

The landing page keeps the approved hero art and has no 3D objects.

Files: `otzar-3d-{vault,btc-coin,hourglass,strike,key,shield,nft-card,coin-stack,empty-vault,seal,warning,mark}.webp`.
3D art generated with ChatGPT.
