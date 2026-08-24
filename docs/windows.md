# Aplicativo para Windows

## O que funciona em cada modo

| Recurso | iPhone sem jailbreak | iPhone com jailbreak e OpenSSH |
| --- | :---: | :---: |
| Detectar aparelho e versão do iOS | Sim | Sim |
| Ler dados expostos da bateria | Quando o iOS permitir | Quando o iOS permitir |
| Medir diretórios internos | Não | Sim |
| Localizar o caso de cache descartado | Não | Sim |
| Executar a limpeza restrita | Não | Sim |
| Exportar relatório anonimizado | Sim | Sim |

O acesso profundo não é apresentado como recurso universal: o sandbox do iOS
impede um computador comum de medir diretamente `/private/var`.

## Pré-requisitos do computador

1. Windows 10 ou Windows 11 de 64 bits;
2. aplicativo **Apple Devices** instalado, para que o Windows reconheça o
   iPhone;
3. iPhone conectado por cabo de dados, desbloqueado e autorizado com
   **Confiar**;
4. somente para análise profunda: jailbreak rootless compatível e OpenSSH
   temporariamente ativo.

As ferramentas `libimobiledevice` usadas pelo instalador são obtidas dos
pacotes UCRT64 do MSYS2 durante a compilação. O fluxo registra versões e hashes
em `toolchain-manifest.txt`; o repositório não aceita executáveis baixados de
fontes aleatórias.

## Senhas e privacidade

- a senha SSH permanece apenas na memória durante a chamada;
- o campo é limpo ao concluir ou falhar;
- nenhuma credencial é gravada em arquivo, log ou relatório;
- não existe campo para executar comandos SSH livres;
- nome do aparelho, UDID, serial e conta Apple são omitidos do relatório.

Ao terminar o atendimento, o técnico deve trocar a senha temporária, remover ou
desativar o OpenSSH e reiniciar o espaço de usuário.

## Como obter o instalador

Cada execução de **Build and verify** no GitHub Actions produz um artefato com:

- instalador NSIS, terminado em `-setup.exe`;
- pacote MSI.

Uma tag como `v0.1.0` também cria uma versão pública no GitHub Releases. Como o
projeto ainda não possui certificado comercial de assinatura de código, o
Windows SmartScreen pode exibir um aviso de editor desconhecido. O código e a
compilação são públicos, mas isso não equivale a uma assinatura digital.

## Desenvolvimento local no Windows

```powershell
npm ci
npm run tauri dev
```

Para usar ferramentas instaladas fora do aplicativo:

```powershell
$env:IOS_FORENSICS_BIN_DIR = "C:\caminho\para\libimobiledevice\bin"
npm run tauri dev
```
