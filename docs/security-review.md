# Pulse — Security Review

Assessment only. No application code, tests, dependencies, or configuration were changed.

Reviewed against `README.md` and `docs/requirements.md`. Where those documents disagree, both are cited. The running design is the one in the code and the README: transient Postgres for presence and WebRTC signaling, HTTP polling for delivery, and peer-to-peer chat and video. Requirements that say “no external services” and “the server holds no data” are treated as privacy goals, not as a reason to replace Postgres with in-memory state.

---

## 1. Executive Summary

Pulse keeps chat text and camera media off the server, applies a 1–3 km location offset before writing presence, and uses short-lived rows rather than accounts. Those choices match the product.

The coordination API does not. Every online session id is returned to every map client, and that same id is the only credential for heartbeat, mailbox delivery, signaling, relocation, and deletion. Anyone who can see a dot can act as that session: read and delete its WebRTC signaling, accept or end connections in its name, move its dot, or remove it. WebRTC encryption does not prevent this. The encrypted channel is established with whoever completes signaling, and signaling is forgeable.

A second gap sits next to impersonation. `busy` is a global flag any caller can set or clear for any pair of ids, and closing a tab does not release the other person. After a normal disconnect, the remaining user can stay “busy” for as long as their tab keeps polling, so later requests are auto-declined.

These issues are fixable inside the current anonymous model. Use a public dot id plus an in-memory session secret, bind signaling to a single transient connection row, and release the peer on leave and on stale cleanup. Do not add accounts, a durable user database, or a WebSocket service.

**Do not deploy to production until SEC-001, SEC-002, SEC-003, and SEC-004 are fixed.**

| Severity      | Count | IDs                       |
| ------------- | ----- | ------------------------- |
| Critical      | 1     | SEC-001                   |
| High          | 3     | SEC-002, SEC-003, SEC-004 |
| Medium        | 6     | SEC-005 – SEC-010         |
| Low           | 4     | SEC-011 – SEC-014         |
| Informational | 3     | SEC-015 – SEC-017         |

---

## 2. Application Architecture

What the code actually does:

**Session.** `app/page.tsx` sets `sessionId` with `crypto.randomUUID()` for the life of the page. There is no cookie, no server-issued token, and no second secret. Entering the map sends that id and the browser geolocation fix to `POST /api/join`.

**Presence.** `POST /api/join` runs `applyPrivacyOffset` and upserts `Presence` (`id`, offset `lat`/`lng`, `busy`, `lastSeen`). Raw coordinates are not a column. `GET /api/poll` heartbeats that id, deletes stale presence (15 seconds without a heartbeat) and old signals (60 seconds), returns every other online dot, and returns then deletes every `Signal` row addressed to the caller. `POST /api/leave` deletes that id’s presence and its signals. Cleanup runs only inside these requests. Nothing in the process holds the session; Postgres is the shared store, which is what makes the data visible to every Vercel function instance.

**Connections.** There is no connection table. `POST /api/signal` appends a mailbox row (`request`, `accept`, `decline`, `offer`, `answer`, `ice`, `end`). `accept` sets `busy = true` on both ids. `decline` and `end` set `busy = false` on both. A `request` is auto-declined when the target row is missing or already busy. The caller’s own `busy` flag is not checked.

**Realtime.** Clients poll `GET /api/poll?id=` about every 1.5 seconds (`lib/presence.ts`). There is no WebSocket, SSE, or Server Action. Chat and video use `RTCPeerConnection` in `lib/webrtc.ts` with Google STUN only. Chat and video-control messages ride the data channel. SDP and ICE are the only call data stored on the server, and only until the mailbox is drained or the 60-second TTL is reaped.

**Map.** Mapbox GL JS runs in the browser with `NEXT_PUBLIC_MAPBOX_TOKEN`. The server never calls Mapbox. The self pin and the initial camera use the raw geolocation fix held in React state. Other clients only receive the offset point.

**Deployment shape.** Four Node.js route handlers, all `force-dynamic`. No `middleware.ts`. `next.config.ts` sets a dev `allowedDevOrigins` entry and no security headers. `DATABASE_URL` stays on the server. The Mapbox token is a public client token by prefix (`pk.`).

---

## 3. Security Findings

### SEC-001 — Peer id is public, and it is the session credential

|          |                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | Critical                                                                                                                                                                                        |
| Status   | Confirmed                                                                                                                                                                                       |
| Affected | `GET /api/poll`, `POST /api/join`, `POST /api/leave`, `POST /api/signal`; `app/api/poll/route.ts`, `app/api/join/route.ts`, `app/api/leave/route.ts`, `app/api/signal/route.ts`, `app/page.tsx` |

**Description.** Your session id is the only thing the server checks. The map already shows everyone else’s id, so anyone who can see a dot can pretend to be that person. With that id they can read that person’s incoming connection and call setup messages, keep their dot online, move it, delete them, or send signals as if they were them.

**Evidence.**

- `app/page.tsx` creates one UUID and sends it as `id` / `fromId` with no accompanying secret.
- `GET /api/poll` rejects only a missing `id`. It heartbeats `where: { id }`, then selects `{ id, lat, lng, busy }` for every other fresh presence row and returns that list.
- The same handler loads `Signal` where `toId` equals the query id and deletes those rows after reading them. No check that this caller created the presence row.
- `POST /api/join` upserts any id of length 8–64. On conflict it overwrites `lat`, `lng`, and `lastSeen`. It does not prove the caller already owns the row.
- `POST /api/leave` deletes signals and presence for any non-empty id.
- `POST /api/signal` stores `fromId` from the JSON body. It never compares that value to an authenticated session.

**Exploitation.** A normal map session already receives every online id. A modified client, or any HTTP client, substitutes another id:

- Poll as that id and receive offer, answer, and ICE payloads, and delete them so the real browser never sees the request or the handshake.
- Post `accept` or `answer` / `ice` with `fromId` set to the victim. The initiator’s honest client treats `accept` as coming from the person they tapped (`app/page.tsx` only checks `sig.fromId === peerId`). The attacker finishes WebRTC as that person. Chat and video then terminate at the attacker. DTLS protects the path against a fourth party; it does not tell the initiator who completed the handshake.
- `POST /api/leave` with the victim id removes their dot and pending signals.
- `POST /api/join` with the victim id moves their public dot and keeps the row fresh after they have gone.

Guessing a UUID is not the issue. The id is published.

