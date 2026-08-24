import { describe, expect, it } from "vitest";
import { formatBytes, severityLabel } from "./format";

describe("formatBytes", () => {
  it("formata bytes e gigabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(16 * 1024 ** 3)).toBe("16 GB");
    expect(formatBytes(undefined)).toBe("Não disponível");
  });
});

describe("severityLabel", () => {
  it("traduz o estado do achado", () => {
    expect(severityLabel("blocked")).toBe("Limpeza bloqueada");
  });
});
