use chrono::Utc;
use plist::Value;
use serde::Serialize;
use ssh2::Session;
use std::{
    collections::BTreeMap,
    env,
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

const LOCAL_SSH_PORT: u16 = 22_222;
const TARGET: &str = "/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches";
const EXPECTED_CACHE: &str = "com.google.photos.mdd.downloads";
const CONFIRMATION: &str = "APAGAR CACHES DESCARTADOS";

#[derive(Default)]
struct TunnelState(Mutex<Option<Child>>);

impl Drop for TunnelState {
    fn drop(&mut self) {
        if let Ok(slot) = self.0.get_mut() {
            if let Some(child) = slot.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    id: String,
    label: String,
    available: bool,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformStatus {
    os: String,
    arch: String,
    is_windows: bool,
    tools: Vec<ToolStatus>,
    driver_hint: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatteryInfo {
    current_capacity: Option<u64>,
    raw_maximum_capacity: Option<u64>,
    design_capacity: Option<u64>,
    health_percent: Option<f64>,
    cycle_count: Option<u64>,
    temperature_c: Option<f64>,
    charging: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceSnapshot {
    connected: bool,
    name: Option<String>,
    product_type: Option<String>,
    ios_version: Option<String>,
    build_version: Option<String>,
    battery: Option<BatteryInfo>,
    warnings: Vec<String>,
    source: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageEntry {
    label: String,
    path: String,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheFinding {
    status: &'static str,
    path: String,
    bytes: u64,
    directory_count: u64,
    identifiers: BTreeMap<String, u64>,
    cleanup_eligible: bool,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeepScanReport {
    scanned_at: String,
    filesystem_free_bytes: u64,
    storage: Vec<StorageEntry>,
    discarded_cache: CacheFinding,
    notes: Vec<String>,
    source: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupResult {
    completed_at: String,
    before_bytes: u64,
    after_bytes: u64,
    filesystem_free_bytes: u64,
    message: String,
}

fn executable_names(base: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![format!("{base}.exe"), base.to_string()]
    } else {
        vec![base.to_string()]
    }
}

fn resource_platform_directory() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        env::consts::OS
    }
}

fn platform_driver_hint() -> &'static str {
    if cfg!(windows) {
        "Se o aparelho não aparecer, instale ou repare o Apple Devices e autorize este computador no iPhone."
    } else if cfg!(target_os = "linux") {
        "No Debian, Ubuntu ou Kali, instale libimobiledevice-utils, libusbmuxd-tools e usbmuxd. Depois desbloqueie o iPhone e autorize este computador."
    } else {
        "Instale libimobiledevice e usbmuxd pelos pacotes da sua plataforma e autorize este computador no iPhone."
    }
}

fn missing_ideviceinfo_message() -> &'static str {
    if cfg!(windows) {
        "A ferramenta ideviceinfo não foi encontrada. Instale ou repare o Apple Devices e reinstale o aplicativo."
    } else if cfg!(target_os = "linux") {
        "A ferramenta ideviceinfo não foi encontrada. Instale o pacote libimobiledevice-utils da sua distribuição."
    } else {
        "A ferramenta ideviceinfo não foi encontrada. Instale libimobiledevice para continuar."
    }
}

fn missing_iproxy_message() -> &'static str {
    if cfg!(windows) {
        "iproxy não foi encontrado. Reinstale o aplicativo para restaurar as ferramentas USB incorporadas."
    } else if cfg!(target_os = "linux") {
        "iproxy não foi encontrado. Instale o pacote libusbmuxd-tools da sua distribuição."
    } else {
        "iproxy não foi encontrado. Instale as ferramentas do libusbmuxd para continuar."
    }
}

fn resolve_tool(app: &AppHandle, base: &str) -> Option<PathBuf> {
    if let Ok(directory) = env::var("IOS_FORENSICS_BIN_DIR") {
        for name in executable_names(base) {
            let candidate = Path::new(&directory).join(&name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        for name in executable_names(base) {
            let candidate = resource
                .join("bin")
                .join(resource_platform_directory())
                .join(&name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            for name in executable_names(base) {
                let candidate = directory.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    if cfg!(target_os = "linux") {
        for directory in ["/usr/bin", "/usr/sbin", "/usr/local/bin", "/usr/local/sbin"] {
            for name in executable_names(base) {
                let candidate = Path::new(directory).join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn command_output(path: &Path, arguments: &[&str]) -> Result<String, String> {
    let output = Command::new(path)
        .args(arguments)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Não foi possível executar {}: {error}", path.display()))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            format!(
                "{} terminou com código {:?}.",
                path.display(),
                output.status.code()
            )
        } else {
            message
        })
    }
}

fn tool_status(app: &AppHandle, id: &str, label: &str, executable: &str) -> ToolStatus {
    let path = resolve_tool(app, executable);
    ToolStatus {
        id: id.to_string(),
        label: label.to_string(),
        available: path.is_some(),
        detail: path
            .map(|value| value.display().to_string())
            .unwrap_or_else(|| "Não encontrado".to_string()),
    }
}

#[tauri::command]
fn platform_status(app: AppHandle) -> PlatformStatus {
    let mut tools = vec![
        tool_status(&app, "ideviceinfo", "Leitura USB", "ideviceinfo"),
        tool_status(
            &app,
            "idevicediagnostics",
            "Diagnóstico da bateria",
            "idevicediagnostics",
        ),
        tool_status(&app, "iproxy", "Túnel USB", "iproxy"),
    ];

    if cfg!(windows) {
        let service_available = Command::new("sc")
            .args(["query", "Apple Mobile Device Service"])
            .stdin(Stdio::null())
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        tools.insert(
            0,
            ToolStatus {
                id: "apple-driver".into(),
                label: "Apple Mobile Device".into(),
                available: service_available,
                detail: if service_available {
                    "Serviço instalado"
                } else {
                    "Instale o Apple Devices"
                }
                .into(),
            },
        );
    } else if cfg!(target_os = "linux") {
        tools.insert(
            0,
            tool_status(&app, "usbmuxd", "Suporte USB do Linux", "usbmuxd"),
        );
    }

    PlatformStatus {
        os: env::consts::OS.into(),
        arch: env::consts::ARCH.into(),
        is_windows: cfg!(windows),
        tools,
        driver_hint: platform_driver_hint().into(),
    }
}

fn idevice_value(tool: &Path, key: &str) -> Option<String> {
    command_output(tool, &["-k", key])
        .ok()
        .filter(|value| !value.is_empty())
}

fn lookup_value<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    match value {
        Value::Dictionary(dictionary) => {
            for key in keys {
                if let Some(found) = dictionary.get(*key) {
                    return Some(found);
                }
            }
            dictionary
                .values()
                .find_map(|child| lookup_value(child, keys))
        }
        Value::Array(array) => array.iter().find_map(|child| lookup_value(child, keys)),
        _ => None,
    }
}

fn plist_u64(value: &Value, keys: &[&str]) -> Option<u64> {
    let value = lookup_value(value, keys)?;
    match value {
        Value::Integer(number) => number
            .as_unsigned()
            .or_else(|| number.as_signed().and_then(|v| u64::try_from(v).ok())),
        Value::Real(number) if *number >= 0.0 => Some(*number as u64),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

fn plist_bool(value: &Value, keys: &[&str]) -> Option<bool> {
    match lookup_value(value, keys)? {
        Value::Boolean(value) => Some(*value),
        Value::Integer(value) => value.as_unsigned().map(|number| number != 0),
        Value::String(value) => match value.to_ascii_lowercase().as_str() {
            "true" | "yes" | "1" => Some(true),
            "false" | "no" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn parse_battery(text: &str) -> Option<BatteryInfo> {
    let value = Value::from_reader_xml(text.as_bytes()).ok()?;
    let current_capacity = plist_u64(&value, &["AppleRawCurrentCapacity", "CurrentCapacity"]);
    let raw_maximum_capacity = plist_u64(
        &value,
        &["AppleRawMaxCapacity", "RawMaxCapacity", "MaxCapacity"],
    );
    let design_capacity = plist_u64(&value, &["DesignCapacity"]);
    let temperature_raw = plist_u64(&value, &["Temperature"]);
    let health_percent = raw_maximum_capacity
        .zip(design_capacity)
        .and_then(|(maximum, design)| {
            (design > 0).then_some((maximum as f64 / design as f64 * 1000.0).round() / 10.0)
        });

    Some(BatteryInfo {
        current_capacity,
        raw_maximum_capacity,
        design_capacity,
        health_percent,
        cycle_count: plist_u64(&value, &["CycleCount"]),
        temperature_c: temperature_raw.map(|temperature| temperature as f64 / 100.0),
        charging: plist_bool(&value, &["IsCharging", "ExternalConnected"]),
    })
}

#[tauri::command]
fn scan_usb_device(app: AppHandle) -> Result<DeviceSnapshot, String> {
    let info = resolve_tool(&app, "ideviceinfo")
        .ok_or_else(|| missing_ideviceinfo_message().to_string())?;

    let product_type = idevice_value(&info, "ProductType").ok_or_else(|| {
        "Nenhum iPhone autorizado respondeu. Desbloqueie o aparelho, toque em Confiar e verifique o cabo USB.".to_string()
    })?;

    let mut warnings = Vec::new();
    let battery = match resolve_tool(&app, "idevicediagnostics") {
        Some(diagnostics) => match command_output(&diagnostics, &["ioregentry", "AppleSmartBattery"]) {
            Ok(text) => parse_battery(&text).or_else(|| {
                warnings.push("O aparelho respondeu, mas os dados detalhados da bateria não estavam disponíveis.".into());
                None
            }),
            Err(_) => {
                warnings.push("A identificação funcionou, mas o iOS não liberou o diagnóstico detalhado da bateria.".into());
                None
            }
        },
        None => {
            warnings.push("idevicediagnostics não está disponível; a bateria não foi lida.".into());
            None
        }
    };

    Ok(DeviceSnapshot {
        connected: true,
        name: idevice_value(&info, "DeviceName"),
        product_type: Some(product_type),
        ios_version: idevice_value(&info, "ProductVersion"),
        build_version: idevice_value(&info, "BuildVersion"),
        battery,
        warnings,
        source: "live",
    })
}

fn wait_for_tunnel() -> bool {
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{LOCAL_SSH_PORT}")
                .to_socket_addrs()
                .ok()
                .and_then(|mut addresses| addresses.next())
                .unwrap(),
            Duration::from_millis(250),
        )
        .is_ok()
        {
            return true;
        }
        thread::sleep(Duration::from_millis(150));
    }
    false
}

fn ensure_tunnel(app: &AppHandle, state: &State<'_, TunnelState>) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "O estado do túnel ficou indisponível.".to_string())?;
    if let Some(child) = guard.as_mut() {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
            && wait_for_tunnel()
        {
            return Ok(());
        }
        let _ = child.kill();
        *guard = None;
    }

    let iproxy = resolve_tool(app, "iproxy").ok_or_else(|| missing_iproxy_message().to_string())?;
    let child = Command::new(iproxy)
        .args([LOCAL_SSH_PORT.to_string(), "22".to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Não foi possível abrir o túnel USB: {error}"))?;
    *guard = Some(child);
    drop(guard);

    if wait_for_tunnel() {
        Ok(())
    } else {
        Err("O túnel USB foi iniciado, mas a porta SSH do iPhone não respondeu. Confirme que o OpenSSH está ativo.".into())
    }
}

fn connect_ssh(password: &str) -> Result<Session, String> {
    let tcp = TcpStream::connect_timeout(
        &format!("127.0.0.1:{LOCAL_SSH_PORT}")
            .to_socket_addrs()
            .map_err(|error| error.to_string())?
            .next()
            .ok_or("Endereço local inválido.")?,
        Duration::from_secs(5),
    )
    .map_err(|_| "O SSH não respondeu pelo cabo. Confirme o OpenSSH no aparelho.".to_string())?;
    tcp.set_read_timeout(Some(Duration::from_secs(90)))
        .map_err(|error| error.to_string())?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;
    let mut session = Session::new().map_err(|error| format!("Falha ao preparar SSH: {error}"))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|error| format!("Falha no handshake SSH: {error}"))?;
    session
        .userauth_password("mobile", password)
        .map_err(|_| "A senha temporária do usuário mobile foi recusada.".to_string())?;
    if !session.authenticated() {
        return Err("O aparelho não autorizou a sessão SSH.".into());
    }
    Ok(session)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn run_root_script(session: &Session, password: &str, script: &str) -> Result<String, String> {
    let mut channel = session
        .channel_session()
        .map_err(|error| format!("Falha ao abrir o canal SSH: {error}"))?;
    let command = format!(
        "/var/jb/usr/bin/sudo -S -p '' /var/jb/bin/sh -c {}",
        shell_quote(script)
    );
    channel
        .exec(&command)
        .map_err(|error| format!("Falha ao executar a rotina remota: {error}"))?;
    channel
        .write_all(password.as_bytes())
        .map_err(|error| error.to_string())?;
    channel
        .write_all(b"\n")
        .map_err(|error| error.to_string())?;
    channel.flush().map_err(|error| error.to_string())?;
    channel.send_eof().map_err(|error| error.to_string())?;

    let mut stdout = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|error| format!("Falha ao ler a resposta do aparelho: {error}"))?;
    let mut stderr = String::new();
    channel
        .stderr()
        .read_to_string(&mut stderr)
        .map_err(|error| error.to_string())?;
    channel.wait_close().map_err(|error| error.to_string())?;
    let status = channel.exit_status().map_err(|error| error.to_string())?;
    if status != 0 {
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "A rotina remota foi recusada pelo aparelho.".into()
        } else {
            detail.into()
        });
    }
    Ok(stdout)
}

const SCAN_SCRIPT: &str = r#"
set -eu
target='/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches'
measure() {
  label=$1
  path=$2
  if [ -d "$path" ]; then
    kb=$(du -sk "$path" 2>/dev/null | awk '{print $1}')
    echo "__SIZE__|$label|$path|$kb"
  fi
}
free_kb=$(df -k /private/var/mobile | awk 'NR==2 {print $4}')
echo "__FREE__|${free_kb:-0}"
measure 'Usuário móvel' '/private/var/mobile'
measure 'Biblioteca' '/private/var/mobile/Library'
measure 'Caches' '/private/var/mobile/Library/Caches'
measure 'Cache descartado' '/private/var/mobile/Library/Caches/com.apple.cache_delete'
if [ ! -d "$target" ]; then
  echo '__TARGET__|0|0|0|0|0'
  exit 0
fi
target_kb=$(du -sk "$target" 2>/dev/null | awk '{print $1}')
top_count=$(find "$target" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
bad_top=$(find "$target" -mindepth 1 -maxdepth 1 ! -type d | wc -l | tr -d ' ')
bad_second=$(find "$target" -mindepth 2 -maxdepth 2 ! -type d | wc -l | tr -d ' ')
bad_name=$(find "$target" -mindepth 2 -maxdepth 2 -type d ! -name 'com.google.photos.mdd.downloads' | wc -l | tr -d ' ')
echo "__TARGET__|$target_kb|$top_count|$bad_top|$bad_second|$bad_name"
find "$target" -mindepth 2 -maxdepth 2 -type d -exec basename {} \; | sort | uniq -c | while read count name; do
  echo "__ID__|$count|$name"
done
"#;

fn parse_u64(value: Option<&&str>) -> u64 {
    value.and_then(|text| text.trim().parse().ok()).unwrap_or(0)
}

fn parse_scan(output: &str) -> Result<DeepScanReport, String> {
    let mut filesystem_free_bytes = 0;
    let mut storage = Vec::new();
    let mut target_kb = 0;
    let mut directory_count = 0;
    let mut validation_errors = 0;
    let mut identifiers = BTreeMap::new();

    for line in output.lines() {
        let fields: Vec<&str> = line.split('|').collect();
        match fields.first().copied() {
            Some("__FREE__") => filesystem_free_bytes = parse_u64(fields.get(1)) * 1024,
            Some("__SIZE__") if fields.len() >= 4 => storage.push(StorageEntry {
                label: fields[1].into(),
                path: fields[2].into(),
                bytes: parse_u64(fields.get(3)) * 1024,
            }),
            Some("__TARGET__") => {
                target_kb = parse_u64(fields.get(1));
                directory_count = parse_u64(fields.get(2));
                validation_errors =
                    parse_u64(fields.get(3)) + parse_u64(fields.get(4)) + parse_u64(fields.get(5));
            }
            Some("__ID__") if fields.len() >= 3 => {
                identifiers.insert(fields[2].to_string(), parse_u64(fields.get(1)));
            }
            _ => {}
        }
    }

    if storage.is_empty() {
        return Err(
            "A rotina terminou sem devolver medições reconhecíveis. Nenhum arquivo foi alterado."
                .into(),
        );
    }
    let exclusively_expected = identifiers.len() == 1
        && identifiers.get(EXPECTED_CACHE).copied() == Some(directory_count)
        && validation_errors == 0
        && directory_count > 0;
    let cleanup_eligible = exclusively_expected;
    let (status, reason) = if directory_count == 0 {
        ("clear", "A área de caches descartados está vazia.".into())
    } else if cleanup_eligible {
        (
            "attention",
            "Todos os conjuntos correspondem exclusivamente ao cache documentado do Google Fotos."
                .into(),
        )
    } else {
        ("blocked", "A estrutura contém itens diferentes do caso conhecido. A limpeza automática foi bloqueada.".into())
    };

    Ok(DeepScanReport {
        scanned_at: Utc::now().to_rfc3339(),
        filesystem_free_bytes,
        storage,
        discarded_cache: CacheFinding {
            status,
            path: TARGET.into(),
            bytes: target_kb * 1024,
            directory_count,
            identifiers,
            cleanup_eligible,
            reason,
        },
        notes: vec![
            "Leitura executada pelo cabo USB; nenhum arquivo foi alterado.".into(),
            "Os tamanhos de diretório são estimativas produzidas por du no aparelho.".into(),
        ],
        source: "live",
    })
}

#[tauri::command]
fn scan_deep(
    app: AppHandle,
    state: State<'_, TunnelState>,
    password: String,
) -> Result<DeepScanReport, String> {
    if password.is_empty() {
        return Err("Informe a senha temporária do usuário mobile.".into());
    }
    let password = Zeroizing::new(password);
    ensure_tunnel(&app, &state)?;
    let session = connect_ssh(password.as_str())?;
    let output = run_root_script(&session, password.as_str(), SCAN_SCRIPT)?;
    parse_scan(&output)
}

fn cleanup_script() -> String {
    format!(
        r#"
set -eu
target='{TARGET}'
expected='{EXPECTED_CACHE}'
fail() {{ echo "RECUSADO: $*" >&2; exit 1; }}
[ "$target" = '{TARGET}' ] || fail 'caminho interno divergente'
[ -d "$target" ] || fail 'diretório de descarte inexistente'
bad_top=$(find "$target" -mindepth 1 -maxdepth 1 ! -type d -print -quit)
[ -z "$bad_top" ] || fail 'item inesperado no primeiro nível'
bad_second=$(find "$target" -mindepth 2 -maxdepth 2 ! -type d -print -quit)
[ -z "$bad_second" ] || fail 'item inesperado no segundo nível'
bad_name=$(find "$target" -mindepth 2 -maxdepth 2 -type d ! -name "$expected" -print -quit)
[ -z "$bad_name" ] || fail 'outro tipo de cache foi encontrado'
top_count=$(find "$target" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
cache_count=$(find "$target" -mindepth 2 -maxdepth 2 -type d -name "$expected" | wc -l | tr -d ' ')
[ "$top_count" -gt 0 ] || fail 'o alvo está vazio'
[ "$top_count" -eq "$cache_count" ] || fail 'os conjuntos não correspondem exclusivamente ao cache permitido'
before_kb=$(du -sk "$target" 2>/dev/null | awk '{{print $1}}')
chflags -R nouchg,noschg "$target"
find "$target" -depth -mindepth 1 -delete
remaining=$(find "$target" -mindepth 1 -print -quit)
[ -z "$remaining" ] || fail 'a exclusão não terminou completamente'
after_kb=$(du -sk "$target" 2>/dev/null | awk '{{print $1}}')
free_kb=$(df -k /private/var/mobile | awk 'NR==2 {{print $4}}')
echo "__CLEANUP__|${{before_kb:-0}}|${{after_kb:-0}}|${{free_kb:-0}}"
"#
    )
}

fn parse_cleanup(output: &str) -> Result<CleanupResult, String> {
    for line in output.lines() {
        let fields: Vec<&str> = line.split('|').collect();
        if fields.first() == Some(&"__CLEANUP__") && fields.len() >= 4 {
            return Ok(CleanupResult {
                completed_at: Utc::now().to_rfc3339(),
                before_bytes: parse_u64(fields.get(1)) * 1024,
                after_bytes: parse_u64(fields.get(2)) * 1024,
                filesystem_free_bytes: parse_u64(fields.get(3)) * 1024,
                message: "Limpeza concluída e alvo medido novamente.".into(),
            });
        }
    }
    Err("A limpeza não devolveu uma confirmação verificável.".into())
}

#[tauri::command]
fn cleanup_discarded_cache(
    app: AppHandle,
    state: State<'_, TunnelState>,
    password: String,
    confirmation: String,
) -> Result<CleanupResult, String> {
    if confirmation != CONFIRMATION {
        return Err("A frase de confirmação não corresponde ao texto exigido.".into());
    }
    if password.is_empty() {
        return Err("Informe novamente a senha temporária do usuário mobile.".into());
    }
    let password = Zeroizing::new(password);
    ensure_tunnel(&app, &state)?;
    let session = connect_ssh(password.as_str())?;

    let prescan = parse_scan(&run_root_script(&session, password.as_str(), SCAN_SCRIPT)?)?;
    if !prescan.discarded_cache.cleanup_eligible {
        return Err(format!(
            "Limpeza recusada após nova validação: {}",
            prescan.discarded_cache.reason
        ));
    }

    let output = run_root_script(&session, password.as_str(), &cleanup_script())?;
    parse_cleanup(&output)
}

#[tauri::command]
fn save_report(app: AppHandle, report_json: String) -> Result<String, String> {
    if report_json.len() > 2_000_000 {
        return Err("O relatório excede o limite de 2 MB.".into());
    }
    let parsed: serde_json::Value = serde_json::from_str(&report_json)
        .map_err(|_| "O conteúdo do relatório não é um JSON válido.".to_string())?;
    if parsed.get("schema").and_then(|value| value.as_str())
        != Some("ios-storage-forensics-report/v1")
    {
        return Err("O esquema do relatório não foi reconhecido.".into());
    }

    let directory = app
        .path()
        .download_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta Downloads: {error}"))?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = directory.join(format!("ios-storage-report-{stamp}.json"));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("Não foi possível criar o relatório: {error}"))?;
    file.write_all(report_json.as_bytes())
        .map_err(|error| format!("Não foi possível gravar o relatório: {error}"))?;
    file.flush()
        .map_err(|error| format!("Não foi possível finalizar o relatório: {error}"))?;
    Ok(path.display().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(TunnelState::default())
        .invoke_handler(tauri::generate_handler![
            platform_status,
            scan_usb_device,
            scan_deep,
            cleanup_discarded_cache,
            save_report
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar iOS Storage Forensics");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn exposes_linux_specific_dependency_guidance() {
        assert_eq!(resource_platform_directory(), "linux");
        assert!(platform_driver_hint().contains("libusbmuxd-tools"));
        assert!(missing_ideviceinfo_message().contains("libimobiledevice-utils"));
        assert!(missing_iproxy_message().contains("libusbmuxd-tools"));
    }

    #[test]
    fn parses_safe_documented_finding() {
        let output = "__FREE__|563200\n__SIZE__|Caches|/private/var/mobile/Library/Caches|17825792\n__TARGET__|16777216|242|0|0|0\n__ID__|242|com.google.photos.mdd.downloads\n";
        let report = parse_scan(output).unwrap();
        assert_eq!(report.discarded_cache.directory_count, 242);
        assert!(report.discarded_cache.cleanup_eligible);
        assert_eq!(report.discarded_cache.status, "attention");
    }

    #[test]
    fn blocks_unknown_cache() {
        let output = "__FREE__|100\n__SIZE__|Caches|/private/var/mobile/Library/Caches|200\n__TARGET__|80|1|0|0|1\n__ID__|1|unknown.cache\n";
        let report = parse_scan(output).unwrap();
        assert!(!report.discarded_cache.cleanup_eligible);
        assert_eq!(report.discarded_cache.status, "blocked");
    }

    #[test]
    fn quotes_shell_text() {
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }
}
