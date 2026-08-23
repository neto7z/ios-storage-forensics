#!/var/jb/bin/sh

set -eu

target='/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches'
expected='/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches'
expected_cache='com.google.photos.mdd.downloads'
mode=${1:-dry-run}

fail() {
    echo "RECUSADO: $*" >&2
    exit 1
}

if [ "$(id -u)" -ne 0 ]; then
    fail "execute como root: sudo /var/jb/bin/sh $0 [--apply]"
fi

[ "$target" = "$expected" ] || fail "o caminho interno não corresponde ao alvo permitido"
[ -d "$target" ] || fail "o diretório de caches descartados não existe"

case "$mode" in
    dry-run|--dry-run)
        apply=0
        ;;
    --apply)
        apply=1
        ;;
    *)
        fail "argumento inválido; use --dry-run ou --apply"
        ;;
esac

unexpected_top=$(find "$target" -mindepth 1 -maxdepth 1 ! -type d -print -quit)
[ -z "$unexpected_top" ] || fail "há um item inesperado no primeiro nível: $unexpected_top"

unexpected_second=$(find "$target" -mindepth 2 -maxdepth 2 ! -type d -print -quit)
[ -z "$unexpected_second" ] || fail "há um item inesperado no segundo nível: $unexpected_second"

unexpected_name=$(find "$target" -mindepth 2 -maxdepth 2 -type d ! -name "$expected_cache" -print -quit)
[ -z "$unexpected_name" ] || fail "foi encontrado outro tipo de cache: $unexpected_name"

top_count=$(find "$target" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
cache_count=$(find "$target" -mindepth 2 -maxdepth 2 -type d -name "$expected_cache" | wc -l | tr -d ' ')

[ "$top_count" -gt 0 ] || {
    echo "Nada para limpar: o diretório está vazio."
    exit 0
}

[ "$top_count" -eq "$cache_count" ] \
    || fail "nem todas as pastas correspondem exclusivamente ao cache esperado"

echo "Alvo validado: $target"
echo "Tipo de cache: $expected_cache"
echo "Conjuntos descartados: $cache_count"
printf 'Tamanho atual: '
du -sh "$target" 2>/dev/null | cut -f1

if [ "$apply" -eq 0 ]; then
    echo "Modo de simulação: nenhum arquivo foi alterado."
    echo "Para aplicar: sudo /var/jb/bin/sh $0 --apply"
    exit 0
fi

echo ""
echo "Esta operação apaga permanentemente apenas o conteúdo validado acima."
printf 'Digite APAGAR CACHES DESCARTADOS para continuar: '
IFS= read -r confirmation
[ "$confirmation" = "APAGAR CACHES DESCARTADOS" ] || fail "confirmação incorreta"

chflags -R nouchg,noschg "$target"
find "$target" -depth -mindepth 1 -delete

remaining=$(find "$target" -mindepth 1 -print -quit)
[ -z "$remaining" ] || fail "a operação terminou, mas ainda existem itens no alvo"

echo "Limpeza concluída. O diretório de descarte foi preservado."
printf 'Tamanho restante: '
du -sh "$target" 2>/dev/null | cut -f1
df -h /private/var/mobile
