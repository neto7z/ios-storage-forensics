#!/bin/sh
set -eu

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Este instalador automático atende Kali, Debian e Ubuntu." >&2
  echo "Consulte docs/linux.md para preparar outra distribuição." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libimobiledevice-utils \
  libusbmuxd-tools \
  usbmuxd \
  patchelf \
  libfuse2

echo "Dependências Linux instaladas. Execute: npm ci && npm run tauri dev"
