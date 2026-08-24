#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 <arquivo.AppImage> <linuxdeploy-plugin-appimage.AppImage>" >&2
  exit 2
fi

appimage_path=$(realpath "$1")
plugin_path=$(realpath "$2")

[ -f "$appimage_path" ] || { echo "AppImage não encontrado: $appimage_path" >&2; exit 1; }
[ -f "$plugin_path" ] || { echo "Plugin não encontrado: $plugin_path" >&2; exit 1; }

compatibility_dir=$(mktemp -d)
cleanup() {
  find "$compatibility_dir" -xdev -depth -delete
}
trap cleanup EXIT HUP INT TERM

(
  cd "$compatibility_dir"
  "$appimage_path" --appimage-extract >/dev/null
)

appdir="$compatibility_dir/squashfs-root"
library_dir="$appdir/usr/lib"
removed_manifest="$compatibility_dir/removed-libraries.txt"

find "$library_dir" -maxdepth 1 \( -type f -o -type l \) \( \
  -name 'libwayland-*' -o \
  -name 'libglib-2.0.so*' -o \
  -name 'libgio-2.0.so*' -o \
  -name 'libgobject-2.0.so*' -o \
  -name 'libgmodule-2.0.so*' -o \
  -name 'libgst*.so*' -o \
  -name 'libgstreamer-1.0.so*' -o \
  -name 'libmount.so*' -o \
  -name 'libblkid.so*' -o \
  -name 'libselinux.so*' -o \
  -name 'libpcre2-8.so*' -o \
  -name 'libzstd.so*' -o \
  -name 'libelf.so*' -o \
  -name 'libffi.so*' -o \
  -name 'libsystemd.so*' \
\) -print > "$removed_manifest"

[ -s "$removed_manifest" ] || {
  echo "Nenhuma biblioteca incompatível foi encontrada; o formato do AppImage mudou." >&2
  exit 1
}

while IFS= read -r library_path; do
  find "$library_path" -maxdepth 0 -delete
done < "$removed_manifest"

fixed_path="$compatibility_dir/fixed.AppImage"
chmod 755 "$plugin_path"
ARCH=x86_64 \
LDAI_OUTPUT="$fixed_path" \
LDAI_NO_APPSTREAM=1 \
APPIMAGE_EXTRACT_AND_RUN=1 \
  "$plugin_path" --appdir="$appdir"

[ -s "$fixed_path" ] || { echo "O AppImage corrigido não foi criado." >&2; exit 1; }
chmod 755 "$fixed_path"
mv "$fixed_path" "$appimage_path"

echo "AppImage corrigido; bibliotecas substituídas pelas versões do sistema:"
sed "s#^$library_dir/##" "$removed_manifest"