**Impact.** Impersonation, loss of connection requests, relocation or removal of any dot, and unauthorized access to the signaling needed to take a chat or video call.

**Recommended fix.** Split identity from authority, still without accounts.

- Keep a public dot id (random UUID) in `Presence` and in the peer list.
- Generate a second 256-bit secret in the page (`crypto.getRandomValues`). Hold it in memory only.
- Store `SHA-256(secret)` on the presence row. Compare with a timing-safe equality check.
- Require the secret on heartbeat, mailbox read, join-update, leave, and signal. Take it from the POST body or a request header. `sendBeacon` cannot set headers; the existing leave beacon can carry the secret in the body. A foreign site cannot beacon a secret it never saw, and there is no cookie to attach.
- Ignore a client-supplied `fromId` that does not match the authenticated row. Derive `fromId` on the server.
- `POST /api/join` should create the row. A second join for an existing id must present the same secret. A bare upsert must not move someone else’s dot.
- Return peer ids, offset coordinates, and `busy` to authenticated map clients. Do not return the secret, its hash, SDP, or ICE in the peer list.
- Keep using Postgres. An in-memory `Map` on one function instance is not shared with the next invocation, so it cannot back this API on Vercel.

---

### SEC-002 — Busy flags and signaling are not tied to a real pair

|          |                                                                        |
| -------- | ---------------------------------------------------------------------- |
| Severity | High                                                                   |
| Status   | Confirmed                                                              |
| Affected | `POST /api/signal` (`app/api/signal/route.ts`), `prisma/schema.prisma` |

**Description.** Even if we stop people from pretending to be someone else (SEC-001), a logged-in session can still mess with strangers. Accept, decline, and end flip the “busy” flag for whatever two ids you send. Call-setup messages can be dropped into anyone’s inbox. The server never writes down “these two people actually agreed to talk,” so it cannot tell a real call from a random request.

**Evidence.**

- On `accept`, `updateMany` sets `busy: true` for `[fromId, toId]` with no pending-request check and no test that either row is free at the moment of the write.
- On `decline` or `end`, the same pair is set `busy: false`, including when those users are in a call with other people.
- The `request` branch reads `target.busy` and later inserts a signal as two separate steps. Two requests can both observe `busy: false`.
- The sender’s own `busy` value is never read. The “one connection” rule is enforced in `requestConnection` in `app/page.tsx` (`connRef.current.kind !== "idle"`), which a custom client skips.
- Non-request types are inserted whenever `fromId` and `toId` are strings. They are not required to be current peers. `fromId === toId` is allowed. Id length is not limited on this route (join limits length; signal and poll do not).

**Exploitation.** Using the attacker’s own legitimate session:

- `POST` `accept` with `toId` set to a stranger. That stranger’s row becomes `busy`, and `GET /api/signal`’s request path auto-declines new requests aimed at them.
- `POST` `end` or `decline` while two other people are connected and clear `busy`, so the one-connection rule no longer holds.
- Flood a mailbox with `offer` / `ice` payloads up to 64 KB each. The honest client ignores signaling whose `fromId` is not the current peer, so this is disruption and storage cost more than a silent microphone. Forged `fromId` (SEC-001) is what turns it into call takeover.

**Impact.** Any session can lock or unlock another session’s availability and write into its mailbox. The one-active-connection rule is not a server guarantee.

**Recommended fix.** Add a transient pair, not a user account.

- On `request`, insert a short-lived request row only when the target presence exists and a conditional update finds the target not busy. If the target is gone or busy, keep the current auto-decline behavior, and authenticate the initiator so the decline cannot be aimed at an arbitrary third id.
- On `accept`, insert one connection row for the two public ids inside a single statement that fails if either id is already present (unique constraint on each participant). Set both presence rows’ peer pointer only if that insert succeeds. Reject the accept when no matching unanswered request exists or the caller is not the target.
- Allow `offer`, `answer`, `ice`, and `end` only when a connection row links the authenticated caller to `toId`.
- Allow `decline` only for the authenticated target of a pending request, or for the server-generated auto-decline.
- Reject `fromId === toId`. Validate both ids as UUIDs with the same length rules as join.
- Order writes so two simultaneous accepts cannot both succeed. Prefer one `INSERT` that violates a unique constraint over a read-then-write check. The signal route comments already avoid interactive transactions because of PgBouncer transaction mode; keep this to single statements.
- Delete the connection row and clear both peer pointers on `end`, `leave`, and stale reap (see SEC-003).

---

### SEC-003 — Leaving does not release the other participant

|          |                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | High                                                                                                                                          |
| Status   | Confirmed                                                                                                                                     |
| Affected | `POST /api/leave` (`app/api/leave/route.ts`), `GET /api/poll` stale delete (`app/api/poll/route.ts`), `app/page.tsx` (`teardown`, `pagehide`) |

**Description.** When two people connect, both are marked busy. That mark is only cleared if someone sends “decline” or “end.” Closing the tab does not send “end.” It just deletes the person who left. The server does not remember who they were talking to, so the other person stays busy. If the tab crashes and the leave message never arrives, the same thing happens a few seconds later when their row is cleaned up. The person who is still there also does not tell the server when the call drops, so they can stay stuck.

**Evidence.**

- `app/page.tsx` `pagehide` / `beforeunload` call `leave(sessionId)` only.
- `app/api/leave/route.ts` deletes signals where `toId` or `fromId` matches, then deletes that presence row.
- `onConnectionState` calls `teardown` on `"failed"`. `teardown` closes the peer connection and sets local state to idle. It does not call `sendSignal(..., "end")`.
- Poll deletes stale presence with `deleteMany` on `lastSeen` and does not update any other row’s `busy` flag.
- While the survivor’s tab stays open, poll keeps updating their `lastSeen`, so their own row never goes stale. New requests to them hit `target.busy` and are auto-declined.

**Exploitation.** Person A and B connect. A closes the tab. B remains on the map, still marked busy, and new callers are told the request was declined. The same lock is immediate for an attacker who can call `leave` as A (SEC-001). No attacker is required for the ordinary tab-close case.

**Impact.** A user who did nothing wrong cannot receive a new connection until they reload. Combined with SEC-001, anyone who can see a dot can force that user’s partner into this state.

**Recommended fix.** Persist the partner id on the transient connection row from SEC-002.

