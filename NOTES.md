# Pulse — assessment notes

---

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

---

## Rules — Phase 2 (Make it good)

---

## Rules — Phase 3 (Make it secure)

---

## Rules — Phase 4 (Make it better)
