# Aplicativo para Linux

O aplicativo funciona nativamente no Linux. Ele usa as ferramentas
`libimobiledevice` instaladas pela própria distribuição para conversar com o
iPhone pelo cabo USB.

## Qual pacote escolher

- **Kali, Debian ou Ubuntu:** use o arquivo terminado em `.deb`;
- **outras distribuições x86_64:** use o `.AppImage`;
- **desenvolvimento:** execute o projeto com Tauri a partir do código-fonte.

O `.deb` declara as ferramentas USB como dependências. O AppImage inclui a
interface e o backend do aplicativo, mas as ferramentas de comunicação com o
iPhone continuam sendo fornecidas pela distribuição Linux.

O AppImage passa por uma etapa adicional de compatibilidade para evitar o
conflito entre bibliotecas antigas empacotadas e versões recentes do Mesa e do
GLib. A inicialização da janela também é testada automaticamente antes da
publicação.

## Dependências no Kali, Debian ou Ubuntu

```sh
sudo apt update
sudo apt install libimobiledevice-utils libusbmuxd-tools usbmuxd
```

Depois da instalação, estes comandos devem encontrar as três ferramentas:

```sh
command -v ideviceinfo
command -v idevicediagnostics
command -v iproxy
```

## Instalar o pacote DEB

```sh
sudo apt install ./ios-storage-forensics_0.2.0_amd64.deb
```

O nome exato inclui a versão e pode mudar. Depois, procure por
**iOS Storage Forensics** no menu de aplicativos.

## Executar o AppImage

```sh
chmod +x iOS.Storage.Forensics_0.2.0_amd64.AppImage
./iOS.Storage.Forensics_0.2.0_amd64.AppImage
```

Se a distribuição não tiver `libimobiledevice`, `usbmuxd` e `iproxy`, o
aplicativo abrirá, mas não conseguirá detectar ou analisar o iPhone.

## Preparar o iPhone

1. conecte o iPhone com um cabo de dados;
2. desbloqueie a tela;
3. toque em **Confiar** quando o iPhone perguntar;
4. abra o aplicativo e clique em **Detectar aparelho**.

A identificação padrão não exige jailbreak. A análise interna do armazenamento
e a limpeza restrita exigem jailbreak rootless, OpenSSH temporariamente ativo e
a senha do usuário `mobile`.

## Desenvolvimento no Linux

O Tauri 2 precisa das bibliotecas de desenvolvimento do WebKitGTK. No Kali,
Debian ou Ubuntu:

```sh
./scripts/setup-linux-development.sh
npm ci
npm run tauri dev
```

O aplicativo procura as ferramentas iOS no `PATH`, nas pastas padrão
`/usr/bin`, `/usr/sbin`, `/usr/local/bin` e `/usr/local/sbin`, ou na pasta
indicada pela variável `IOS_FORENSICS_BIN_DIR`.

## Privacidade

- as leituras acontecem localmente;
- a senha SSH permanece somente na memória durante a operação;
- nome, UDID, serial e conta Apple não entram no relatório;
- não existe terminal SSH livre;
- a limpeza é bloqueada se o conteúdo não corresponder exatamente ao caso
  documentado.