- `leave`, authenticated, loads that pair, writes one `end` signal to the partner, clears the partner’s `busy` / peer pointer, deletes the connection row, then deletes the leaver.
- Stale reap selects expired rows that still have a partner, releases those partners the same way, then deletes. A blind `deleteMany` cannot do this.
- When the client observes ICE `failed` or `disconnected` past a short grace period, send `end` before `teardown`, so a dead peer connection also clears the server flag if the process is still alive.
- Keep the 15-second stale window. It is the right backstop when `pagehide` never fires.

---

### SEC-004 — Unbounded anonymous writes and per-poll database work

|          |                                                                                       |
| -------- | ------------------------------------------------------------------------------------- |
| Severity | High                                                                                  |
| Status   | Confirmed                                                                             |
| Affected | All four route handlers; `lib/presence.ts`; `app/api/signal/route.ts` (`MAX_PAYLOAD`) |

**Description.** Nothing stops someone from doing this a huge number of times. They can create as many dots as they want, and pile up unread call-setup messages. Every time anyone checks the map, the server also cleans the whole table and loads every online person. Big request bodies are read before the size check kicks in. That is enough to fill the map with fake people and make the database work very hard. They do not need to break encryption to do it.

**Evidence.**

- `POST /api/join` creates a row for every new id of length 8–64. The client will open one per tab; the API will open as many as it is given.
- `POST /api/signal` inserts a row per call. `MAX_PAYLOAD` (64 KB) is checked only after `request.json()` returns. A body can be large and still fail the check, or many 64 KB rows can sit until the 60-second TTL.
- `GET /api/poll` has no proof of membership. Each call updates a heartbeat, deletes stale presence globally, deletes old signals globally, lists all peers, and lists a mailbox.
- Poll interval is 1.5 seconds, so each honest tab is already a steady query stream. Extra tabs multiply it without a ceiling.
- Vercel’s platform body limit (about 4.5 MB) bounds a single request. The application still does the parse and the follow-on queries up to that limit.
- No `middleware.ts`, no firewall config in the repo, no per-IP counter. Storing IPs in Postgres to build a counter would add personal data the product forbids; the limit belongs at the edge.

**Exploitation.** A short script joins thousands of ids and polls them, or posts large `ice` payloads at many real `toId`s. The map fills with dots. Database connections and delete/list work grow with the poll fan-out. A warm serverless isolate reuses one Prisma client (`lib/prisma.ts`); a spike of cold isolates plus a non-pooled `DATABASE_URL` can exhaust Postgres connections. Whether the deployed URL is pooled was not checked (the secret was not read).

**Impact.** Denial of service and avoidable database cost. Fake dots also make the map untrustworthy. This remains after SEC-001, because anonymity still allows many real sessions.

**Recommended fix.**

- On Vercel Firewall, rate-limit the four `/api/*` routes by IP. Suggested starting point to tune under load: on the order of a few joins per minute per IP, and a few dozen signal and poll calls per minute per IP. Shared NATs will share that budget; keep the numbers high enough for a household and low enough to stop a flood. Do not store IP addresses in `Presence`.
- Reject `Content-Length` above a small cap before reading the body (about 1 KB for join and leave, about 70 KB for signal).
- Cap unread signals per `toId` (for example 30) and reject further inserts.
- Validate UUID shape on every route so a multi-kilobyte string cannot be a primary key.
- Keep the global stale delete indexed (`@@index([lastSeen])` already exists). Optionally run it at most once per few seconds via a single “last reap” row so a poll storm does not repeat the same delete. That row is operational, not user data.

---

### SEC-005 — Exact coordinates stay on the client and center the map

|          |                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Severity | Medium                                                                                                            |
| Status   | Confirmed for client retention and server behavior; Mapbox does not receive a separate “save this GPS point” call |
| Affected | `app/components/EntryGate.tsx`, `app/page.tsx`, `app/components/WorldMap.tsx`, `POST /api/join`, `lib/geo.ts`     |

**Description.** The server does move your dot 1–3 km away before saving it, and other people only see that moved spot. Your own browser still keeps the exact GPS point for the whole visit. The “Me” pin and the opening camera sit on that exact point. Joining sends the exact point to the server once. The server answers “ok” and does not send it back.

**Evidence.**

- `EntryGate` calls `getCurrentPosition` with `enableHighAccuracy: true` and `maximumAge: 0`, then passes `coords.latitude` / `longitude` to `handleReady`.
- `handleReady` stores that pair in `myLocation` and also posts it to `/api/join`.
- `applyPrivacyOffset` runs only on the server. The upsert writes `offset.lat` / `offset.lng`. The schema comment matches the code: raw coordinates are not a column.
- Poll selects those stored floats for peers. It does not read a raw column.
- `WorldMap` initializes `center` from `me` and sets the self marker with `setLngLat([me.lng, me.lat])`. Peer markers use `peer.lng` / `peer.lat` from poll.
- Mapbox GL does not upload marker coordinates as their own API. Tile requests follow the viewport. The first zoom is 4 when `me` is set, which is a wide tile. Zooming in on the exact pin makes later tile requests correspond to that precise area. The raw point also remains in JavaScript memory and in the join request body.

**Exploitation.** Another Pulse user cannot fetch the victim’s original coordinates from the API. The exposure is the user’s own browser, the one-time join request, and a zoomed Mapbox viewport centered on the un-offset fix. A screen share of the “Me” pin is the exact point, while everyone else sees a different dot.

**Impact.** The privacy offset protects other sessions. It does not limit how precise a fix the app asks for, or how long the page keeps it. That misses the spirit of “location is only used to place the dot” and “not at their exact coordinates” for the pin the user is shown.

**Recommended fix.**

- Return the offset coordinate from `POST /api/join` (it is already the public dot) and store that in React state for the camera and the self pin. Drop the raw fix from state after the request completes.
- Keep computing the offset on the server so a modified client cannot publish an un-offset dot.
- `enableHighAccuracy: false` is a reasonable follow-on. A 1–3 km public dot does not need a fresh GPS lock. This can make the first fix less accurate; call that out in the UI if you change it.
- Do not log join bodies.

---

### SEC-006 — Forgotten sessions sit in Postgres until some client polls

|          |                                                              |
| -------- | ------------------------------------------------------------ |
| Severity | Medium                                                       |
| Status   | Confirmed                                                    |
| Affected | `GET /api/poll` (`app/api/poll/route.ts`), `lib/presence.ts` |

