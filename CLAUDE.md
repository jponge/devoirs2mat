# Agent instructions

## Project structure

- The Tauri-based application is in `homework/`
- The `specs/` folder contains specifications for users and agents:
    - [technical stack](specs/technical-stack.md)
    - [functional specifications](specs/functional-specs.md)
    - [design guidelines](specs/design-guidelines.md)
- The `plans/` folder contains plans for agents to implement features and fix issues:
    - when requested to make a plan, record it in a new file named `plans/year-month-day-title.md` (like
      `2026-08-21-shiny-buttons.md`)
    - the plan must be complete and self-contained for any agent to operate from a clear context

## Guidelines

- Behave like an experienced / senior individual contributor
- Do not take shortcuts to rush to completion, and be honest and transparent when you are not sure about something
- Always offer a menu with context clarification questions before you start doing any work
- Never make commits unless you have been given review approval and permission to do so
- Never be a co-author in commits
- When you follow a plan, always ensure you complete each and every step
- Use a test-driven approach
- Favor minimal, surgical edits over big changes
- Never over-engineer, focus on simple solutions that work
- Always prefer using the JetBrains MCP server (if available) when you want to analyze, refactor and transform code:
  this is better than a combination of find, grep, awk, and other similar tools
- After any change, launch subagents to make a review (architect, quality engineer, adversarial reviewer) before asking
  me to review