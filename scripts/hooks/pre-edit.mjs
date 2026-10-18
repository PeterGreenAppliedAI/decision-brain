#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook: before the agent edits a file, tell it which recorded decisions rest on
 * that file and what was already tried and disproven there — so the reason reaches the agent without
 * anyone having to remember to ask.
 *
 * It only informs. It never blocks an edit and never changes the permission prompt (no
 * permissionDecision), it stays silent when the file has no standing decisions, it speaks once per
 * file per session, and any failure (graph down, timeout) means silence, not a blocked edit.
 *
 * Settings (environment, e.g. in the hook command):
 *   DB_HOME   path to the decision-brain checkout     DB_GRAPH  graph name of this repository
 *   DB_REPO   path to the repository being edited (defaults to the hook's cwd)
 *
 * .claude/settings.json in the repository being edited:
 *   { "hooks": { "PreToolUse": [ { "matcher": "Edit|Write|MultiEdit", "hooks": [ { "type": "command",
 *     "command": "DB_HOME=/path/to/decision-brain DB_GRAPH=myproject node /path/to/decision-brain/scripts/hooks/pre-edit.mjs" } ] } ] } }
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const quiet = () => process.exit(0);
let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { quiet(); }
const file = input?.tool_input?.file_path;
const { DB_HOME, DB_GRAPH } = process.env;
if (!file || !DB_HOME || !DB_GRAPH) quiet();
const repo = resolve(process.env.DB_REPO ?? input.cwd ?? process.cwd());
const rel = relative(repo, resolve(repo, file));
if (rel.startsWith('..')) quiet();                                   // not in this repository

// Once per file per session: the agent has the context after the first edit.
const seenPath = join(tmpdir(), `decision-brain-hook-${String(input.session_id ?? 'none').replace(/[^\w-]/g, '')}.json`);
let seen = [];
try { seen = JSON.parse(readFileSync(seenPath, 'utf8')); } catch { /* first edit this session */ }
if (seen.includes(rel)) quiet();

let text = '';
try {
  text = execFileSync('npm', ['--prefix', DB_HOME, 'run', '-s', 'what-breaks', '--', '--graph', DB_GRAPH, '--repo', repo, rel, '--quiet'],
    { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { quiet(); }
try { writeFileSync(seenPath, JSON.stringify([...seen, rel])); } catch { /* best effort */ }
if (!text) quiet();

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }));
quiet();