**Description.** Old dots are supposed to disappear after 15 seconds, and old call-setup messages after 60 seconds. That cleanup only runs when someone polls the map. Leaving deletes just that one person right away. If the last tab crashes and nobody else is polling, nothing deletes the leftovers. The moved location, the busy flag, and any call-setup messages can sit in the database much longer than those timers.

**Evidence.** The only `presence.deleteMany` for staleness and the only `signal.deleteMany` for `createdAt` are in `GET /api/poll`. Join, signal, and leave do not reap other users. There is no scheduled function in the repo.

**Exploitation.** No cross-user read beyond SEC-001 is required. This is retention. On a busy deployment, some other poller will reap within about 15–60 seconds. On a quiet one, the last crashed session remains until the next poll, which may be hours. Signal payloads can contain ICE candidates. Browsers often mDNS-hide host addresses; that was not measured here, so treat IP leakage inside SDP as possible, not proven.

**Impact.** The server can hold location and signaling after the session is over. That conflicts with “the server holds no data about a user once their session ends,” even though a short TTL during an active map is consistent with the README.

**Recommended fix.**

- Reap at the start of join and signal as well as poll, so any API traffic advances cleanup.
- When a connection row exists, include partner release (SEC-003) in that reap.
- A Vercel Cron route inside this same Next.js project can run the same delete on a one-minute schedule for an otherwise idle project. That is still one deployment, not a new vendor. If you skip cron, document that an idle project retains the last crashed rows.
- Do not log signal payloads.

---

### SEC-007 — Mailbox drain and busy checks are not atomic

|          |                                                 |
| -------- | ----------------------------------------------- |
| Severity | Medium                                          |
| Status   | Confirmed in code (not executed as a live race) |
| Affected | `GET /api/poll`, `POST /api/signal`             |

**Description.** If two checks for the same person overlap, both can read the same messages and both can delete them, so both callers get a copy. Two connection requests at the same moment can both see “not busy” and both go through. If two people request each other and both hit accept, each browser waits for the other to start the call, so the chat channel never opens.

**Evidence.**

- Poll: `findMany` by `toId`, then `deleteMany` by the ids returned. The comment explains why the delete is limited to those ids (a new insert must survive). It does not lock the rows. The honest client waits for one poll to finish before scheduling the next, so a single tab does not overlap itself. Two clients using one id do.
- Signal: `findUnique` of `busy`, then later `signal.create`, with no conditional update.
- `app/page.tsx`: the requester becomes the WebRTC initiator only when they receive `accept`. The accepter always passes `initiator: false`.

**Exploitation.** Under SEC-001 the double read is how an attacker and the victim can both observe one offer. After ids are no longer bearer tokens, the remaining bug is duplicate delivery under a retried poll, a double accept, and the mutual-request glare case that never opens chat.

**Impact.** Lost or duplicated signaling, two sessions marked busy incorrectly, or a connection UI that never opens a data channel.

**Recommended fix.** Do this in the same change as SEC-002, because it is the same code.

- Drain with one statement: delete the recipient’s pending signals and return them (`DELETE ... WHERE "toId" = $id RETURNING ...`, or a single conditional claim). Avoid a multi-round interactive transaction on a transaction-mode pooler.
- Claim the pair with one unique insert, as in SEC-002.
- For mutual requests, define one rule (for example, lower public id is the initiator) and send it in the accept result so both clients construct `PeerSession` with complementary roles.

---

### SEC-008 — No baseline security headers

|          |                                                                              |
| -------- | ---------------------------------------------------------------------------- |
| Severity | Medium                                                                       |
| Status   | Confirmed (headers absent in config; live response headers were not fetched) |
| Affected | `next.config.ts`, `app/layout.tsx`; every route                              |

**Description.** The app does not send the usual browser safety headers. Another site can still put Pulse inside a frame. The browser is not told to hide the page address when it loads the map, and it is not told which device permissions this site should be allowed to ask for. The map refresh is already set up not to be cached, but the API responses themselves never say “do not store this.”

**Evidence.** `next.config.ts` only contains `allowedDevOrigins`. There is no `middleware.ts` and no `headers()` export. Grep of the repo found no CSP or `Cache-Control`.

**Exploitation.** The accept and video prompts are full-screen consent dialogs. A page that frames the Vercel origin can overlay those buttons (clickjacking) if the browser allows framing. There is no cookie session to steal this way; the practical trick is “click accept” while the victim thinks they are clicking something else. Missing `nosniff` and a loose referrer are weaker follow-on issues. A shared cache in front of poll would be serious because the URL identifies the mailbox; that cache behavior was not observed on a deployment, so it stays a hardening item next to `force-dynamic`.

**Impact.** UI redress on Accept / Decline. Weaker containment if a future XSS bug lands. Possible mailbox caching if a layer ignores the framework default.

**Recommended fix.** Add headers on all routes:

- `Content-Security-Policy` that allows this origin plus the Mapbox endpoints the style actually loads (`api.mapbox.com`, `*.tiles.mapbox.com`, `events.mapbox.com`, and the worker/blob sources Mapbox GL needs). Avoid `unsafe-eval` unless a production build of Mapbox fails without it; test the map when adding the policy.
- `frame-ancestors 'none'` (or `X-Frame-Options: DENY`).
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- `Permissions-Policy: geolocation=(self), camera=(self), microphone=(self)`.
- On every API response, `Cache-Control: no-store`.

HSTS is provided by Vercel for `https` deployments. CSP will break the map if a host is omitted; treat a quick map load as part of the change.

---

### SEC-009 — Mapbox token is public by design, with a hardcoded fallback and no restriction in repo

|          |                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | Medium                                                                                                                                                    |
| Status   | Confirmed in source for exposure and the fallback; URL and scope restrictions are suspected because they live in the Mapbox account, which was not opened |
| Affected | `app/components/WorldMap.tsx`, `.env.example`                                                                                                             |

**Description.** The map needs a public Mapbox token in the browser. That is normal, and there is no secret Mapbox token in the code. The server never calls Mapbox, so people cannot run up the bill by hitting a Pulse API. Two things are still weak. If the env token is missing, the page uses a fake token baked into the file, so the “you forgot your token” message never shows. Nothing in the repo limits the real token to Pulse’s website or to just the map style it uses. Someone can copy the token out of the page and use it on their own site until you lock it in the Mapbox dashboard.

