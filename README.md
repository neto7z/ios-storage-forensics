# iOS Storage Forensics

Estudo de caso reproduzível sobre a investigação de um crescimento anormal de
**Dados do Sistema** em um iPhone, usando Linux, conexão USB e acesso autorizado
ao próprio aparelho.

O objetivo deste repositório não é oferecer um “limpador mágico”. Ele mostra
como medir o armazenamento, localizar a causa real, validar o alvo e só então
remover um cache comprovadamente descartado.

## Como o caso foi conduzido

A investigação foi realizada de forma colaborativa entre o proprietário do
aparelho e o **Codex, da OpenAI**. O proprietário autorizou o acesso, manteve o
controle físico do dispositivo e executou as etapas exigidas no iPhone. O Codex
conduziu as medições pelo terminal, delimitou o alvo, executou a limpeza e
validou o resultado.

Este relato separa fatos observados de recomendações gerais e omite todas as
credenciais e identificações pessoais da sessão original.

## Resultado do caso

| Etapa | Antes | Depois |
| --- | ---: | ---: |
| Espaço livre | aproximadamente 577 MB | aproximadamente 16 GB |
| `~/Library/Caches` do usuário móvel | aproximadamente 17 GB | aproximadamente 1,1 GB |
| Cache descartado identificado | aproximadamente 16 GB | 0 |

A causa foi a presença de **242 cópias órfãs** de
`com.google.photos.mdd.downloads` dentro da área
`com.apple.CacheDeleteAppContainerCaches.discardedCaches`. Os arquivos estavam
marcados como imutáveis, impedindo que o processo normal de limpeza do iOS os
excluísse.

Nenhuma foto, conversa ou pasta de dados ativa de aplicativo foi removida.

## Ambiente observado

- iPhone XR;
- iOS 18.7;
- jailbreak rootless com Dopamine;
- OpenSSH do Procursus;
- Linux com `libimobiledevice`, `iproxy` e OpenSSH Client.

Este é o registro de **um caso específico**. Caminhos, permissões e comportamento
podem mudar entre versões do iOS. Não execute a limpeza em outro aparelho sem
refazer todo o diagnóstico.

## Fluxo de investigação

### 1. Encaminhar o SSH exclusivamente pelo USB

No computador Linux:

```sh
iproxy 2222 22
```

Em outro terminal:

```sh
ssh -p 2222 mobile@127.0.0.1
```

Use uma senha temporária forte e diferente da senha do iPhone e da conta Apple.
Não exponha o SSH na internet.

### 2. Medir antes de remover

No iPhone, pela sessão SSH:

```sh
df -h
sudo du -x -h -d 1 /private/var/mobile 2>/dev/null | sort -h
sudo du -x -h -d 1 /private/var/mobile/Library 2>/dev/null | sort -h
sudo du -x -h -d 1 /private/var/mobile/Library/Caches 2>/dev/null | sort -h
```

O encadeamento revelou:

```text
/private/var/mobile                         ~35 GB
└── Library                                 ~21 GB
    └── Caches                              ~17 GB
        └── com.apple.cache_delete          ~16 GB
            └── ...discardedCaches          ~16 GB
```

### 3. Confirmar o conteúdo

Antes da limpeza, foram contadas as pastas descartadas e inspecionados seus
nomes internos. Todas apontavam para o mesmo cache do Google Fotos:

```sh
target='/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches'

sudo find "$target" -mindepth 1 -maxdepth 1 -type d | wc -l
sudo find "$target" -mindepth 2 -maxdepth 2 -type d -print
```

O Google Fotos já não estava instalado. Portanto, eram caches órfãos que o
próprio iOS havia movido para sua área de descarte, mas não conseguira eliminar.

### 4. Remover somente o alvo validado

O script [cleanup-discarded-google-photos-cache.sh](scripts/cleanup-discarded-google-photos-cache.sh)
faz todas as verificações novamente. Sem argumentos, ele opera em **modo de
simulação** e não altera nada:

```sh
sudo /var/jb/bin/sh scripts/cleanup-discarded-google-photos-cache.sh
```

Para efetivar a limpeza, é necessário passar `--apply` e confirmar o texto
solicitado:

```sh
sudo /var/jb/bin/sh scripts/cleanup-discarded-google-photos-cache.sh --apply
```

O script:

1. confere o caminho absoluto;
2. recusa conteúdos que não correspondam ao cache documentado;
3. mostra quantidade e tamanho antes da alteração;
4. remove as marcas `uchg` e `schg` somente nessa árvore;
5. apaga o conteúdo, preservando o diretório de descarte;
6. mede novamente o tamanho e o espaço livre.

## Diagnóstico sem limpeza

O script [inspect-ios-storage.sh](scripts/inspect-ios-storage.sh) produz um mapa
das principais áreas do armazenamento sem modificar arquivos:

```sh
sudo /var/jb/bin/sh scripts/inspect-ios-storage.sh
```

## Cache adicional observado

Também foi encontrado um arquivo esparso de aproximadamente 1,5 GB de uso físico
em:

```text
/private/var/root/Library/Caches/com.apple.coresymbolicationd/<build-do-iOS>
```

Ele era um cache reconstruível de simbolização. Sua remoção não foi automatizada
neste repositório porque não fazia parte da falha principal e pode voltar a ser
criado pelo sistema.

## O que não deve ser apagado manualmente

- `/private/var/MobileAsset`;
- bancos de dados do sistema;
- Keychain, CloudKit ou índices do Spotlight;
- contêineres ativos de aplicativos;
- o diretório inteiro `/private/var/mobile/Library/Caches`;
- qualquer caminho que não tenha sido previamente medido e identificado.

“Dados do Sistema” nunca chegará a zero. Essa categoria também inclui vozes da
Siri, dicionários, modelos de linguagem, índices, logs e caches legítimos.

## Encerramento seguro

Após o diagnóstico:

1. altere a senha do usuário `mobile` para uma senha privada;
2. remova o OpenSSH Server se não precisar mais dele;
3. encerre o `iproxy`;
4. reinicie o espaço de usuário;
5. aguarde o iOS recalcular a tela de armazenamento.

## Aviso

Este material é educacional e pressupõe que você é proprietário do aparelho ou
possui autorização expressa para administrá-lo. Uma exclusão incorreta pode
causar perda de dados ou tornar o sistema instável. Faça backup antes de qualquer
alteração e use o modo de simulação.

## Licença

[MIT](LICENSE)
