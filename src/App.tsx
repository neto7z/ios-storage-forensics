import { useEffect, useMemo, useState } from "react";
import { cleanupDiscardedCache, isDesktop, platformStatus, saveReport, scanDeep, scanUsbDevice } from "./backend";
import { demoDeepScan, demoDevice, demoPlatform } from "./demo";
import { formatBytes, formatDate, formatTemperature, severityLabel } from "./format";
import type { CleanupResult, DeepScanReport, DeviceSnapshot, PlatformStatus, TechnicianReport } from "./types";

type Phase = "connect" | "device" | "deep" | "review";

const steps: { id: Phase; label: string; short: string }[] = [
  { id: "connect", label: "Preparar", short: "1" },
  { id: "device", label: "Identificar", short: "2" },
  { id: "deep", label: "Investigar", short: "3" },
  { id: "review", label: "Documentar", short: "4" },
];

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
  const [showTechnical, setShowTechnical] = useState(false);
  const [reportMessage, setReportMessage] = useState<string>();

  useEffect(() => {
    if (!demoRequested) {
      platformStatus().then(setPlatform).catch((value) => setError(errorText(value)));
    }
  }, []);

  const activeIndex = steps.findIndex((item) => item.id === phase);
  const maxStorage = useMemo(() => Math.max(...(deep?.storage.map((item) => item.bytes) ?? [1])), [deep]);

  async function handleUsbScan() {
    setBusy("Lendo o aparelho pela conexão USB…");
    setError(undefined);
    try {
      const result = await scanUsbDevice();
      setDevice(result);
      setPhase("device");
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
    setPhase("review");
    setError(undefined);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function handleDeepScan(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return setError("Informe a senha temporária do usuário mobile.");
    setBusy("Medindo o armazenamento sem alterar arquivos…");
    setError(undefined);
    try {
      const result = await scanDeep(password);
      setDeep(result);
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
      appVersion: "0.1.0",
      device: safeDevice,
      deepScan: deep,
      cleanup,
      privacy: "Nome, UDID, serial, conta Apple e credenciais não são incluídos.",
    };
    const json = JSON.stringify(report, null, 2);
    setError(undefined);
    try {
      if (isDesktop()) {
        const path = await saveReport(json);
        setReportMessage(`Relatório salvo em ${path}`);
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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div className="brand-copy">
          <strong>iOS Storage Forensics</strong>
          <span>Estação técnica</span>
        </div>
        <div className="topbar-spacer" />
        <span className={`runtime-badge ${isDesktop() ? "live" : "demo"}`}>
          <i /> {isDesktop() ? "Aplicativo local" : "Prévia no navegador"}
        </span>
        <button className="quiet-button" onClick={handleDemo}>Abrir demonstração</button>
      </header>

      <main className="workspace">
        <nav className="stepper" aria-label="Etapas do atendimento">
          {steps.map((step, index) => (
            <div className={`step ${index <= activeIndex ? "active" : ""}`} key={step.id}>
              <span>{index < activeIndex ? "✓" : step.short}</span>
              <small>{step.label}</small>
            </div>
          ))}
        </nav>

        <section className="intro-row">
          <div>
            <p className="eyebrow">ATENDIMENTO LOCAL · DADOS NÃO ENVIADOS</p>
            <h1>Descubra o que ocupa espaço antes de apagar.</h1>
            <p>Conecte o iPhone, registre as medições e trate somente achados que o aplicativo conseguir validar.</p>
          </div>
          <div className="session-number">
            <span>SESSÃO</span>
            <strong>{device ? "EM ANÁLISE" : "NOVA"}</strong>
          </div>
        </section>

        {error && <div className="alert error" role="alert"><strong>Não foi possível continuar.</strong><span>{error}</span><button onClick={() => setError(undefined)}>×</button></div>}
        {busy && <div className="activity"><span className="spinner" /><div><strong>{busy}</strong><small>Não desconecte o cabo durante esta etapa.</small></div></div>}

        <div className="content-grid">
          <section className="main-column">
            <article className="panel connection-panel">
              <div className="panel-heading">
                <div><span className="section-index">01</span><div><h2>Conexão e autorização</h2><p>O diagnóstico padrão funciona sem jailbreak.</p></div></div>
                <StatusPill ok={Boolean(device?.connected)} label={device?.connected ? "Conectado" : "Aguardando"} />
              </div>

              {!device ? (
                <div className="connect-empty">
                  <div className="cable-illustration"><span className="phone" /><span className="cable" /><span className="usb">USB</span></div>
                  <div>
                    <h3>Conecte e desbloqueie o iPhone</h3>
                    <ol>
                      <li>Use um cabo de dados e desbloqueie o aparelho.</li>
                      <li>Toque em <b>Confiar</b> quando o iPhone perguntar.</li>
                      <li>Clique abaixo para fazer uma leitura segura.</li>
                    </ol>
                    <button className="primary-button" onClick={handleUsbScan} disabled={Boolean(busy)}>Detectar aparelho</button>
                  </div>
                </div>
              ) : (
                <DeviceCard device={device} />
              )}

              {platform && (
                <details className="requirements">
                  <summary>Verificar componentes do computador</summary>
                  <div className="tool-grid">
                    {platform.tools.map((tool) => (
                      <div className="tool-item" key={tool.id}><span className={tool.available ? "tool-ok" : "tool-missing"}>{tool.available ? "✓" : "!"}</span><div><strong>{tool.label}</strong><small>{tool.detail}</small></div></div>
                    ))}
                  </div>
                  <p>{platform.driverHint}</p>
                </details>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><span className="section-index">02</span><div><h2>Análise de armazenamento</h2><p>O modo profundo apenas mede até você autorizar uma limpeza.</p></div></div>
                <StatusPill ok={Boolean(deep)} label={deep ? "Concluída" : "Não iniciada"} />
              </div>

              {!deep ? (
                <div className="analysis-choice">
                  <div>
                    <span className="mode-label">LEITURA AVANÇADA</span>
                    <h3>Investigar o sistema de arquivos</h3>
                    <p>Requer jailbreak rootless, OpenSSH ativo e uma senha temporária do usuário <code>mobile</code>.</p>
                  </div>
                  <button className="secondary-button" disabled={!device || Boolean(busy)} onClick={() => setSshOpen(true)}>Configurar acesso profundo</button>
                </div>
              ) : (
                <DeepResults report={deep} maxStorage={maxStorage} />
              )}
            </article>

            {deep && (
              <article className={`panel finding ${deep.discardedCache.status}`}>
                <div className="finding-top">
                  <div><span className="mode-label">ACHADO VALIDADO</span><h2>Cache de descarte do iOS</h2></div>
                  <span className="finding-severity">{severityLabel(deep.discardedCache.status)}</span>
                </div>
                <div className="finding-number"><strong>{formatBytes(deep.discardedCache.bytes)}</strong><span>em {deep.discardedCache.directoryCount} conjuntos descartados</span></div>
                <p>{deep.discardedCache.reason}</p>
                <details className="technical-details" open={showTechnical} onToggle={(event) => setShowTechnical(event.currentTarget.open)}>
                  <summary>Ver evidências técnicas</summary>
                  <code>{deep.discardedCache.path}</code>
                  {Object.entries(deep.discardedCache.identifiers).map(([name, count]) => <div className="identifier" key={name}><span>{name}</span><b>{count}×</b></div>)}
                </details>
                <div className="finding-actions">
                  <div><strong>Nada será apagado sem uma segunda validação.</strong><small>A operação é recusada se surgir qualquer conteúdo diferente do caso documentado.</small></div>
                  <button className="danger-button" disabled={!deep.discardedCache.cleanupEligible || Boolean(cleanup)} onClick={() => setConfirmOpen(true)}>{cleanup ? "Limpeza registrada" : "Revisar limpeza"}</button>
                </div>
              </article>
            )}
          </section>

          <aside className="side-column">
            <article className="panel summary-panel">
              <p className="eyebrow">RESUMO DA SESSÃO</p>
              <SummaryRow label="Aparelho" value={device?.connected ? "Identificado" : "Pendente"} state={device ? "ok" : "idle"} />
              <SummaryRow label="Bateria" value={device?.battery?.healthPercent !== undefined ? `${device.battery.healthPercent.toFixed(1)}% estimados` : "Não lida"} state={device?.battery ? "warn" : "idle"} />
              <SummaryRow label="Análise profunda" value={deep ? formatBytes(deep.discardedCache.bytes) : "Pendente"} state={deep ? (deep.discardedCache.status === "clear" ? "ok" : "warn") : "idle"} />
              <SummaryRow label="Alterações" value={cleanup ? "1 registrada" : "Nenhuma"} state={cleanup ? "ok" : "idle"} />
              <button className="report-button" disabled={!device} onClick={exportReport}>Exportar relatório JSON</button>
              <small className="privacy-note">O relatório omite nome, UDID, número de série, conta Apple e senhas.</small>
              {reportMessage && <div className="report-message">✓ {reportMessage}</div>}
            </article>

            <article className="panel safety-panel">
              <span className="shield">✓</span>
              <div><h3>Escopo conservador</h3><p>O aplicativo não oferece explorador de arquivos nem terminal livre. As rotinas remotas são fixas, revisáveis e limitadas ao diagnóstico publicado.</p></div>
            </article>

            {cleanup && (
              <article className="panel result-panel">
                <p className="eyebrow">ÚLTIMA ALTERAÇÃO</p>
                <h3>{cleanup.message}</h3>
                <dl><div><dt>Antes</dt><dd>{formatBytes(cleanup.beforeBytes)}</dd></div><div><dt>Depois</dt><dd>{formatBytes(cleanup.afterBytes)}</dd></div><div><dt>Livre</dt><dd>{formatBytes(cleanup.filesystemFreeBytes)}</dd></div></dl>
              </article>
            )}
          </aside>
        </div>
      </main>

      {sshOpen && (
        <Modal title="Acesso profundo pelo cabo" onClose={() => { setSshOpen(false); setPassword(""); }}>
          <form onSubmit={handleDeepScan}>
            <p>A senha é usada somente em memória para esta leitura e é apagada do formulário ao terminar.</p>
            <label>Usuário<input value="mobile" disabled /></label>
            <label>Senha temporária<input autoFocus type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha do usuário mobile" /></label>
            <div className="modal-note"><b>Antes de continuar:</b> confirme que o OpenSSH está ativo no aparelho e que o computador está autorizado.</div>
            <div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setSshOpen(false)}>Cancelar</button><button className="primary-button" disabled={Boolean(busy)}>Iniciar leitura</button></div>
          </form>
        </Modal>
      )}

      {confirmOpen && deep && (
        <Modal title="Autorização de limpeza" onClose={() => { setConfirmOpen(false); setPassword(""); setConfirmation(""); }} danger>
          <form onSubmit={handleCleanup}>
            <div className="target-review"><span>Alvo validado</span><strong>{formatBytes(deep.discardedCache.bytes)}</strong><code>{deep.discardedCache.path}</code></div>
            <p>O aplicativo medirá e validará novamente o conteúdo. Se houver outro tipo de cache ou estrutura inesperada, a operação será recusada.</p>
            <label>Digite exatamente <b>APAGAR CACHES DESCARTADOS</b><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <label>Senha temporária do usuário mobile<input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setConfirmOpen(false)}>Voltar</button><button className="danger-button" disabled={confirmation !== "APAGAR CACHES DESCARTADOS" || Boolean(busy)}>Executar limpeza restrita</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`status-pill ${ok ? "ok" : "idle"}`}><i />{label}</span>;
}

function DeviceCard({ device }: { device: DeviceSnapshot }) {
  const battery = device.battery;
  return <div className="device-card">
    <div className="device-icon"><span /></div>
    <div className="device-title"><span>{device.source === "demo" ? "DEMONSTRAÇÃO" : "APARELHO AUTORIZADO"}</span><h3>{device.name ?? "iPhone"}</h3><p>{device.productType ?? "Modelo não identificado"} · iOS {device.iosVersion ?? "—"} · build {device.buildVersion ?? "—"}</p></div>
    <div className="device-metrics">
      <div><span>Saúde estimada</span><strong>{battery?.healthPercent !== undefined ? `${battery.healthPercent.toFixed(1)}%` : "—"}</strong></div>
      <div><span>Ciclos</span><strong>{battery?.cycleCount ?? "—"}</strong></div>
      <div><span>Temperatura</span><strong>{formatTemperature(battery?.temperatureC)}</strong></div>
    </div>
  </div>;
}

function DeepResults({ report, maxStorage }: { report: DeepScanReport; maxStorage: number }) {
  return <div className="deep-results">
    <div className="scan-meta"><span>Leitura {report.source === "demo" ? "demonstrativa" : "local"}</span><small>{formatDate(report.scannedAt)} · {formatBytes(report.filesystemFreeBytes)} livres</small></div>
    <div className="storage-bars">
      {report.storage.map((entry) => <div className="storage-row" key={entry.path}><div><span>{entry.label}</span><b>{formatBytes(entry.bytes)}</b></div><div className="bar"><i style={{ width: `${Math.max(3, entry.bytes / maxStorage * 100)}%` }} /></div><code>{entry.path}</code></div>)}
    </div>
  </div>;
}

function SummaryRow({ label, value, state }: { label: string; value: string; state: "ok" | "warn" | "idle" }) {
  return <div className="summary-row"><span className={`summary-dot ${state}`} /><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Modal({ title, children, onClose, danger = false }: React.PropsWithChildren<{ title: string; onClose: () => void; danger?: boolean }>) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${danger ? "danger" : ""}`} role="dialog" aria-modal="true"><header><div><span className="modal-kicker">{danger ? "OPERAÇÃO DESTRUTIVA" : "CONEXÃO SEGURA"}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="Fechar">×</button></header>{children}</section></div>;
}

export default App;