**Evidence.**

- `WorldMap.tsx` sets `TOKEN` from `NEXT_PUBLIC_MAPBOX_TOKEN`, otherwise a literal `pk.` value. The literal’s signature is a run of `A` characters and is not a usable Mapbox signature. It is still embedded in the client bundle. The full string is omitted here on purpose.
- The style is `mapbox://styles/mapbox/dark-v11`. No Geocoding, Directions, or Matrix calls exist.
- `.env.example` lists only `NEXT_PUBLIC_MAPBOX_TOKEN` and `DATABASE_URL`. `.env` is gitignored (`.gitignore` rule `.env*`, exception `.env.example`). It was not opened for this review.

**Exploitation.** Someone reuses an unrestricted project token from the built JavaScript and consumes the Mapbox quota from their own pages. The hardcoded fallback does not by itself grant that access; it defeats the missing-token guard and is one edit away from a real token committed in source.

**Impact.** Unexpected Mapbox billing and a token that is harder to reason about. No server-side Mapbox credential disclosure was found.

**Recommended fix.** Keep Mapbox GL and the public token.

- Remove the hardcoded fallback so a missing token fails closed and the existing warning can render.
- In the Mapbox account, restrict the token to the production URL, preview URLs you actually use, and `localhost`. Limit scopes to what GL JS needs for a public style (styles, tiles, fonts). Do not mint a secret token; Pulse has no server-side Mapbox API.
- Rotate the token if it has ever shipped without a URL restriction.
- Continue to avoid returning session secrets or raw coordinates in any map payload. Current peer JSON is `id`, offset `lat`, `lng`, `busy`. After SEC-001 the id is public by design; the secret must stay out of that JSON.

---

### SEC-010 — `next` is inside a published critical advisory range

|          |                                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Severity | Medium                                                                           |
| Status   | Confirmed for the advisory range; exploitation in this codebase is not confirmed |
| Affected | `package.json` (`next` `16.2.7`), lockfile transitive packages                   |

**Description.** The installed Next.js version is on a list of versions with known serious bugs. Those bugs are mostly in image handling, server actions, and middleware. This app does not use those features, so this review does not say Pulse is confirmed hackable through them. You should still upgrade before launch so you are not shipping a framework version that is already flagged.

The same audit lists high findings in packages pulled in by Next and Prisma (`sharp`, `postcss`, `hono`, `mysql2`, and others). The database path in `lib/prisma.ts` is the `pg` adapter, not `mysql2`. Hono is not the HTTP server for these routes. They should be cleared by upgrading, and they are not separate Pulse vulnerabilities.

**Evidence.** `package.json` depends on `next` `16.2.7`. Production audit metadata: 1 critical, 10 high, 4 moderate. Application source search found no Server Actions and no image or OG usage.

**Exploitation.** Not demonstrated. A default `next start` or Vercel image pipeline can still expose optimizer routes that the UI never links to. That is why the upgrade belongs before launch rather than in a “we don’t call that API” note.

**Impact.** Latent framework bugs with publicly fixed versions, including historical unauthenticated image-optimizer issues, remain on the version you would ship.

**Recommended fix.** Upgrade `next` (and `eslint-config-next`) past the fixed release shown by a fresh `npm audit`, then re-run the audit and read what is left. Do not bulk-ignore the tree. Re-test map, poll, and a two-browser call after the upgrade. No upgrade was applied in this review.

---

### SEC-011 — Chat and control messages have no size limit

|          |                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------- |
| Severity | Low                                                                                             |
| Status   | Confirmed                                                                                       |
| Affected | `lib/webrtc.ts` (`wireDataChannel`, `sendChat`), `app/components/ChatPanel.tsx`, `app/page.tsx` |

**Description.** Chat never goes through the server, which is what we want. Once two people are connected, either one can send a message of any size. The chat screen shows that text as plain text, so a message full of HTML does not run as code. The only raw HTML in the map is the fixed “Me” label, not something a user typed.

**Evidence.** `wireDataChannel` checks `typeof msg.text === "string"` and calls `onChat`. `addMessage` appends to React state. `ChatPanel` outputs `{m.text}`.

**Exploitation.** The peer you already accepted sends a multi-megabyte data-channel message and the tab retains it until End. They cannot inject markup that runs as script through the current renderer. They cannot read the message from the server, from another user, or after `teardown`, which clears `messages`.

**Impact.** Client resource abuse inside an accepted chat. Cross-site scripting was not found.

**Recommended fix.** Ignore inbound chat above a small limit (for example 2 KB) and ignore `ctrl` values outside `video-request`, `video-accept`, `video-decline`, and `video-end`. Disable send in the existing `connected` check (already present) and keep rendering through React text.

---

### SEC-012 — The privacy offset can collapse below 1 km at the poles

|          |                                        |
| -------- | -------------------------------------- |
| Severity | Low                                    |
| Status   | Confirmed by inspection of the formula |
| Affected | `lib/geo.ts`                           |

**Description.** The app picks a random direction and moves the dot between 1 and 3 km. If someone is already very close to the North or South Pole and the random direction points at the pole, the dot gets stopped at the pole and can end up less than 1 km from the real spot. For normal places on the map this is fine. One moved dot does not let someone calculate the original GPS point.

**Evidence.** `applyPrivacyOffset` and `clamp`. Join calls this once per successful join, so a normal session keeps one offset. A new page load creates a new id and a new offset.

**Exploitation.** This does not reveal a general user’s exact location. It weakens the promised minimum offset for a fix at the pole.

**Impact.** Narrow privacy-margin miss for polar coordinates.

**Recommended fix.** If the clamped point is under 1 km from the input, pick a new bearing away from the pole and apply again. Reject non-finite values (already done in `isValidLatLng`).

---

### SEC-013 — A dev tunnel host is committed in Next config

|          |                  |
| -------- | ---------------- |
| Severity | Low              |
| Status   | Confirmed        |
| Affected | `next.config.ts` |

**Description.** The Next.js config still names an old ngrok dev tunnel. That setting only matters while you are running the dev server. It is not a password, and the live site does not use it to allow API calls. It is just a tunnel hostname left in the repo.

**Evidence.** `next.config.ts` lines 4–6.

**Impact.** Low. Anyone reading the repo learns a dev tunnel hostname that may no longer be yours. If `next dev` is run with that origin still allowed, that host can load dev resources.

