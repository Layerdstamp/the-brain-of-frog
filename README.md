# The Brain of Frog

A mobile-optimized Three.js neural universe prototype with layered strands, bloom glow, particles, and clickable neuron nodes.

## Run locally

Because this uses ES modules, run it from a local server instead of opening `index.html` directly.

```powershell
cd ".\"
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Controls

- Drag: orbit the universe
- Scroll / pinch: zoom
- Tap or click a neuron node: show node info panel (placeholder for future paragraph knowledge payload)

## Next build phase

- Bind user-provided paragraphs to neuron IDs
- Add richer popup content cards
- Add search/filter and guided camera tours through knowledge clusters
