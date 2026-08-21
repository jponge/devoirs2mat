# Technical stack and tooling

## Use Mise

- Do not assume or recommend that tools are installed globally
- Use [Mise](https://mise.jdx.dev/), see `mise.toml`
- If a new tool is needed, propose to add it to the local Mise configuration

## Tauri application

- The application uses [Tauri version 2](https://v2.tauri.app/)
    - We target desktop applications (Windows, macOS and Linux)
    - We do not have plans for Android / iOS
    - Data persistence will be done using the [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) and SQLite
- The code is written in JavaScript
- `pnpm` is the only allowed Node tool, to not use `npm`, `yarn`, `npx`, etc
- `vite` is the target build tool
- The user interface layer is written using [React](https://react.dev/), and we use a functional React style to define
  components, not classes
- The user interface uses [shadcn](https://ui.shadcn.com/) components, and we use a preset code `b7W7uXIq8` (as in
  `pnpm dlx shadcn@latest apply --preset b7W7uXIq8`) to define the appearance
- The application is self-contained and never requires any network connectivity (no remote account, not CSS/JS/font
  download, etc)