**Recommended fix.** Remove the entry before production, or gate it so only local development sets it. Do not treat the hostname as a credential; do not keep unused tunnel names in the deployed config.

---

### SEC-014 — Remote media can be received before video is accepted

|          |                                                           |
| -------- | --------------------------------------------------------- |
| Severity | Low                                                       |
| Status   | Confirmed                                                 |
| Affected | `lib/webrtc.ts` (`ontrack`, `startVideo`), `app/page.tsx` |

**Description.** Your camera and mic only turn on after you accept video. The video screen only shows up then. Someone who already has a chat with you, and who changed their own client, can start sending video before you accept. Your browser receives it quietly. The screen does not show it until you accept. Nothing in the app records the call or saves the video. Hanging up stops the camera.

**Evidence.** `pc.ontrack` forwards `streams[0]`. `startVideo` is the only `getUserMedia` call. `VideoPanel` is conditional on `video === "active"`.

**Impact.** A person you already accepted for text can push media into the peer connection early. They still cannot turn your camera on; that requires the local `getUserMedia` prompt. There is no server-side recording path.

**Recommended fix.** Ignore `ontrack` until video state is `active` or `requesting`/`incoming` as you prefer, and stop unexpected receivers. Keep the accept step on the data channel. No recording feature should be added.

---

### SEC-015 — External services the product already depends on

|          |                                                                                               |
| -------- | --------------------------------------------------------------------------------------------- |
| Severity | Informational                                                                                 |
| Status   | Informational                                                                                 |
| Affected | `prisma/schema.prisma`, `lib/prisma.ts`, `lib/webrtc.ts`, `README.md`, `docs/requirements.md` |

**Description.** The requirements say “no outside services” and “keep nothing after the session.” The README and the code use Postgres, Mapbox, and Google’s STUN server. Those two docs do not match. The app follows the README. This is a design note, not a bug by itself.

Postgres is what makes a temporary session visible to more than one serverless instance. Replacing it with process memory would fail closed on the next isolate: dots and mailboxes would split or vanish. That is worse on Vercel, not better. The privacy work is short TTL, partner release, and access control (SEC-001, SEC-003, SEC-006), not a new database brand and not an in-memory store.

Google STUN sees the IP addresses of clients who gather candidates. The README already accepts STUN-only and says not to add TURN. This review does not recommend a TURN vendor.

**Recommended direction.** Keep Postgres, Mapbox, and STUN. State in `NOTES.md` that “no external services” is satisfied relative to extra products beyond this stack, and that coordination data is transient rather than absent. Do not introduce accounts to paper over SEC-001.

---

### SEC-016 — Location and presence are client-asserted

|          |                                |
| -------- | ------------------------------ |
| Severity | Informational                  |
| Status   | Informational                  |
| Affected | `POST /api/join`, `lib/geo.ts` |

**Description.** The browser tells the server where you are. The server checks that the numbers look like a real lat/lng, then moves the dot 1–3 km. It cannot tell a real GPS reading from a location someone typed. So a person can place their own dot near any place on earth, including near someone they see on the map. They still cannot save or fetch the exact point from the API.

**Impact.** This is the anonymous map working as designed. Device attestation or a location-proof service would fight the “no accounts, no extra services” rules and would not be reliable in a browser.

**Recommended direction.** Keep server-side range checks and the offset. Pair with SEC-004 so one client cannot stampede the map with thousands of claimed locations. No further location proof.

---

### SEC-017 — Cookies, CSRF, and CORS are not the missing control

|          |                              |
| -------- | ---------------------------- |
| Severity | Informational                |
| Status   | Confirmed observation        |
| Affected | All API routes, `lib/api.ts` |

**Description.** Pulse does not use a login cookie. A random website cannot quietly act as you inside your browser. That is not the hole. Today they do not need your browser at all: the map response includes everyone’s id, and they can call the API themselves with that id. The default browser rules stop another webpage from reading your poll results. They do not stop someone from calling poll on their own computer.

**Impact.** Adding CSRF tokens or a cookie session would create a new cross-site problem and a persistent identifier. It would not fix SEC-001.

**Recommended direction.** Keep cookie-less requests. Put the session secret in the body or a header as described in SEC-001. Custom headers cause a preflight, and you should not add a permissive CORS policy.

---

### Controls that were checked and hold

- Chat and video bytes are not Prisma models and are not written by the route handlers. Server storage for a call is SDP/ICE in `Signal.payload` until drain or TTL.
- Chat renders as text. No user-controlled HTML sink was found.
- Join writes offset coordinates only. Poll does not echo the raw fix.
- A new page load creates a new UUID and, on join, a new offset.
- Queries go through Prisma. No string-built SQL was found.
- `.env` is gitignored. `.env.example` contains placeholders. This review did not print secret values.
- Production Prisma logging is `error` only (`lib/prisma.ts`). Query text is not enabled in code. Error objects can still include parameters; avoid logging request bodies when you add error handling.
- Camera and microphone are requested on video accept, not on entry. Tracks are stopped on end and on close.
- Messages in React state are cleared in `teardown`. No `localStorage` or `sessionStorage` usage was found.
- `request` auto-decline when the target is missing or busy is the right product rule; it needs the authentication and pair checks above so it cannot be aimed by a third party.

---

## 4. Remediation Checklist

No item below is implemented.

### Phase 1 — Must fix before launch

#### SEC-001 — Separate the public dot id from a session secret

- **Why.** The map hands every client the bearer token for every session, including the mailbox that carries WebRTC signaling.
- **Approach.** Public UUID in `Presence.id`. 256-bit secret in page memory; store only its SHA-256. Require it for heartbeat, inbox, join update, leave, and signal. Derive `fromId` from the authenticated row. Create-on-join instead of an unauthenticated upsert. Deliver the secret in the leave beacon body, not a cookie and not the poll query string (query strings land in access logs).
- **After the fix.** A poll response still lists dots. Knowing a dot’s id does not drain that user’s mailbox, move them, delete them, or complete a handshake as them.
- **Dependencies.** Design this with SEC-002 and SEC-003. A secret that only stamps `fromId`, without a connection row and without partner release, leaves the high findings in place. Keep Postgres. Do not add logins.

#### SEC-002 — Authorize every signal against a transient pair

