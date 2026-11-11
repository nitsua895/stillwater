# Stillwater

An immersive visualizer to move to: yoga, slow dance, stillness. It's built for a
projector or big screen, listens to the music and follows your body through the webcam.

- **Five original worlds:** Silk, Lightwell, Undertow, Spectrum, Bloom. Three are a real-time fluid your whole body stirs; two show your silhouette.
- **Body:** MediaPipe Pose tracks both hands and your torso. Hands shed light, raised arms brighten the world, and **holding still for ~7 s blooms the world** and sends a ring of light out from you.
- **Physics:** a real-time wave simulation on the GPU. Music feeds it: sustained lows make swells, and attacks (plucks, hits) drop ripples that travel and interfere. Your hands and your moving body push it too, and in the water worlds waves reflect off your silhouette. Each world lights the surface in 3D.
- **You in the world:** the camera's full-body silhouette is drawn by each world. You're a dusk figure with a sunlit rim and a reflection in the sea, a shape lit by the beam that fills with light as you still, a diver in caustic light, a stained-glass window, or overgrown with leaves and blossoms.
- **Music:** connect **Spotify** so the world follows the song that's playing (title → world), and use the **mic** so the physics hears the sound. Spotify never gives apps the audio itself. On a computer, **Tab audio** captures a browser tab's or the system's sound directly (e.g. Spotify's web player): the cleanest signal. iPad and iPhone don't let web pages capture other apps' audio, so there the mic is the way. You can also load album files. *Auto* lets the sound choose when a title doesn't match.
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
| `M` | mic on |
| `P` | small mirror preview of the camera |
| `D` | debug readout (motion, stillness, audio) |
| `Q` | render quality (low / medium / high) |
| `F` | fullscreen · `H` hide controls |
| `Space` / `←` `→` | play/pause · previous/next track |

## Code map
- `js/main.js`: UI, main loop, and how sound, hands and body feed the physics (`sources()`, `PHYS`)
- `js/fluid.js`: GPU fluid (stable fluids) stirred by your body and the music (Silk, Spectrum, Bloom)
- `js/sim.js`: GPU wave simulation (Lightwell, Undertow)
- `js/shader.js`: the five worlds (one fragment shader)
- `js/spotify.js`: Spotify now-playing (browser-only PKCE sign-in)
- `js/gl.js`: WebGL2 helpers
- `js/body.js`: pose tracking, motion fallback, stillness and reward logic
- `js/audio.js`: file and mic analysis, beat, mood
- `js/particles.js`: light shed from the hands
- `js/tracks.js`: track title → world rules (tune here)
- `js/lights.js`: colour stream for room lights
- `legacy/prototype-v0.html`: the first Canvas2D demo, kept for reference
