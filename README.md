# Stillwater

An immersive visualizer to move to: yoga, slow dance, stillness. It's built for a
projector or big screen, listens to the music and follows your body through the webcam.

- **Five original worlds:** Tide, Lightwell, Undertow, Prism, Bloom. Each crossfades into the next.
- **Body:** MediaPipe Pose tracks both hands and your torso. Hands shed light, raised arms brighten the world, and **holding still for ~7 s blooms the world** and sends a ring of light out from you.
- **Music:** load the album files (each track title picks its world), or use the mic for Spotify through speakers. *Auto* lets the sound choose the world.
- **Lights (groundwork):** publishes a live colour and brightness for a future Hue / WLED bridge.

See [`docs/BRIEF.md`](docs/BRIEF.md) for the project brief and
[`docs/SOUNDTRACK.md`](docs/SOUNDTRACK.md) for the soundtrack research and tuning notes.

## Run it
It's static files with no build step. It deploys to Netlify as-is (`netlify.toml`). To run it locally:
```
python3 -m http.server 8000   # then open http://localhost:8000
```
The camera and mic only work on HTTPS or localhost.

## Controls
| Key | |
|---|---|
| `1`–`5` | switch world |
| `A` | Auto (music picks the world) |
| `C` | camera on |
| `P` | small mirror preview of the camera |
| `D` | debug readout (motion, stillness, audio) |
| `Q` | render quality (low / medium / high) |
| `F` | fullscreen · `H` hide controls |
| `Space` / `←` `→` | play/pause · previous/next track |

## Code map
- `js/main.js`: WebGL setup, UI, main loop
- `js/shader.js`: the five worlds (one fragment shader)
- `js/body.js`: pose tracking, motion fallback, stillness and reward logic
- `js/audio.js`: file and mic analysis, beat, mood
- `js/particles.js`: light shed from the hands
- `js/tracks.js`: track title → world rules (tune here)
- `js/lights.js`: colour stream for room lights
- `legacy/prototype-v0.html`: the first Canvas2D demo, kept for reference