- **Why.** `busy` and the mailbox can be changed for arbitrary ids. The one-connection rule lives in the React client.
- **Approach.** Pending-request rows and one connection row with a unique constraint per participant. Conditional single-statement writes so two accepts cannot both win. `offer` / `answer` / `ice` / `end` only between the two connected ids. `decline` only by the real target or by the server’s auto-decline. UUID validation on every route. While editing poll, drain the mailbox with one `DELETE ... RETURNING` (SEC-007) so the new auth check is not paired with a double-read.
- **After the fix.** A session can request, accept, signal, and hang up only for its own pending request or active pair. A second accept while busy fails. Two users can still only be in one active pair each.
- **Dependencies.** SEC-001 for the caller’s identity. PgBouncer-safe single statements, matching the comment already in the signal route.

#### SEC-003 — Release the partner when a session ends

- **Why.** Tab close and stale delete leave the other person busy until they reload, and the server then auto-declines new people.
- **Approach.** On authenticated leave, and when reap deletes a stale row that still has a partner: enqueue `end`, clear the partner’s `busy` and peer pointer, delete the connection, then delete the leaver. From the client, send `end` when ICE fails, not only when the user presses End.
- **After the fix.** The survivor can receive a new request after the partner leaves or times out, without reloading. Their UI also returns to idle when the `end` signal arrives (this path already exists for `sig.type === "end"`).
- **Dependencies.** The connection row from SEC-002. The 15-second `STALE_MS` window stays.

#### SEC-004 — Put ceilings on anonymous traffic

- **Why.** Authentication does not stop someone from opening many real sessions or writing large mailbox rows. Every poll also touches the global tables.
- **Approach.** Vercel Firewall rate limits by IP on `/api/join`, `/api/poll`, `/api/signal`, and `/api/leave`. Reject oversized `Content-Length` before `json()` / `text()`. Cap queued signals per recipient. Confirm `DATABASE_URL` is a pooled connection string in the Vercel project (do not commit it). Optionally throttle how often a poll performs the global reap.
- **After the fix.** One client cannot create an unbounded crowd of dots or a backlog of 64 KB payloads. Honest two-tab use still works. IP addresses are not written into Pulse tables.
- **Dependencies.** None. Can ship beside SEC-001. Limits need a pass against real polling (one poll per 1.5 seconds per tab) so the threshold is not lower than normal use.

### Phase 2 — Important security improvements

#### SEC-005 — Stop retaining the raw fix in the page

- **Why.** Other users already see the offset. The user’s own map still aims at the precise fix for the whole session.
- **Approach.** Return the offset from join, use it for the camera and the self pin, then drop the raw coordinates from state. Keep the offset function on the server.
- **After the fix.** The pin other people see and the pin you see are the same offset point. The join request is the only moment the precise fix is sent, and it is not stored.
- **Dependencies.** None. Optional: `enableHighAccuracy: false`, with a product note that the first fix may be coarser.

#### SEC-006 — Reap even when the map is quiet

- **Why.** TTLs advance only when some client polls. A crashed last user can remain stored.
- **Approach.** Run the same stale delete from join and signal. Include partner release. Add a one-minute Cron route in this project if idle retention must be bounded; otherwise document the idle case.
- **After the fix.** Offset coordinates and SDP leftovers are removed on the TTL even if the leaver’s beacon was lost, including when the partner must be unlocked.
- **Dependencies.** SEC-003’s partner pointer, or the reap will keep the stuck-busy bug for crashed users.

#### SEC-007 — Close the remaining races

- **Why.** Read-then-delete mailbox delivery and read-then-write `busy` checks lose under overlap, and a mutual request makes both clients the polite peer.
- **Approach.** If Phase 1 already used a unique connection insert and `DELETE ... RETURNING`, verify those two cases and the mutual-request initiator rule. If Phase 1 only added a secret, do the atomic claim now.
- **After the fix.** One poll consumer receives each signal. Two simultaneous accepts produce one connection. Mutual connect opens one data channel.
- **Dependencies.** SEC-002.

#### SEC-008 — Send security headers and `Cache-Control: no-store`

- **Why.** Accept dialogs can be framed. API responses rely on framework defaults for caching.
- **Approach.** CSP compatible with Mapbox GL, `frame-ancestors 'none'`, `no-referrer`, `nosniff`, a tight Permissions-Policy, and `Cache-Control: no-store` on the four APIs. Load the map afterward and confirm tiles and the style still work.
- **After the fix.** The app will not load inside another origin’s frame. Poll and signal responses ask caches not to store them.
- **Dependencies.** CSP must list the Mapbox hosts you actually see in the network panel.

#### SEC-009 — Lock down the Mapbox public token

- **Why.** The `pk.` token is visible in the client, which GL JS requires. An unrestricted token can be reused, and the hardcoded fallback hides a missing configuration.
- **Approach.** Delete the fallback literal. In the Mapbox dashboard, set allowed URLs and the smallest scope that loads `dark-v11`. Rotate if the current token was ever unrestricted. Do not add a secret Mapbox token or a server proxy.
- **After the fix.** The map loads with the env token. A copied token fails from other origins. Missing env shows the current empty state instead of a fake token.
- **Dependencies.** The production and preview hostnames.

#### SEC-010 — Upgrade Next.js out of the advisory range

- **Why.** `next@16.2.7` falls in the range `npm audit` marked critical. This app does not use the image or Server Action APIs those advisories describe; the patched package should still be what you deploy.
- **Approach.** Upgrade `next` and `eslint-config-next` to a release newer than the audited vulnerable range, re-run `npm audit --omit=dev`, and smoke-test two browsers: both dots, accept, chat, video, end, tab close.
- **After the fix.** The framework version is no longer inside that aggregated critical range, or any remaining advisory is written down with a reason it does not apply.
- **Dependencies.** Do this after the API behavior changes, or retest the API again after the upgrade. No dependency was changed during this review.

### Phase 3 — Additional hardening

#### SEC-011 — Cap data-channel payloads

- **Why.** A partner can push an enormous chat string into React state. XSS was not found.
- **Approach.** Drop chat text above about 2 KB and drop unknown `ctrl` values.
- **After the fix.** The open channel still carries normal messages. A huge payload does not stay in memory.
- **Dependencies.** None.

#### SEC-012 — Keep the polar offset at least 1 km

- **Why.** Clamping latitude at ±90 can leave the stored point closer than 1 km to a polar fix.
- **Approach.** Re-roll the bearing when the post-clamp distance is under 1 km.
- **After the fix.** Stored dots stay inside the 1–3 km band, including at the poles.
- **Dependencies.** None.

