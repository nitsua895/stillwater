# Stillwater

A zen visualizer for slow, immersive music. It's built to run on a projector while you move through the room.

- Four movements (Shore, Floating Stones, Lanterns, Bloom) that fade into each other
- Reacts to music, either from loaded audio files (one movement per track) or from the mic listening to the room
- Reacts to your body: the camera picks up where you're moving and how much (a stand-in for a future Kinect version). Touch and the mouse do the same thing.

## Run it
It's a single static `index.html` with no build step. Deploy the repo to Netlify, or serve it locally with `python3 -m http.server`.
Browsers only allow the camera and mic on HTTPS or localhost.

## Controls
`1`–`4` switch movement · `F` fullscreen · `H` hide controls · `Space` play/pause · `→` next track

On iPad, use Share → Add to Home Screen to get true fullscreen.
