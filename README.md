# AnchorMesh

**AnchorMesh: Vertex-Anchored Autoencoding for Artistic Mesh Generation**

Project website: <https://huangzygiti.github.io/AnchorMesh/>

This repository currently hosts the project website. Research code is planned
for release after paper acceptance.

## Website

The static website lives in `docs/`. It includes the paper figures and interactive
generation and reconstruction examples. It runs without ChatGPT, an API key,
or a build service.

To publish, configure **Settings → Pages → Deploy from a branch → main → /docs**.

For local preview:

```bash
python -m http.server 8000 --directory docs
```

Then open <http://localhost:8000/>.

## Paper and code links

The Paper and Code buttons are placeholders until their corresponding URLs are
provided. After the paper or implementation becomes available, update the links:

```bash
python tools/update_publication_links.py --paper https://YOUR-PAPER-URL
python tools/update_publication_links.py --code https://github.com/huangzygiti/AnchorMesh
```

Commit and push the updated `docs/content.json` to update the live website.
Research source code can be added outside `docs/` after acceptance; the website
will continue to deploy from `docs/`.

## Third-party components

The website uses Three.js 0.180.0. Its MIT license is retained at
`docs/assets/vendor/LICENSE.txt`.
