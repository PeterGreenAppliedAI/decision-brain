# Decision Brain

*Pre-event scaffold for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/) (FalkorDB × WeMakeDevs, Oct 14–18 2026).*

An agent that answers **"why is this codebase the way it is?"** by walking a FalkorDB graph of
decisions, the evidence behind them, the commits that carried them out and the files they touched —
and shows the path behind every answer.

**Status:** nothing graph-specific exists yet. The rules require the submission and its FalkorDB
implementation to be built during the event; this repo currently holds only the plan
([PLAN.md](PLAN.md)), a scaffold, the stock FalkorDB container, and two graph-agnostic libraries
(`lib/llm.ts`, `lib/loop.ts`) adapted from [Invarail](https://github.com/PeterGreenAppliedAI/Invarail).
