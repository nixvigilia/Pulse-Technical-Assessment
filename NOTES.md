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

---

## Rules — Phase 2 (Make it good)

---

## Rules — Phase 3 (Make it secure)

---

## Rules — Phase 4 (Make it better)
