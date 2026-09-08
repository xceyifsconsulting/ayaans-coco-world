# Ayaan's Coco World

A Pac-Man-style beach maze you can play in the browser. You are a coconut. Nibble fruit, plants, and seaside snacks. Dodge **Boot** the bird — and his flock.

**Play live on GitHub Pages:** [https://xceyifsconsulting.github.io/ayaans-coco-world/](https://xceyifsconsulting.github.io/ayaans-coco-world/)

## How to play

- **Move** with arrow keys or **WASD**. On a phone, swipe the maze or use the on-screen pad.
- Eat every snack to clear the beach and advance a level.
- Corner **power snacks** (the pulsing stars) scare the birds. Eat a frightened Boot for bonus points.
- You have **three lives**. A Boot that is not frightened will catch the coconut.

The four birds have simple personalities:

| Bird  | Style                         |
| ----- | ----------------------------- |
| Amber | Charges straight at you       |
| Sky   | Aims ahead of where you run   |
| Sandy | Tries to cut you off          |
| Coral | Chases, then chickens out     |

## Run it locally

This is a static site — no build step.

```bash
# any local static server, for example:
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The game files live at the repository root (`index.html`, `style.css`, `game.js`) with a `.nojekyll` file so Pages will not run Jekyll.

After this repo is on `main`, the site URL is:

`https://xceyifsconsulting.github.io/ayaans-coco-world/`

**Preferred:** GitHub Actions deploys Pages on every push to `main` (workflow `.github/workflows/deploy-pages.yml` using `actions/deploy-pages`).

1. Repo **Settings → Pages → Source:** GitHub Actions  
2. Merge to `main` (or run the **Deploy GitHub Pages** workflow)  
3. The workflow publishes the static files.

**Fallback:** Settings → Pages → Deploy from a branch → `main` / `/` (root). The `.nojekyll` file is already in place for that mode.
