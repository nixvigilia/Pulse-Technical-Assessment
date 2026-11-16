# Pulse — assessment notes

## Rules — Phase 1 (Make it run)

### 1. WebRTC ICE Failed / Connection Could Not Be Established

**What was broken:**

- After accepting a connection request, the UI showed "Connection failed (network)".
- Two users on localhost could not establish a WebRTC connection.

**How I found it (Manual Testing):**

- Opened the application in two separate browser windows.
- Used Chrome DevTools → Sensors to set different mock locations (e.g. Tokyo on one window) so the users appeared apart on the map.
- Tested the connect → accept flow.
- Observed the connection failure in the application and checked the Firefox browser console, where I found an ICE failure message.
- Investigated the signaling and WebRTC code to find the cause.

**AI Assistance:**

- I used Cursor to help investigate the WebRTC connection issue.
- Its first suggestion was to add a TURN server and extra environment variables.
- Before applying the suggestion, I checked the assessment instructions and remembered that the project was required to keep its existing STUN-only setup.
- I reviewed the suggested changes and made sure they followed the assessment requirements.
- After making the changes, I tested the connection again using two separate browser windows.

**What caused the problem:**

In `lib/webrtc.ts`, the code processed queued ICE candidates before setting the remote connection details using `setRemoteDescription()`.

This meant some ICE candidates were processed too early, which could cause `addIceCandidate()` to fail and the connection to fail.

**How I fixed it:**

I changed the processing order in `lib/webrtc.ts`:

1. First, set the remote connection details using `setRemoteDescription()`.
2. Next, process any queued ICE candidates using `flushPendingCandidates()`.
3. Finally, If a user requests a connection, send back the connection response.

**Result:**

- With two profiles on localhost, the connection now reaches the connected state after one user accepts the request.
- The "Connection failed (network)" error no longer appears.

### 2. Chat Messages Not Visible to the Other User

**What was broken:**

- After the connection was established, the sender could see their own messages, but the other user could not see them.

**How I found it (Manual Testing):**

- Opened two browser windows and completed the connect → accept flow.
- Sent messages from both sides and checked if they appeared in both chat panels.

**What caused the problem:**

- In `lib/webrtc.ts`, `sendChat` sent messages with `t: "msg"`.
- However, `wireDataChannel` only accepted messages with `t: "chat"`.
- Because the message types did not match, incoming messages were ignored.

**How I fixed it:**

- Changed `sendChat` in `lib/webrtc.ts` to send messages with `t: "chat"` so it matches what the receiver expects.

**Result:**

- Both users can now see each other's messages in real time.

### 3. Reconnecting Shows "Request Declined" After Ending a Session

**What was broken:**

- User A and User B connect, then one of them ends the session.
- When either user tries to connect to the same person again, the request is immediately declined even though nobody is in a session.

**How I found it (Manual Testing):**

- Opened two browser windows and tested: connect → accept → end connection → send another request to the same user.

**What caused the problem:**

- When a request was accepted, `app/api/signal/route.ts` set both users as `busy`.
- When someone ended the session, the client sent an `end` message.
- However, the server only cleared the `busy` status when it received a `decline` message, not an `end` message.
- As a result, the other user was still marked as busy, so new requests were automatically declined.

**How I fixed it:**

- I asked Cursor to help identify why new connection requests were being declined after ending a session.
- I reviewed its findings and checked the related code before applying the fix.
- Updated `app/api/signal/route.ts` so signal type `end` clears `busy` for both peers, matching `decline`.

**Result:**

- After ending a session, both users can send a new connection request to each other without getting an automatic decline.

### 4. Video Call – End Button Not Visible

**What was broken:**

- During a video call, the **End video** button could move below the visible screen, making it difficult or impossible to end the call.

**How I found it (Manual Testing):**

- Connected two browser profiles and started a video call.
- Checked if the **End video** button stayed visible without scrolling.

**What caused the problem:**

- In `app/components/VideoPanel.tsx`, the video area could take up more space than available and push the control bar off-screen.
- The chat panel also remained visible during video calls, taking up extra screen space.

**How I fixed it:**

- **`VideoPanel.tsx`:** Updated the layout to keep the video within the screen and keep the control bar at the bottom. Also added spacing for mobile screens.
- **`app/page.tsx`:** Hide the chat panel while a video call is active. It becomes visible again after the call ends.

