# Decision Brain

*Entry for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/) (FalkorDB × WeMakeDevs, Oct 14–18 2026).*

An agent that answers **"why is this codebase the way it is?"** by walking a FalkorDB graph of
decisions, the evidence behind them, the commits that carried them out and the files they touched —
and shows the path behind every answer.

**Status (Day 1, Oct 14):** git history and the decision log ingest into FalkorDB (one graph per repo);
`trace` returns the path behind a decision. Built during the event — everything graph-related dates
from after Oct 14 2:31 PM EDT. Before the event the repo held only the plan ([PLAN.md](PLAN.md)), the
stock FalkorDB container, and two graph-agnostic libraries (`lib/llm.ts`, `lib/loop.ts`) adapted from
[Invarail](https://github.com/PeterGreenAppliedAI/Invarail).

```sh
npm install && npm run graph:up            # FalkorDB on 127.0.0.1:6380, Browser on :3030
npm run ingest -- <path-to-repo> --graph <name>
npm run trace -- --graph <name> --find "router"
npm run trace -- --graph <name> <decision-id>
```

Settings come from the environment (`.env` is gitignored): `FALKORDB_URL`, `PERSON_ALIASES`
(`alias=Name;…`), `AGENT_AUTHOR_PATTERN`, `WRITE_BATCH`.

**AI assistance:** built with Claude Code (Claude Opus 5.5); every assisted commit carries a
Co-Authored-By trailer. The architecture, the decisions and their reasons are logged in
[DECISIONS.md](DECISIONS.md).
