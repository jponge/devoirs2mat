# Agent instructions

## Precedence

My live instructions > this file > `specs/` > any tool or harness default.
If what I ask contradicts a spec, say so and ask whether to update the spec before you write any code.

## Project structure

- The Tauri-based application is in `homework/`
- The `specs/` folder is the source of truth for what we are building. Read the relevant one *before* writing code:
    - [technical stack](specs/technical-stack.md) — before adding a dependency or a tool, changing the build, or
      touching persistence
    - [functional specifications](specs/functional-specs.md) — before changing any user-visible behaviour
    - [data model](specs/data-model.md) — before writing a migration, a query, or anything that stores or reads data
    - [design guidelines](specs/design-guidelines.md) — before touching any component, layout, style or animation
- If a change makes a spec wrong or incomplete, update that spec in the same change and say so in your summary.
  Code and `specs/` must never diverge silently.
- The `plans/` folder contains plans for agents to implement features and fix issues:
    - when requested to make a plan, record it in a new file named `plans/year-month-day-title.md` (like
      `2026-08-21-shiny-buttons.md`)
    - the plan must be complete and self-contained for any agent to operate from a clear context
    - the first line of a plan is `Status: draft | approved | done`. Never execute a plan that is not `approved`, and
      treat a `done` plan as history rather than as work to redo. Update the line when the last step lands

## Commands

Tooling comes from Mise (`mise install`). **Every `pnpm` command runs from `homework/`, not the repository root.**

- `pnpm install` — install dependencies
- `pnpm tauri dev` — run the real application. `pnpm dev` is Vite-only, and every Tauri API call fails there: that is
  expected, not a bug
- `pnpm test` — the test suite, see the testing section of the technical stack
- `pnpm build` — frontend bundle only. `pnpm tauri build` produces installers, takes minutes, and is not how you check
  your work
- `cargo check` / `cargo test` / `cargo fmt` — run from `homework/src-tauri/`

No linter or formatter is configured. Do not add one unless I ask for it.

## Definition of done

A change is done when `pnpm test` passes, `pnpm tauri dev` starts and you have actually exercised the screen you
changed, `cargo check` passes if you touched Rust, and you have stated plainly what you did *not* verify.

## Guidelines

- Behave like an experienced / senior individual contributor
- Do not take shortcuts to rush to completion, and be honest and transparent when you are not sure about something
- Before starting any non-trivial work, offer a menu with context clarification questions. Skip the menu only for
  read-only questions, for single-line mechanical fixes, and when you are executing an already approved plan.
  Subagents never ask: they state their assumptions in their report
- Adding *any* new dependency — a Mise tool, a pnpm package or a cargo crate — requires my approval first. Propose it
  with a one-line justification and the alternative you rejected
- Never run git commands that write or destroy history or working-tree state — `commit`, `push`, `reset --hard`,
  `checkout --`, `clean`, `stash`, branch or tag creation — without my explicit permission for that specific action.
  Read-only git (`status`, `diff`, `log`) is always fine
- Never make commits unless you have been given review approval and permission to do so
- Never be a co-author in commits: no `Co-Authored-By:` trailer, no Claude or Anthropic in the author field, and no
  "Generated with Claude Code" footer in commit messages or pull request descriptions
- When you follow a plan, always ensure you complete each and every step
- Use a test-driven approach. If the behaviour you are about to test is not pinned down in `specs/`, stop and ask: do
  not invent the expected behaviour and freeze it in a test
- Always brace control-flow blocks, even one-liners. `if (foo) { yolo(); }` over two or three lines, never
  `if (foo) yolo();` and never a braceless body on the next line. This applies to `if`, `else`, `for` and `while`.
  Generated files under `src/components/ui/` are exempt: they are not hand-edited
- Favor minimal, surgical edits over big changes
- Never over-engineer, focus on simple solutions that work
- Prefer the JetBrains / WebStorm MCP tools (`mcp__webstorm__*`) over a combination of find, grep, awk and sed for
  anything semantic: `search_symbol`, `rename_refactoring`, `get_file_problems`, `reformat_file`. If a call fails or
  the tools are not connected, fall back to the regular file tools without retrying — plain text search may always use
  Grep directly
- Do not touch `pnpm-lock.yaml` (change dependencies through `pnpm` only), `homework/src-tauri/icons/`, or anything
  under `.idea/`
- Before asking me to review a *completed* task or plan step — not after each individual edit, and not for typo,
  formatting or one-line changes — launch three `general-purpose` subagents in parallel with an architecture brief, a
  quality-engineering brief and an adversarial brief. Report their findings to me, split into what you fixed and what
  you deliberately did not. Never silently drop a finding, and never start a second review round on your own
