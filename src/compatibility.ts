import type { DeviceSnapshot } from "./types";

export type CompatibilityStatus = "supported" | "unavailable" | "unknown";

export type AccessMethod = {
  id: "dopamine" | "palera1n";
  name: string;
  officialUrl: string;
  note: string;
};

export type AccessCompatibility = {
  basicStatus: "supported";
  advancedStatus: CompatibilityStatus;
  chip?: string;
  summary: string;
  detail: string;
  methods: AccessMethod[];
  matrixUpdatedAt: string;
};

export const COMPATIBILITY_MATRIX_UPDATED_AT = "2026-08-24";

const DOPAMINE: AccessMethod = {
  id: "dopamine",
  name: "Dopamine",
  officialUrl: "https://github.com/opa334/Dopamine",
  note: "Jailbreak rootless semi-untethered. A ativação é confirmada no próprio iPhone.",
};

const PALERA1N: AccessMethod = {
  id: "palera1n",
  name: "palera1n",
  officialUrl: "https://github.com/palera1n/palera1n",
  note: "Método para aparelhos A8–A11. Algumas combinações possuem restrições de senha e segurança.",
};

const chipByProductGeneration: Record<number, string> = {
  5: "A6",
  6: "A7",
  7: "A8",
  8: "A9",
  9: "A10",
  10: "A11",
  11: "A12",
  12: "A13",
  13: "A14",
  14: "A15",
  15: "A16",
  16: "A17",
  17: "A18",
  18: "A19",
};

function chipNumber(chip?: string): number | undefined {
  const value = chip?.match(/^A(\d+)$/)?.[1];
  return value ? Number(value) : undefined;
}

export function chipForProductType(productType?: string): string | undefined {
  const generation = productType?.match(/^iPhone(\d+),\d+$/)?.[1];
  return generation ? chipByProductGeneration[Number(generation)] : undefined;
}

type Version = [number, number, number];

function parseVersion(value?: string): Version | undefined {
  if (!value) return undefined;
  const parts = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!parts) return undefined;
  return [Number(parts[1]), Number(parts[2] ?? 0), Number(parts[3] ?? 0)];
}

function compare(left: Version, right: Version): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function between(version: Version, minimum: Version, maximum?: Version): boolean {
  return compare(version, minimum) >= 0 && (!maximum || compare(version, maximum) <= 0);
}

function supportsDopamine(chip: number, version: Version): boolean {
  if (chip >= 8 && chip <= 11) {
    return between(version, [15, 0, 0], [18, 7, 1]);
  }

  if (chip === 12 || chip === 13) {
    return between(version, [15, 0, 0], [18, 7, 1])
      || between(version, [26, 0, 0], [26, 0, 1]);
  }

  if (chip >= 14) {
    return between(version, [15, 0, 0], [17, 3, 1]);
  }

  return false;
}

function supportsPalera1n(chip: number, version: Version): boolean {
  return chip >= 8 && chip <= 11 && between(version, [15, 0, 0]);
}

export function assessCompatibility(device: Pick<DeviceSnapshot, "productType" | "iosVersion">): AccessCompatibility {
  const matrixUpdatedAt = COMPATIBILITY_MATRIX_UPDATED_AT;
  const chip = chipForProductType(device.productType);
  const numericChip = chipNumber(chip);
  const version = parseVersion(device.iosVersion);

  if (!device.productType || !device.iosVersion || !numericChip || !version) {
    return {
      basicStatus: "supported",
      advancedStatus: "unknown",
      chip,
      summary: "Diagnóstico básico disponível",
      detail: "Não foi possível cruzar automaticamente o modelo e o iOS. O acesso avançado precisa de verificação manual.",
      methods: [],
      matrixUpdatedAt,
    };
  }

  const methods: AccessMethod[] = [];
  if (supportsDopamine(numericChip, version)) methods.push(DOPAMINE);
  if (supportsPalera1n(numericChip, version)) methods.push(PALERA1N);

  if (methods.length > 0) {
    return {
      basicStatus: "supported",
      advancedStatus: "supported",
      chip,
      summary: `Acesso avançado compatível via ${methods.map((method) => method.name).join(" ou ")}`,
      detail: "O aplicativo orienta a preparação, mas a ativação do jailbreak exige confirmação no próprio aparelho.",
      methods,
      matrixUpdatedAt,
    };
  }

  return {
    basicStatus: "supported",
    advancedStatus: "unavailable",
    chip,
    summary: "Nenhum método auditado para esta combinação",
    detail: "A identificação USB e o relatório continuam disponíveis. A leitura interna ficará bloqueada até surgir um método público compatível ou até o aparelho já possuir acesso autorizado.",
    methods: [],
    matrixUpdatedAt,
  };
}
