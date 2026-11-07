# Render tools

Regenerates the concept renders in `Renders/` from `Original/` + `Markup/`.

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy scipy
.venv/bin/python tools/render.py . Renders            # all nine photos
.venv/bin/python tools/render.py . Renders 111207     # one photo
```

Colour key read from the markups: pink = crushed granite, orange/yellow = granite with
flagstone steppers, blue = river rock, green = mulch, red = drain markers 0 and 1.
Per-photo settings (which colours to honour, pixels-per-inch at the bottom edge) are in
`CONFIG` at the top of `render.py`. The page `patio-concept.html` expects
`Renders/<key>_before.jpg`, `_after.jpg`, `_markup.jpg` and the four `swatch_*.jpg`.
