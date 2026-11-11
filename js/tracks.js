// Track name -> world. When you load album files, each filename is matched
// against these keywords (case-insensitive) and the first world that matches
// wins. Anything unmatched falls back to Auto mood (if on) or the next world.
//
// These are starting guesses from track titles and the game's story (sea,
// lighthouses, sacred light, rising water, a garden). They are meant to be
// tuned by ear: move a word to another world, or add exact track titles.

export const WORLDS = [
  { id: 'tide',      name: 'Tide',      sub: 'dawn · horizon · breath' },
  { id: 'lightwell', name: 'Lightwell', sub: 'beam · gather · glow' },
  { id: 'undertow',  name: 'Undertow',  sub: 'depth · pull · surrender' },
  { id: 'prism',     name: 'Prism',     sub: 'fracture · colour · heal' },
  { id: 'bloom',     name: 'Bloom',     sub: 'garden · unfold · return' },
];

export const TRACK_RULES = {
  undertow:  ['undertow', 'nautica', 'storm', 'brewin', 'flood', 'deep', 'depth', 'abyss', 'torrent', 'sub rosa'],
  prism:     ['fractur', 'stained', 'glass', 'prism', 'shatter', 'shard', 'mosaic'],
  lightwell: ['light', 'lantern', 'beacon', 'sacred', 'flame', 'keeper', 'star'],
  bloom:     ['bloom', 'garden', 'healing', 'origata', 'atelier', 'waltz', 'mentor', 'grow', 'life'],
  tide:      ['drift', 'homecoming', 'prelude', 'valley', 'noor', 'sea', 'sail', 'shore', 'tide', 'voyage', 'harbour', 'harbor'],
};

export function worldForTrack(name) {
  const n = name.toLowerCase();
  for (const [id, words] of Object.entries(TRACK_RULES)) {
    if (words.some(w => n.includes(w))) return WORLDS.findIndex(w => w.id === id);
  }
  return -1;
}

// Auto mood: pick a world from how the music *sounds* over the last ~20s.
// energy = loudness, brightness = how much high-frequency content.
export function worldForMood({ energy, brightness }) {
  if (energy < .22) return brightness > .45 ? 1 : 0;   // quiet: bright -> Lightwell, warm -> Tide
  if (energy < .4)  return brightness > .5 ? 4 : 0;    // gentle: Bloom or Tide
  return brightness > .5 ? 3 : 2;                      // full: Prism or Undertow
}
