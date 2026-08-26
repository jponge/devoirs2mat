# Builds Devoirs2mat's Linux AppImage inside a real Linux userspace — unlike
# Windows, webkit2gtk/GTK can't be cross-compiled from macOS the clean way
# cargo-xwin handles Windows, so this runs the actual build here instead.
# Used by scripts/build-linux.sh (podman build -f this file). No source is
# copied into the image: build-linux.sh mounts the repository at build time,
# so this image only needs to provide the toolchain, not the code.
FROM ubuntu:24.04

# Tauri's own documented Linux build prerequisites (Debian/Ubuntu family),
# plus curl to install Mise itself below. xdg-utils (for xdg-open) isn't on
# that list but the AppImage bundler checks for it at bundle time regardless
# — found the hard way, not guessed in advance.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    file \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    ca-certificates \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Mise, so the container builds against the exact same node/pnpm/rust
# versions declared in this repo's mise.toml — not whatever apt happens to
# package.
ENV MISE_DATA_DIR=/root/.local/share/mise
ENV PATH="/root/.local/bin:${MISE_DATA_DIR}/shims:${PATH}"
RUN curl -fsSL https://mise.run | sh
