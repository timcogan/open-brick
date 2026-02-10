# Open Brick

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./src/logo.svg" />
    <source media="(prefers-color-scheme: light)" srcset="./src/logo-light.svg" />
    <img src="./src/logo-light.svg" alt="Open Brick logo" width="120" />
  </picture>
</p>

[![Live App](https://img.shields.io/badge/Live%20App-openbrick.cogan.dev-0b7285)](https://openbrick.cogan.dev)
[![CI and Pages](https://github.com/timcogan/open-brick/actions/workflows/ci-pages.yml/badge.svg)](https://github.com/timcogan/open-brick/actions/workflows/ci-pages.yml)
[![GitHub Stars](https://img.shields.io/github/stars/timcogan/open-brick?style=social)](https://github.com/timcogan/open-brick/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/timcogan/open-brick)](https://github.com/timcogan/open-brick/commits/master)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

```text
  ___  ____  _____ _   _   ____  ____  ___ ____ _  __
 / _ \|  _ \| ____| \ | | | __ )|  _ \|_ _/ ___| |/ /
| | | | |_) |  _| |  \| | |  _ \| |_) || | |   | ' / 
| |_| |  __/| |___| |\  | | |_) |  _ < | | |___| . \ 
 \___/|_|   |_____|_| \_| |____/|_| \_\___\____|_|\_\
```

## Live App
[https://openbrick.cogan.dev](https://openbrick.cogan.dev)

Open Brick is a browser-based tool for creating classic interlocking bricks and exporting them as STL files for 3D printing.

LLM-friendly docs:
- [`llms.txt`](./llms.txt) (short rules)
- [`llms-full.txt`](./llms-full.txt) (expanded context)
- [`.well-known/llms.txt`](./.well-known/llms.txt) (well-known mirror)

Brick type roadmap:

[`BRICK_TYPES_TODO.md`](./BRICK_TYPES_TODO.md)

## Shareable URLs (Query Params)
Share a specific brick configuration with:

`https://openbrick.cogan.dev/?template=classic_brick&width=X&length=Y&height=Z&scale=SCALE`

`https://openbrick.cogan.dev/?template=classic_plate&width=X&length=Y&scale=SCALE`

`https://openbrick.cogan.dev/?template=classic_tile&width=X&length=Y&scale=SCALE`

Where:
- `template`: `classic_brick`, `classic_plate`, or `classic_tile`
- `width`: studs in X (`classic_brick`: 1-10, `classic_plate`/`classic_tile`: 1-16)
- `length`: studs in Y (`classic_brick`: 1-12, `classic_plate`/`classic_tile`: 1-16)
- `height`: plate units in Z (only for `classic_brick`, 1-9)
- `scale`: global scale percent (95-105)

Example:

`https://openbrick.cogan.dev/?template=classic_brick&width=4&length=2&height=3&scale=101`

`https://openbrick.cogan.dev/?template=classic_plate&width=2&length=4&scale=100`

`https://openbrick.cogan.dev/?template=classic_tile&width=2&length=4&scale=100`

Notes:
- Opening that URL preloads the sliders with those values.
- As you move sliders in the UI, the query params update automatically so the URL is immediately shareable.
- Out-of-range values are clamped to the nearest valid value.
- `1x1` bricks are supported (`width=1&length=1`).

## FAQ (Search-Friendly)
### How do I make a 2x4 brick STL?
Open:

`https://openbrick.cogan.dev/?template=classic_brick&width=2&length=4&height=3&scale=100`

Then click `Download STL`.

### What scale should I use for print tolerance?
Start with `scale=100`. If parts are too tight, try `99` or `98`. If too loose, try `101`.

### Can I share an exact configuration?
Yes. Copy the URL after adjusting controls. The query string stores the full brick settings.

### Does it support 1x1 pieces?
Yes, `width=1&length=1` is valid for all current templates.

## What You Can Do
- Choose a template (brick, plate, or tile).
- Adjust brick dimensions and global scale.
- Preview the model in 3D directly in the browser.
- Download the result as an STL file.

## How It Works
- Everything runs client-side in your browser.
- No backend is required.
- Brick geometry is generated from `.scad` source files.

## Run Locally
Serve this project with any static file server, for example:

```bash
python3 -m http.server 8080
```

Then open:

`http://localhost:8080`

Local share link example:

`http://localhost:8080/?template=classic_brick&width=4&length=2&height=3&scale=101`

## Deploy
This project is static and can be hosted on platforms like:
- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel (static hosting)

## Star Tracker
[![Star History Chart](https://api.star-history.com/svg?repos=timcogan/open-brick&type=Date)](https://star-history.com/#timcogan/open-brick&Date)
