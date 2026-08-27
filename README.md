# A simple homework management tool for the classroom

This application is a desktop application to help managing homework at home and in the classroom.

It is aimed at simplifying the daily life of dyspraxic / dysgraphic kids who use a computer to offload the cognitive
load of handwriting and spatial coordination.

## Supported platforms

- Windows
- Linux
- macOS

## Building

The application lives in [`homework/`](homework/); every command below runs from there. Tooling comes from
[Mise](https://mise.jdx.dev/) (`mise install`).

```
cd homework
./scripts/provision.sh      # one-time toolchain setup, safe to re-run
./scripts/build-macos.sh    # -> a .dmg
./scripts/build-windows.sh  # -> an NSIS .exe, cross-compiled via cargo-xwin
./scripts/build-linux.sh    # -> an AppImage, built inside a Podman container
./scripts/clean.sh          # removes build outputs (dist/, src-tauri/target/)
./scripts/set-version.sh <version>  # sets the release version, e.g. 2026.8.27
```

Each build script prints the path to the installer it produced when it's done. Windows and Linux builds are
cross-built from macOS — see the "Distribution" section of [`specs/technical-stack.md`](specs/technical-stack.md)
for how, and for what each one actually needs installed (`scripts/provision.sh` handles most of it, but Windows
also needs Homebrew's `llvm` and `makensis`, and Linux needs [Podman](https://podman.io/)).

To run the application itself during development rather than build an installer, see
[`homework/README.md`](homework/README.md).

## License

LGPL-3.0-only. See [LICENSE](LICENSE).

## Support

TO BE SPECIFIED LATER

## Contributing

TO BE SPECIFIED LATER
