#!/var/jb/bin/sh

set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Execute como root: sudo /var/jb/bin/sh $0" >&2
    exit 1
fi

show_usage() {
    label=$1
    path=$2

    if [ ! -d "$path" ]; then
        printf '\n[%s]\nCaminho não encontrado: %s\n' "$label" "$path"
        return
    fi

    printf '\n[%s]\n' "$label"
    du -x -h -d 1 "$path" 2>/dev/null | sort -h
}

echo "iOS Storage Forensics — diagnóstico somente leitura"
echo "Data: $(date '+%Y-%m-%d %H:%M:%S %z')"

printf '\n[VOLUMES]\n'
df -h

show_usage "USUÁRIO MÓVEL" "/private/var/mobile"
show_usage "BIBLIOTECA DO USUÁRIO" "/private/var/mobile/Library"
show_usage "CACHES DO USUÁRIO" "/private/var/mobile/Library/Caches"
show_usage "DADOS DO SISTEMA" "/private/var"
show_usage "CACHES ADMINISTRATIVOS" "/private/var/root/Library/Caches"
show_usage "MOBILE ASSETS" "/private/var/MobileAsset"

target='/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches'

printf '\n[CACHES DESCARTADOS]\n'
if [ -d "$target" ]; then
    printf 'Tamanho: '
    du -sh "$target" 2>/dev/null | cut -f1
    printf 'Pastas no primeiro nível: '
    find "$target" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '
    printf '\nIdentificadores encontrados no segundo nível:\n'
    find "$target" -mindepth 2 -maxdepth 2 -type d -exec basename {} \; \
        | sort | uniq -c | sort -nr
else
    echo "Diretório não encontrado."
fi

printf '\nDiagnóstico concluído. Nenhum arquivo foi alterado.\n'
