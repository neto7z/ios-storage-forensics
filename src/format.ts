export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "Não disponível";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatTemperature(value?: number): string {
  return value === undefined ? "Não disponível" : `${value.toFixed(1)} °C`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function severityLabel(status: "clear" | "attention" | "blocked"): string {
  return { clear: "Sem achado", attention: "Revisão necessária", blocked: "Limpeza bloqueada" }[status];
}
