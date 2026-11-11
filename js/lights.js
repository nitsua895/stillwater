// Room-light output (groundwork). Every ~100ms Stillwater publishes one colour
// + brightness that matches the screen:
//   - window.stillwater.light   for anything running in the page
//   - BroadcastChannel 'stillwater'  for other tabs (e.g. a control panel)
//   - WebSocket, opt-in: add ?lights=ws://localhost:8765 to the URL and a small
//     local bridge can forward it to Hue / WLED / Nanoleaf / DMX.
// Message: { type:'light', r, g, b, brightness, world, beat, stillness }

export function createLights() {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('stillwater') : null;
  const url = new URLSearchParams(location.search).get('lights');
  let ws = null, last = 0;
  function connect() {
    if (!url) return;
    try { ws = new WebSocket(url); ws.onclose = () => setTimeout(connect, 3000); } catch { ws = null; }
  }
  connect();

  function update(now, msg) {
    window.stillwater = window.stillwater || {};
    window.stillwater.light = msg;
    if (now - last < 100) return;
    last = now;
    bc?.postMessage(msg);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  return { update, get bridged() { return !!(ws && ws.readyState === 1); } };
}
