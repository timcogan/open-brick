# Open Brick Lab

## Live App
[https://openbrick.cogan.dev](https://openbrick.cogan.dev)

Open Brick Lab is a browser-based tool for creating classic interlocking bricks and exporting them as STL files for 3D printing.

## Shareable URLs (Query Params)
Share a specific brick configuration with:

`https://openbrick.cogan.dev/?template=classic_brick&width=X&length=Y&height=Z&scale=SCALE`

Where:
- `template`: currently `classic_brick`
- `width`: studs in X (1-10)
- `length`: studs in Y (1-12)
- `height`: plate units in Z (1-9)
- `scale`: global scale percent (95-105)

Example:

`https://openbrick.cogan.dev/?template=classic_brick&width=4&length=2&height=3&scale=101`

Notes:
- Opening that URL preloads the sliders with those values.
- As you move sliders in the UI, the query params update automatically so the URL is immediately shareable.
- Out-of-range values are clamped to the nearest valid value.
- `1x1` bricks are supported (`width=1&length=1`).

## What You Can Do
- Choose a classic brick template.
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