#### SEC-013 — Remove the committed ngrok dev origin

- **Why.** The repo publishes a specific dev tunnel host inside `allowedDevOrigins`.
- **Approach.** Delete it, or set it only in local development.
- **After the fix.** Production config does not name that tunnel.
- **Dependencies.** None.

#### SEC-014 — Ignore unexpected media tracks

- **Why.** A modified peer can attach tracks before the video accept step. The UI hides them; the peer connection still receives them.
- **Approach.** Handle `ontrack` only once video has been accepted locally, and stop other receivers.
- **After the fix.** Text chat does not start receiving a remote camera stream early. Local camera still starts only after accept and the browser permission prompt.
- **Dependencies.** None.

#### Logging and errors (defense in depth, no separate finding id)

- Wrap Prisma calls and return the same generic JSON error you already use for bad input. Do not include query text, coordinates, or SDP in the response.
- Leave Prisma production logs at errors, and do not add request-body logging for join or signal.
- Keep the session secret out of URLs.

---

## 5. Architectural Concerns

**Anonymity still works with a secret.** The secret is a capability for one tab, forgotten when the tab closes. It is not an account, not an email, and not a durable profile. The public id can stay on the map.

**Do not put sessions in memory.** Vercel will run these routes on many instances. `globalThis` in `lib/prisma.ts` only reuses a database client inside one warm isolate. Presence and mailboxes already live in Postgres so every instance sees them. That is the right layout. The failure is missing authorization and cleanup, not the choice of a shared database.

**Statelessness is “deleted when the session ends,” not “never written.”** README is explicit that Postgres holds presence and signaling transiently, and that chat and video stay on the peer connection. Requirements text is stricter. The implementation matches the README for chat and video. It does not match either document for signaling access (anyone who knows the id) or for cleanup (partner `busy`, reap only on poll).

**Serverless consistency.** Two browsers can see one dot because the row is in Postgres. They can also both steal one mailbox because poll is a read and a later delete. Fix the SQL, not the hosting model.

**Privacy of location.** The offset is applied once per join, server-side, and a new session gets a new draw. That meets the 1–3 km rule for ordinary latitudes (SEC-012 is the pole). The remaining location issues are client retention (SEC-005), client-supplied coordinates (SEC-016), and retention when no poller exists (SEC-006).

**Mapbox.** Client-only GL JS is consistent with “no Mapbox secret on the server.” Billing abuse is token reuse, which URL restrictions address, not a server endpoint to rate-limit. Tile requests reveal the viewport the user is looking at. Centering that viewport on the offset dot (SEC-005) avoids aiming it at the raw fix.

**WebRTC trust.** Media and chat are encrypted to the peer that negotiated the connection. The server is not in the media path. The server is the phone book for SDP. An unauthenticated phone book means the encrypted peer can be the wrong person. Fix the phone book; do not route chat back through the server to “inspect” it. That would weaken the privacy requirement.

**STUN.** `stun.l.google.com` is a third party that sees client IPs during candidate gathering. README forbids adding TURN for this assessment. Leave it.

**One connection.** The flag `Presence.busy` cannot represent “busy with whom,” so leave and reap cannot repair the partner, and any caller can flip it. A single transient pair row fixes the security rule and the stuck-user bug together.

---

## 6. Areas Reviewed

- `docs/requirements.md`, `README.md`, `NOTES.md` (phase 1 notes only; phases 2–4 empty)
- `package.json`, `package-lock.json` via `npm audit` (no install, no update)
- `next.config.ts`, `prisma.config.ts`, `prisma/schema.prisma`, `.env.example`, `.gitignore`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `app/components/EntryGate.tsx`, `WorldMap.tsx`, `ChatPanel.tsx`, `VideoPanel.tsx`, `ConnectionPrompt.tsx`
- `app/api/join/route.ts`, `app/api/poll/route.ts`, `app/api/signal/route.ts`, `app/api/leave/route.ts`
- `lib/api.ts`, `lib/geo.ts`, `lib/presence.ts`, `lib/prisma.ts`, `lib/types.ts`, `lib/webrtc.ts`
- Search for middleware, Server Actions, `next/image`, `next/og`, `dangerouslySetInnerHTML`, `localStorage`, cookies, `sk.` tokens, and raw SQL
- Confirmation that `.env` is ignored by git and is not in the index. File contents were not read and are not reproduced.

---

## 7. Areas Not Assessed

- The live site named in the README was not used as a test target. No exploit traffic, no flooded joins, no attempts to drain a real mailbox.
- Response headers, TLS, and `Cache-Control` on a deployed Vercel URL were not captured. Header findings are from source.
- Mapbox account settings (allowed URLs, scopes, rotation) were not visible from the repo.
- `DATABASE_URL` was not read. Pooling, SSL, and database network rules are unverified. The code supports a pooled Postgres URL and fails if the variable is missing.
- Whether production or Vercel log drains store HTTP bodies or Prisma error parameters was not verified.
- ICE candidate contents (literal host IPs versus mDNS) depend on the browser and were not captured from a live handshake.
- `npm audit` was not followed by an upgrade, so patched version numbers were not re-checked after a lockfile change. Advisory text is what the registry returned on the day of this review.
- Mobile WebViews, browser extensions, and physical camera-permission UX were not exercised.
- Load, latency, and connection-pool behavior under real concurrent polls were not measured.

---

## 8. Pre-Launch Security Assessment

Pulse can stay anonymous, temporary, and deployable as one Next.js app. It should not go live on the current API.

Before production:

1. **SEC-001.** Stop treating the published dot id as a password. Mailbox reads, signaling, leave, and location updates must require a secret that never appears in the peer list.
2. **SEC-002.** Tie accept, decline, end, and WebRTC signaling to a real pair, with a unique constraint so one person has one active connection.
3. **SEC-003.** When a tab closes or a row goes stale, release the other person and tell their client.
4. **SEC-004.** Rate-limit at the Vercel edge, cap bodies and mailbox depth, and use a pooled database URL.

After those four, the phase 2 items (raw location in the client, idle retention, headers, Mapbox token restrictions, Next.js upgrade, and the atomic races if they were not already part of the pair rewrite) are the right follow-on. Phase 3 is real hardening and is not what stands between this tree and a serious privacy failure.

Wait for review of this list before changing the application.
