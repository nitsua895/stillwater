# Monument Valley 3 soundtrack: research notes

> **Honesty note.** I (Claude) can't listen to audio. These notes come from
> published facts about the album and the game (credits, interviews, track
> titles, story). The per-world mapping in `js/tracks.js` is a starting guess
> based on titles and story, so **tune it by ear** with the table at the bottom.

## Facts
- **Composers:** Todd Baker (audio director and composer, returning from *Monument Valley 2*) and **Lucie Treacher** (composer and audio designer). Tracks are credited to one or both of them.
- **Album:** *Monument Valley 3 (Original Game Soundtrack)*, released 1 July 2025. It has **39 tracks, about 1 h 35 min** on Spotify and Steam. The 2×LP vinyl (iam8bit) has 34 tracks, and track lists differ slightly between editions.
- **Game:** released December 2024 (Netflix Games), with a free expansion, *The Garden of Life*, in 2025.
- **Approach:** the score was built as a blend of composition and *interactive* sound design, with music and puzzle mechanics developed together. Strings were recorded live at Air-Edel, and foley was assembled from field recordings and libraries. Coverage calls it "meditative" and notes it is darker and edgier than *MV2* in places. It earned a D.I.C.E. nomination for original music composition.

## World and story (the source of the textures)
You play Noor, a lighthouse keeper's apprentice. **Rising water** threatens her
coastal home, and she sails a small boat between islands to gather **sacred light**
and relight a fading lighthouse. This gives four elemental threads, each mapped to a world:

| Thread | Sonic character (from coverage + titles) | Stillwater world |
|---|---|---|
| Open sea, sailing, home | airy, drifting, horizon-wide | **Tide** |
| Light, lighthouses, keepers | luminous, rising, devotional | **Lightwell** |
| Storm, deep water, the pull below | darker pulses, weight, tension | **Undertow** |
| Fracture and repair | brittle, crystalline, then healing | **Prism** |
| Gardens, craft, life | warm, organic, plucked and bowed | **Bloom** |

## Known track titles (partial)
Drift · Lightkeeper · Noor in the Valley · Origata Atelier · Commuters' Waltz ·
Healing · The Fracturing · First Lightwell · Storm be Brewin · Nautica · Undertow ·
Sub Rosa · Mentor's Passing · Bloom · Homecoming · (Stained Glass is listed in
some sources but I couldn't confirm it)

## Tuning table: fill this in while listening
Listen with the visualizer running, press `D` for the debug readout, and note what fits.

| Track | Feels like | Best world | Notes (tempo, texture, peak moments) |
|---|---|---|---|
| Noor in the Valley | | Tide | |
| Drift | | Tide | |
| Lightkeeper | | Lightwell | |
| First Lightwell | | Lightwell | |
| Storm be Brewin | | Undertow | |
| Undertow | | Undertow | |
| The Fracturing | | Prism | |
| Healing | | Bloom | |
| Origata Atelier | | Bloom | |
| Bloom | | Bloom | |
| Homecoming | | Tide | |

Then move keywords between worlds in `js/tracks.js` → `TRACK_RULES`.

## Sources
- Spotify album page: https://open.spotify.com/album/1O8s3BqsAmrczfIkcWCDkl
- Steam soundtrack page: https://store.steampowered.com/app/3846460/
- VGMdb: https://vgmdb.net/album/150853 (CD/digital) and https://vgmdb.net/album/151416 (vinyl)
- A Sound Effect interview: https://www.asoundeffect.com/monument-valley-3-game-audio/
- Laced Records: https://www.lacedrecords.com/blogs/blog/composer-todd-baker-on-building-upon-a-meditative-vibe-in-monument-valley-3
- Xbox Wire: https://news.xbox.com/en-us/2025/07/18/how-monument-valley-3-uses-soundscapes-to-tell-its-story/
- Fan wiki: https://monumentvalley.fandom.com/wiki/Monument_Valley_3_(Original_Game_Soundtrack)
