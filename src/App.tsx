import { useEffect, useMemo, useState } from "react";
import { cleanupDiscardedCache, isDesktop, platformStatus, saveReport, scanDeep, scanUsbDevice } from "./backend";
import { demoDeepScan, demoDevice, demoPlatform } from "./demo";
import { formatBytes, formatDate, formatTemperature, severityLabel } from "./format";
import type { CleanupResult, DeepScanReport, DeviceSnapshot, PlatformStatus, TechnicianReport } from "./types";

type Phase = "connect" | "device" | "deep" | "review";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Ocorreu um erro inesperado.";

const demoRequested = new URLSearchParams(window.location.search).has("demo");

function App() {
  const [platform, setPlatform] = useState<PlatformStatus | undefined>(demoRequested ? demoPlatform : undefined);
  const [device, setDevice] = useState<DeviceSnapshot | undefined>(demoRequested ? demoDevice : undefined);
  const [deep, setDeep] = useState<DeepScanReport | undefined>(demoRequested ? { ...demoDeepScan, scannedAt: new Date().toISOString() } : undefined);
  const [cleanup, setCleanup] = useState<CleanupResult>();
  const [phase, setPhase] = useState<Phase>(demoRequested ? "review" : "connect");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [sshOpen, setSshOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reportMessage, setReportMessage] = useState<string>();

  useEffect(() => {
    if (!demoRequested) platformStatus().then(setPlatform).catch((value) => setError(errorText(value)));
  }, []);

  const maxStorage = useMemo(() => Math.max(...(deep?.storage.map((item) => item.bytes) ?? [1])), [deep]);

  function jumpTo(next: Phase) {
    setPhase(next);
    const target = document.getElementById(next);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleUsbScan() {
    setBusy("Lendo o aparelho pela conexão USB…");
    setError(undefined);
    try {
      const result = await scanUsbDevice();
      setDevice(result);
      setPhase("device");
      requestAnimationFrame(() => document.getElementById("device")?.scrollIntoView({ behavior: "smooth" }));
    } catch (value) {
      setError(errorText(value));
    } finally {
      setBusy(undefined);
    }
  }

  function handleDemo() {
    setPlatform(demoPlatform);
    setDevice(demoDevice);
    setDeep({ ...demoDeepScan, scannedAt: new Date().toISOString() });
    setCleanup(undefined);
    setPhase("connect");
    setError(undefined);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function handleDeepScan(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return setError("Informe a senha temporária do usuário mobile.");
    setBusy("Medindo o armazenamento sem alterar arquivos…");
    setError(undefined);
    try {
      setDeep(await scanDeep(password));
      setPhase("deep");
      setSshOpen(false);
    } catch (value) {
      setError(errorText(value));
    } finally {
      setPassword("");
      setBusy(undefined);
    }
  }

  async function handleCleanup(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return setError("Informe novamente a senha temporária do usuário mobile.");
    setBusy("Revalidando o alvo e executando a limpeza restrita…");
    setError(undefined);
    try {
      const result = await cleanupDiscardedCache(password, confirmation);
      setCleanup(result);
      setDeep((current) => current ? {
        ...current,
        filesystemFreeBytes: result.filesystemFreeBytes,
        discardedCache: {
          ...current.discardedCache,
          bytes: result.afterBytes,
          directoryCount: 0,
          identifiers: {},
          cleanupEligible: false,
          status: "clear",
          reason: "O alvo validado foi limpo e medido novamente.",
        },
      } : current);
      setPhase("review");
      setConfirmOpen(false);
    } catch (value) {
      setError(errorText(value));
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(undefined);
    }
  }

  async function exportReport() {
    if (!device) return;
    const { name: _privateName, ...safeDevice } = device;
    const report: TechnicianReport = {
      schema: "ios-storage-forensics-report/v1",
      generatedAt: new Date().toISOString(),
      appVersion: "0.2.0",
      device: safeDevice,
      deepScan: deep,
      cleanup,
      privacy: "Nome, UDID, serial, conta Apple e credenciais não são incluídos.",
    };
    setError(undefined);
    try {
      const json = JSON.stringify(report, null, 2);
      if (isDesktop()) {
        setReportMessage(`Relatório salvo em ${await saveReport(json)}`);
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = `ios-storage-report-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(href);
        setReportMessage("Relatório demonstrativo baixado pelo navegador.");
      }
      setPhase("review");
    } catch (value) {
      setError(errorText(value));
    }
  }

  return (
    <div className="application">
      <header className="appbar">
        <div className="app-identity">
          <span className="app-icon" aria-hidden="true"><i /></span>
          <div><strong>iOS Storage Forensics</strong><small>Ferramenta de diagnóstico local</small></div>
        </div>
        <div className="appbar-actions">
          <span className={`environment ${isDesktop() ? "local" : "preview"}`}><i />{isDesktop() ? `${platform?.os === "linux" ? "Linux" : platform?.os === "windows" ? "Windows" : "Aplicativo"} local` : "Prévia web"}</span>
          <button className="button text-button" onClick={handleDemo}>Carregar exemplo</button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="navigation">
          <div className="nav-heading">Atendimento</div>
          <nav aria-label="Etapas do diagnóstico">
            <NavItem number="1" label="Conexão" shortLabel="Conexão" state={device ? "done" : phase === "connect" ? "active" : "idle"} onClick={() => jumpTo("connect")} />
            <NavItem number="2" label="Aparelho" shortLabel="Aparelho" state={phase === "device" ? "active" : device ? "done" : "idle"} disabled={!device} onClick={() => jumpTo("device")} />
            <NavItem number="3" label="Armazenamento" shortLabel="Espaço" state={phase === "deep" ? "active" : deep ? "done" : "idle"} disabled={!device} onClick={() => jumpTo("deep")} />
            <NavItem number="4" label="Relatório" shortLabel="Relatório" state={phase === "review" ? "active" : cleanup ? "done" : "idle"} disabled={!device} onClick={() => jumpTo("review")} />
          </nav>
          <div className="nav-footer"><span>Privacidade</span><p>O arquivo e as credenciais não são enviados para servidores.</p></div>
        </aside>

        <main className="work-area">
          <div className="page-title">
            <div><h1>Diagnóstico do aparelho</h1><p>Identifique o uso do armazenamento e registre somente alterações autorizadas.</p></div>
            <span className={`session-state ${device ? "running" : "new"}`}>{device ? "Sessão em andamento" : "Nova sessão"}</span>
          </div>

          {error && <div className="message error" role="alert"><div><strong>Não foi possível continuar</strong><span>{error}</span></div><button aria-label="Fechar aviso" onClick={() => setError(undefined)}>×</button></div>}
          {busy && <div className="message progress" role="status"><span className="spinner" /><div><strong>{busy}</strong><span>Não desconecte o cabo durante esta etapa.</span></div></div>}

          <section className="workspace-section" id="connect">
            <SectionHeader number="1" title="Conexão" description="Conecte, desbloqueie e autorize o computador." status={device ? "Conectado" : "Aguardando"} ok={Boolean(device)} />
            {!device ? <ConnectionEmpty onScan={handleUsbScan} busy={Boolean(busy)} /> : <ConnectedSummary device={device} onScan={handleUsbScan} busy={Boolean(busy)} />}
            {platform && <Requirements platform={platform} />}
          </section>

          <section className="workspace-section" id="device">
            <SectionHeader number="2" title="Aparelho" description="Informações coletadas pela leitura USB padrão." status={device ? "Identificado" : "Pendente"} ok={Boolean(device)} />
            {device ? <DeviceOverview device={device} /> : <EmptyRow>Conclua a conexão para identificar o aparelho.</EmptyRow>}
          </section>

          <section className="workspace-section" id="deep">
            <SectionHeader number="3" title="Armazenamento" description="A leitura profunda mede os diretórios sem alterar arquivos." status={deep ? "Analisado" : "Pendente"} ok={Boolean(deep)} />
            {!deep ? (
              <div className="action-row">
                <div><strong>Leitura avançada pelo cabo</strong><p>Requer jailbreak rootless, OpenSSH ativo e a senha temporária do usuário <code>mobile</code>.</p></div>
                <button className="button secondary-button" disabled={!device || Boolean(busy)} onClick={() => setSshOpen(true)}>Configurar acesso</button>
              </div>
            ) : (
              <>
                <StorageTable report={deep} maxStorage={maxStorage} />
                <Finding report={deep} cleanup={cleanup} onCleanup={() => setConfirmOpen(true)} />
              </>
            )}
          </section>

          <section className="workspace-section" id="review">
            <SectionHeader number="4" title="Relatório" description="Gere um registro técnico sem identificadores pessoais." status={reportMessage ? "Exportado" : "Disponível"} ok={Boolean(reportMessage)} />
            <div className="report-row">
              <div><strong>Relatório JSON da sessão</strong><p>Não inclui nome, UDID, número de série, conta Apple ou senhas.</p></div>
              <button className="button primary-button" disabled={!device} onClick={exportReport}>Exportar relatório</button>
            </div>
            {reportMessage && <div className="report-result">{reportMessage}</div>}
            {cleanup && <div className="cleanup-result"><strong>{cleanup.message}</strong><dl><Metric label="Antes" value={formatBytes(cleanup.beforeBytes)} /><Metric label="Depois" value={formatBytes(cleanup.afterBytes)} /><Metric label="Espaço livre" value={formatBytes(cleanup.filesystemFreeBytes)} /></dl></div>}
          </section>
        </main>
      </div>

      {sshOpen && (
        <Modal title="Configurar leitura profunda" label="Conexão segura" onClose={() => { setSshOpen(false); setPassword(""); }}>
          <form onSubmit={handleDeepScan}>
            <p>A senha permanece somente na memória durante a leitura e é removida ao terminar.</p>
            <label>Usuário<input value="mobile" disabled /></label>
            <label>Senha temporária<input autoFocus type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha do usuário mobile" /></label>
            <div className="modal-note"><strong>Antes de continuar</strong><span>Confirme que o OpenSSH está ativo e que este computador foi autorizado.</span></div>
            <div className="modal-actions"><button type="button" className="button text-button" onClick={() => setSshOpen(false)}>Cancelar</button><button className="button primary-button" disabled={Boolean(busy)}>Iniciar leitura</button></div>
          </form>
        </Modal>
      )}

      {confirmOpen && deep && (
        <Modal title="Autorizar limpeza" label="Operação destrutiva" onClose={() => { setConfirmOpen(false); setPassword(""); setConfirmation(""); }} danger>
          <form onSubmit={handleCleanup}>
            <div className="target-review"><span>Alvo validado</span><strong>{formatBytes(deep.discardedCache.bytes)}</strong><code>{deep.discardedCache.path}</code></div>
            <p>O conteúdo será medido e validado novamente. Se a estrutura tiver mudado, a operação será recusada.</p>
            <label>Digite exatamente <b>APAGAR CACHES DESCARTADOS</b><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <label>Senha temporária do usuário mobile<input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" className="button text-button" onClick={() => setConfirmOpen(false)}>Voltar</button><button className="button danger-button" disabled={confirmation !== "APAGAR CACHES DESCARTADOS" || Boolean(busy)}>Executar limpeza</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function NavItem({ number, label, shortLabel, state, disabled, onClick }: { number: string; label: string; shortLabel: string; state: "active" | "done" | "idle"; disabled?: boolean; onClick: () => void }) {
  return <button className={`nav-item ${state}`} disabled={disabled} onClick={onClick}><span>{state === "done" ? "✓" : number}</span><strong><span className="nav-label-full">{label}</span><span className="nav-label-short">{shortLabel}</span></strong></button>;
}

function SectionHeader({ number, title, description, status, ok }: { number: string; title: string; description: string; status: string; ok: boolean }) {
  return <header className="section-header"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div><span className={`status ${ok ? "ok" : "idle"}`}><i />{status}</span></header>;
}

function ConnectionEmpty({ onScan, busy }: { onScan: () => void; busy: boolean }) {
  return <div className="connection-empty"><div className="connection-copy"><strong>Prepare o iPhone</strong><ol><li>Conecte com um cabo de dados.</li><li>Desbloqueie o aparelho.</li><li>Toque em <b>Confiar</b> quando solicitado.</li></ol></div><button className="button primary-button" disabled={busy} onClick={onScan}>Detectar aparelho</button></div>;
}

function ConnectedSummary({ device, onScan, busy }: { device: DeviceSnapshot; onScan: () => void; busy: boolean }) {
  return <div className="connected-summary"><div className="phone-symbol" aria-hidden="true"><i /></div><div><strong>{device.name ?? "iPhone"}</strong><span>{device.productType ?? "Modelo não identificado"} · iOS {device.iosVersion ?? "—"}</span></div><button className="button text-button" disabled={busy} onClick={onScan}>Ler novamente</button></div>;
}

function DeviceOverview({ device }: { device: DeviceSnapshot }) {
  const battery = device.battery;
  return <div className="device-overview"><div className="device-identification"><span>{device.source === "demo" ? "Dados de demonstração" : "Aparelho autorizado"}</span><strong>{device.name ?? "iPhone"}</strong><small>{device.productType ?? "Modelo não identificado"} · iOS {device.iosVersion ?? "—"} · build {device.buildVersion ?? "—"}</small></div><dl className="metric-grid"><Metric label="Saúde estimada" value={battery?.healthPercent !== undefined ? `${battery.healthPercent.toFixed(1)}%` : "—"} /><Metric label="Ciclos" value={`${battery?.cycleCount ?? "—"}`} /><Metric label="Temperatura" value={formatTemperature(battery?.temperatureC)} /></dl></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Requirements({ platform }: { platform: PlatformStatus }) {
  return <details className="requirements"><summary>Componentes do computador</summary><div className="requirement-list">{platform.tools.map((tool) => <div className="requirement" key={tool.id}><span className={tool.available ? "available" : "missing"}>{tool.available ? "✓" : "!"}</span><div><strong>{tool.label}</strong><small>{tool.detail}</small></div></div>)}</div><p>{platform.driverHint}</p></details>;
}

function StorageTable({ report, maxStorage }: { report: DeepScanReport; maxStorage: number }) {
  return <div className="storage-table"><div className="storage-meta"><span>Leitura {report.source === "demo" ? "demonstrativa" : "local"}</span><span>{formatDate(report.scannedAt)} · {formatBytes(report.filesystemFreeBytes)} livres</span></div>{report.storage.map((entry) => <div className="storage-entry" key={entry.path}><div><strong>{entry.label}</strong><code>{entry.path}</code></div><div className="usage"><span><i style={{ width: `${Math.max(3, entry.bytes / maxStorage * 100)}%` }} /></span><b>{formatBytes(entry.bytes)}</b></div></div>)}</div>;
}

function Finding({ report, cleanup, onCleanup }: { report: DeepScanReport; cleanup?: CleanupResult; onCleanup: () => void }) {
  const finding = report.discardedCache;
  return <div className={`finding-row ${finding.status}`}><div className="finding-content"><div className="finding-heading"><strong>Cache de descarte do iOS</strong><span>{severityLabel(finding.status)}</span></div><div className="finding-value"><b>{formatBytes(finding.bytes)}</b><span>{finding.directoryCount} conjuntos descartados</span></div><p>{finding.reason}</p><details><summary>Ver evidências técnicas</summary><code>{finding.path}</code>{Object.entries(finding.identifiers).map(([name, count]) => <div className="identifier" key={name}><span>{name}</span><b>{count}×</b></div>)}</details></div><div className="finding-action"><small>A limpeza é revalidada antes de executar.</small><button className="button danger-button" disabled={!finding.cleanupEligible || Boolean(cleanup)} onClick={onCleanup}>{cleanup ? "Limpeza registrada" : "Revisar limpeza"}</button></div></div>;
}

function EmptyRow({ children }: React.PropsWithChildren) {
  return <div className="empty-row">{children}</div>;
}

function Modal({ title, label, children, onClose, danger = false }: React.PropsWithChildren<{ title: string; label: string; onClose: () => void; danger?: boolean }>) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${danger ? "danger" : ""}`} role="dialog" aria-modal="true"><header><div><span>{label}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="Fechar">×</button></header>{children}</section></div>;
}

export default App;