**Result:**

- The **End video** button now stays visible during calls on the tested desktop browsers (Chrome and Firefox).

### 5. Ghost dots on the map (stale presence)

**What was broken:**

- After a user closed their tab, their dot could stay on the map for a long time, so the map looked busy when nobody was still there (same idea as the README example).

**How I found it (Manual Testing):**

- Opened two browser windows, joined the map, closed one tab, and watched the other window’s map for about 15–20 seconds.

**What caused the problem:**

- Each poll called `updateMany({ where: {} })`, which refreshed `lastSeen` for **every** presence row.
- Any user who kept polling kept everyone else “alive” for `STALE_MS` in `lib/presence.ts`, even if they had already left.

**How I fixed it:**

- In `app/api/poll/route.ts`, heartbeat only updates the caller: `where: { id }`.

**Result:**

- When someone leaves, their dot disappears after roughly `STALE_MS` without another open tab refreshing their row.

### 6. Partner still connected after the other user refreshes

**Branch:** `fix/refresh-partner-stays-connected`

**What was broken:**

- User A and User B are in an active chat (or video).
- User A refreshes the browser → they see **Enter Pulse** again and get a **new** session id.
- User B still sees the chat / call as connected to A’s **old** session; messages and UI act like nothing ended.

**How I found it (Manual Testing):**

- Two browser windows: connect → accept → refresh one window.
- Refreshed window returns to the gate; the other window keeps the chat open.

**What caused the problem:**

1. **Refresh ≠ tab close:** A new React tree gets a new `sessionId`. The `pagehide` handler was re-registered per phase and **removed in `useEffect` cleanup** before the browser fired `pagehide`, so `leave` often never ran for the old session.
2. **Partner had no fallback:** If the leaver never hit `/api/leave`, the survivor relied only on a slow stale reap. The client did not tear down when the partner’s dot disappeared or when WebRTC moved to `disconnected` / `closed`.

**How I fixed it:**

- **`lib/session-lifecycle.ts`:** While live, stash `{ id, secret }` in `sessionStorage`. On the **next** page load, beacon **`/api/leave`** for that orphaned session (covers refresh when `pagehide` missed).
- **`app/page.tsx`:** Register `pagehide` once via refs (not torn down on unmount); on hide, send `end` if in a call, then `leave` + clear storage.
- **`app/page.tsx`:** After poll, if connected to a `peerId` not in `peers` for two ticks (~3s), run local `teardown`.
- **`app/page.tsx`:** In `onConnectionState`, treat WebRTC `disconnected` and `closed` like `failed` so the survivor exits quickly.

**Result:**

- Refreshing ends coordination for the old session and the other user’s UI should close within a poll or two, or when the peer connection drops.

---

## Rules — Phase 2 (Make it good)

### 1. Map dots — green and amber only

**What I changed:**

- **Map UX:** Two colors only:
  - **Green** — Available
  - **Amber** — Unavailable – Already in a conversation or video call.
- **`lib/presence-state.ts`:** `presenceMarkerClass` and `presenceSwatchClass` map everything that is not `available` to the same amber styling; tooltips and the stranger card use the shared unavailable label.
- **`app/globals.css`:** Removed blue `.pulse-dot--on-call` styles; unavailable dots use `.pulse-dot--unavailable` (same amber pulse as before).
- **`app/components/WorldMap.tsx`:** Disabled **Request** tooltip uses the same unavailable copy when the peer is busy or on a call.
- **`lib/presence-state.test.ts`:** Asserts green vs amber visuals and label text.

**What stayed the same (on purpose):**

- The server still stores `available`, `busy`, and `on_call` on `Presence.status` so video can move both peers to `on_call` and back to `busy` when the call ends (`app/api/signal/route.ts`). Only the **globe** collapses chat and video into one amber state.

**Result:**

- The map reads at a glance: open to connect (green) or not (amber), without a third color that duplicated “unavailable.”

---

## Rules — Phase 3 (Make it secure)

Full write-up: `docs/security-review.md`. Below is what I found, how I ranked it, and what I could reproduce locally.

### Main issue (SEC-001) — session id is the only “password”

