# Stillwater: project brief

## The idea
A projected, room-scale visualizer for practising yoga and free movement to the
*Monument Valley 3* soundtrack (Todd Baker & Lucie Treacher). It should feel like
stepping into another world that **listens to the music and responds to your
body**, so that moving feels powerful and holding still is rewarded too.

## Who and where
- One person (the owner) moving in a room: yoga flows, slow dance, standing meditation.
- Output: a projector or large TV, fullscreen, seen from 2–4 m away.
- Input: a laptop webcam or USB webcam, plus music from local files or Spotify through speakers.

## Experience principles
1. **Calm first.** No strobing, no harsh cuts. Every change is a crossfade (about 6 s).
2. **Power in the hands.** Your hands are light sources. Fast motion scatters light, and lifting your arms brightens the world.
3. **Stillness is rewarded, not just tolerated.** Holding still for about 7 s fills a hidden meter. The world blooms (the sun rises, the orb grows, the glass heals, the flower opens) and a ring of light leaves your body.
4. **Readable from across the room.** The worlds have big shapes and soft detail, and there is no UI unless you move the mouse.
5. **The music leads.** Each world breathes with the bass, shimmers with the highs and swells on soft beats.
6. **Original visuals.** The worlds are *inspired by the soundtrack's mood and themes* (sea, light, depth, colour, growth). They do not copy the game's art, characters or architecture.

## Body signals (from MediaPipe Pose, webcam)
| Signal | How it's measured | What it does |
|---|---|---|
| Hands ×2 | wrists nudged toward the index fingers | light sources, particle trails, ripples, warping water and glass |
| Motion | average speed of head, shoulders, arms and hips | scatters and fractures, sheds more light |
| Stillness | fills over ~7 s when motion is low, drains when you move | sun rises, orb grows, glass edges glow gold, flower opens |
| Rise | wrists above the shoulders | widens the beam, lifts the sun and orb |
| Openness | wrist span ÷ shoulder width | opens the flower further |
| Body centre | torso | worlds lean toward where you stand |
| Reward pulse | fires each time stillness fills | a ring of light expands from your body |

If the pose model can't load, the app falls back to webcam motion detection. With no
camera at all, the mouse or a finger acts as one hand.

## The five worlds
| # | World | Mood | Body response |
|---|---|---|---|
| 1 | **Tide** | dawn sea, horizon, breath | hands ripple the water; stillness raises the sun |
| 2 | **Lightwell** | night, a beam of light, gathering | stillness grows the orb; raised arms widen the beam; light flows toward it |
| 3 | **Undertow** | deep water, caustics, darker pull | hands bend the light on the water; stillness opens light from above |
| 4 | **Prism** | stained light, fracture and healing | motion fractures the cells; stillness turns the edges gold |
| 5 | **Bloom** | garden, unfolding, return | stillness and open arms open the flower; seeds drift from the hands |

## Choosing the world
- **By track (MVP):** load the album files. Each filename is matched against keywords in `js/tracks.js` (for example *Undertow* → Undertow, *Lightkeeper* → Lightwell, *Bloom* → Bloom).
- **Manual:** keys `1`–`5` or the buttons.
- **Auto (experimental):** reads the music's loudness and brightness over about 20 s and picks a world. This works with the mic, so Spotify playing through speakers can drive it.
- **Later:** true song recognition (audio fingerprinting, or reading Spotify's now-playing through its API).

## Roadmap
1. **v2 (this version):** GPU wave physics driven by the spectrum and attacks, a full-body silhouette drawn per world, Spotify now-playing.
1. **MVP:** five worlds, pose tracking, stillness reward, album-file mapping, Auto mood, deployed on Netlify.
2. **Tune by ear:** listen through the album and refine `TRACK_RULES` plus per-world colours and speeds (see `docs/SOUNDTRACK.md`).
3. ~~**Spotify now-playing**~~ done (browser-only PKCE, polled every 3 s). Spotify's API gives track info, not audio, so the mic provides the sound.
4. **Room lights:** a small local bridge reads `?lights=ws://localhost:8765` and drives Hue, WLED or Nanoleaf. The colour and brightness stream already exists (`js/lights.js`).
5. **More bodies and depth:** multi-person tracking, segmentation silhouettes, or a Kinect/depth camera.
6. **Session flow:** an optional guided arc (arrive, flow, peak, stillness, return) across a full album play-through.
