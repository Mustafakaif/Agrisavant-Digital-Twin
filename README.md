# AGRISAVANT Digital Twin — Tomato Sahoo

A static HTML/CSS/JS dashboard merging two prior prototypes:

- **GUI/layout** ported from `digital_twin/app.py` (Streamlit) — the simple 3-panel
  layout: growing-conditions sliders on the left, plant view + DAS slider in the
  centre, plant summary/gauges on the right.
- **Plant animation** copied from `Tomato Plant Digital Twin Dashboard/plant3d.js` —
  a framework-free Three.js procedural tomato plant that grows, wilts, ripens fruit
  and shows pest/disease damage in real time. Untouched from the source project.

Both source projects derive their growth anchors from the same
`Tomato_DAS_Daily_Baseline_0_to_120.xlsx` (verified identical checksum), so the
merged growth model in `js/growth-model.js` is a straight port of
`digital_twin/growth_model.py`.

## Run it

No build step, no server-side code — just needs a static file server (ES modules
and texture loading don't work over `file://`).

```
run_windows.bat        (Windows)
./run_mac_linux.sh      (macOS/Linux)
```

Then open http://localhost:8743 in a browser. Requires Node.js (used only to serve
static files — `serve.js` is a ~20-line dependency-free HTTP server).

## Structure

```
index.html            Page layout (3-panel dashboard)
css/style.css          Styling ported from app.py's CSS block
js/growth-model.js      DAS-anchor growth/health/risk simulator (ported from growth_model.py)
js/ui-components.js     Gauge + fruit-quality badge SVG generators (ported from ui_components.py)
js/plant3d.js           Three.js procedural plant renderer (copied as-is)
js/main.js              Wires sliders -> growth model -> plant3d + summary panel
assets/                Leaf texture + logo
data/                  Source Excel + derived anchor CSV
```

## Inputs

Relative humidity, GDD, soil humidity, and sun hours all recalculate the growth
model on every change; the DAS slider scrubs through days 1–120, animating the
plant smoothly rather than snapping between states.
