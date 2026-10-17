# Deployment options for judging

The event prefers a deployment; otherwise setup instructions plus a video. Decision Brain's model runs
on a local GPU box, so any live deployment is this machine's web server reached through a tunnel.
**Choosing one is the owner's call** — it exposes this machine's web server and model time to the internet.

| Option | What judges get | Cost / risk |
|---|---|---|
| **A. Video + setup only** | DEMO recording; README + eval/JUDGE-PATH.md to run it themselves (needs Docker and an OpenAI-compatible model server) | nothing exposed; judges without a GPU can't run Ask |
| **B. Tunnel to `npm run web`** (Cloudflare quick tunnel `cloudflared tunnel --url http://127.0.0.1:4100`, or Tailscale Funnel) | the live Board and Ask views on the real graphs | URL works only while this Mac, FalkorDB and the GPU box are up; each Ask spends GLM time (capped by `ASK_MAX_CONCURRENT`, default 2); the quick-tunnel URL changes on restart |
| **C. Tunnel, Board only** | live Board, Ask examples answered from saved runs | needs a "saved answers" mode — not built |

**Recommendation: A plus B during the judging window**, with the checklist below. A is the floor if
the machine is down; B lets judges click through the real thing.

## Checklist before opening a tunnel

- [ ] `WEB_LOCAL_ACTIONS` and `WEB_ALLOW_INGEST` unset (no Sync, demo steps or Add repository publicly) — check `GET /api/action` says `enabled: false`
- [ ] demo copies deleted or left hidden (`invarail-demo` is listed only when the link names it)
- [ ] `ASK_MAX_CONCURRENT` set (2 is the default) — a third question gets "busy"
- [ ] the web server runs where it can reach the model host
- [ ] `WEB_HOST` stays `127.0.0.1`; only the tunnel reaches it
- [ ] nothing personal in the served graphs: Invarail's graph holds commit messages, author names and
      DECISIONS.md text — the owner's own public repository; confirm it may be browsable
- [ ] after judging: stop the tunnel
