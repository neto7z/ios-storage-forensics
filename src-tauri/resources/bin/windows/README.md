# Ferramentas auxiliares no Windows

Esta pasta não contém binários baixados automaticamente. A distribuição final
deve incluir builds auditados e com licença compatível de:

- `ideviceinfo.exe`;
- `idevicediagnostics.exe`;
- `iproxy.exe`;
- as DLLs exigidas pelo mesmo pacote de `libimobiledevice`.

Durante o desenvolvimento, também é possível definir `IOS_FORENSICS_BIN_DIR`
para uma pasta local ou deixar esses programas no `PATH`.

Não publique binários de origem desconhecida. Registre versão, URL oficial,
SHA-256 e licença em um manifesto antes de anexá-los a uma versão.