Every dot’s **session id** is public — **`GET /api/poll`** lists it in **`peers`** so the map can render. **`/api/join`**, **`/api/poll`**, **`/api/signal`**, and **`/api/leave`** used that id alone as proof of identity (no per-tab secret, no login). Anyone who copied an id from the network tab, console, or Postman could send signals or **`leave`** **as that user**. Chat text never hit the server (WebRTC), but the **signaling mailbox** did — so the risk was **impersonation** and **mailbox abuse**, not reading chat from Postgres.

**How I reproduced:** Two map windows → read a stranger’s id from **poll** → DevTools **`fetch`** **`request`** (fake incoming call) and **`leave`** (remove their dot) with **only** ids in the JSON. Step-by-step below. Same root cause as unread **`poll`** / forged **`accept`**/**`end`** (not all re-tested manually — see `docs/security-review.md`).

**How I think about it (simple):** public room number on a lobby board, but the hotel also uses that number as your ID card — anyone who sees the board can pretend to be you at the desk.

### What I reproduced locally

**Setup**

- Two windows on the map (different mock locations in DevTools → Sensors).
- Confirmed session ids are public: Network → `poll` → Response → `peers` includes each dot’s `id`.

**1. Fake `request` (reproduced)**

- DevTools **Console** on `localhost:3000` (replace ids with your two session ids from `poll` / `peers`):

```javascript
fetch("/api/signal", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fromId: "STRANGER_1",
    toId: "STRANGER_2",
    type: "request",
  }),
});
```

**Same call in Postman (optional)**

| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Method            | `POST`                                                                |
| URL               | `http://localhost:3000/api/signal`                                    |
| Headers           | `Content-Type: application/json`                                      |
| Body → raw → JSON | `{ "fromId": "STRANGER_1", "toId": "STRANGER_2", "type": "request" }` |

Postman hits the same public API as the browser. **Before the SEC-001 fix**, these bodies worked with ids only; **after the fix** they return **`403`** unless you include the victim’s tab secret (which attackers should not have). On a deployed app use your Vercel URL instead of `localhost`. For **`leave`**: body `{ "id", "secret" }`.

- `fromId` = sender, `toId` = receiver, `type: "request"`. The other window showed the connection prompt within ~1.5s — same as tapping a dot, but without using the map UI (console or Postman).
- This shows the server trusts ids in JSON with **no secret**; console is not a special bypass — it is the same API as `lib/api.ts` `sendSignal`.

**2. `leave` as another user — kick off map (reproduced)**

- Tested **after** the fake request. Removes their **presence** row (dot disappears for everyone). Not the same as **End chat** — that uses `signal` type `end`.
- DevTools **Console** — `id` = the victim’s session id from `peers` (not your own):

```javascript
fetch("/api/leave", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: "STRANGER_2" }),
})
  .then((r) => r.json().then((j) => ({ status: r.status, body: j })))
  .then(console.log);
```

- Got **`status: 200`**, **`body: { ok: true }`**. On the **other** window’s map, their dot was gone within ~1–2s (`peers` no longer listed them). Victim’s tab can still show the local **“Me”** pin until they refresh — server-side they were removed.
- Same issue: knowing their public id is enough; no secret required (`lib/api.ts` `leave`).

### What I fixed (SEC-001)

- **Session secret:** each tab generates a random secret (memory only). Server stores `secretHash` on `Presence` (`prisma/schema.prisma`).
- **API auth:** `/api/join`, `/api/poll`, `/api/signal`, `/api/leave` require the secret (`body.secret` or header `X-Pulse-Session-Key` on poll). Wrong or missing secret → **`403 unauthorized`**.
- **Client:** `lib/api.ts` + `app/page.tsx` send the secret on every call; `leave` beacon includes `{ id, secret }`.
- **Re-test:** old Postman/console calls with **only** ids (no secret) should fail. Map + connect must still work in two normal windows.
- **DB:** run `npx prisma db push` locally (drop/empty `Presence` if the migration complains about existing rows). Not fixed yet: SEC-002, SEC-004 (see below).

### Main issue (SEC-003) — tab close leaves partner stuck `busy`

**Problem (from `docs/security-review.md`):** Closing a tab only deleted the leaver’s presence row. The survivor stayed `busy` with no `end` in the mailbox, because the server did not remember the pair.

**How I reproduced:** Two browser windows → connect → accept → close one tab (or refresh it). The other window stayed in chat; on the map the survivor often stayed **unavailable (amber)** and new **Request** attempts were auto-declined until reload.

### What I fixed (SEC-003)

**Server**

- **`prisma/schema.prisma`:** `Presence.peerId` — mutual pointer set on `accept` in `app/api/signal/route.ts`.
- **`lib/presence-cleanup.ts`:** `releasePartnersForPresenceIds` — for departing session(s), reset the partner to `available`, clear `peerId`, enqueue `type: "end"` to their mailbox; also clears random-match state via `releaseMatchPartner`.
- **`app/api/leave/route.ts`:** Calls release **before** deleting the leaver (after SEC-001 secret check).
- **`app/api/poll/route.ts`:** Stale reap loads expired ids, releases partners, then deletes rows (no blind `deleteMany` on stale presence alone).

**Client (also covers refresh — see “Partner still connected after the other user refreshes” above)**

- **`app/page.tsx`:** `pagehide` sends `end` when in a call, then `leave`; WebRTC `failed` / `disconnected` / `closed` sends `end` before local `teardown`; poll tears down if the partner’s dot is missing for ~2 ticks.
- **`lib/session-lifecycle.ts`:** Orphan `leave` on the next load when refresh missed `pagehide`.

**Re-test:** Two tabs → connect → close or refresh one tab → within stale window (~15s) or immediately on `leave`, the other tab should leave the chat and show **available** (green) on the map again.

### Ranking (short)

| Priority               | ID              | Issue                                                                                                        |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| Must fix before launch | SEC-001         | Public id = API credential → **fixed (secret)**; reproduced before fix: fake `request` + `leave`             |
| Must fix before launch | SEC-002         | `busy` and signals not tied to a real connection pair                                                        |
| Must fix before launch | SEC-003         | Tab close leaves partner stuck `busy` → **fixed (`peerId` + partner release on leave/stale + client `end`)** |
| Must fix before launch | SEC-004         | No rate limits / abuse caps on anonymous API                                                                 |
| Important after        | SEC-005–SEC-010 | Raw GPS on client pin, cleanup, headers, Mapbox token, Next upgrade, etc.                                    |

Details and remediation phases are in `docs/security-review.md`.

---

## Rules — Phase 4 (Make it better)

I wanted Pulse to feel less empty when you open it — you should sense that other people are on the globe, not just stare at dots. I also wanted a way to meet someone without hunting the map, while still respecting the idea that you only talk to one stranger at a time.

### 1. Global Activity

When I join, I like knowing the app is alive. A small line in the header shows how many people are online and how many could still talk to you (not already in a chat or on video).

The bar is subtle on purpose: it should feel like a heartbeat for the app, not a stats dashboard, and it tucks away on very small screens so the map stays the focus.

### 2. User Preferences

Random matching only works if you can actually converse, so I ask which languages you speak and require at least one before you search. Gender is optional, and you can say whether you prefer to connect with anyone, men, or women — both sides’ choices have to line up.

You can save languages and gender without starting a search, which is handy if you want to set things up first. When you do that, you get a quick confirmation message and the panel closes so you are back on the map. “Connect with” only applies when you press Random connect, not when you are only saving — saving should not silently put you in a queue with filters you did not mean to use.

### 3. Random Connection

The **Random** button opens a panel over the map instead of a new page, because the world map is still the soul of Pulse. While you wait, I tried to make searching feel intentional: a soft pulse, rotating encouraging lines, and a timer so it does not feel frozen. **Stop searching** is the way out while waiting.

Both people have to accept within a short window before chat starts, same idea as tapping someone on the map. If that offer times out and a third person is also searching, I avoid instantly matching the same two again; with only two compatible people left, they can still be paired so nobody is stuck forever.

If you are already in a conversation, **Random** is disabled — one chat at a time, same as the rest of the app.

### 4. Connection (chat + video)

A random match is still just another stranger on the map: once you both accept, you get the same text chat and optional video as a normal connection. I did not want a second, weaker chat experience.

Small touches from testing: the chat **Send** button had room for its label; if someone declines video, a short line in the chat explains what happened so you are not left guessing.
