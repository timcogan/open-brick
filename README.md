# Open Brick Lab

## Live App
[https://openbrick.cogan.dev](https://openbrick.cogan.dev)

Open Brick Lab is a browser-based tool for creating classic interlocking bricks and exporting them as STL files for 3D printing.

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

## Deploy
This project is static and can be hosted on platforms like:
- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel (static hosting)
