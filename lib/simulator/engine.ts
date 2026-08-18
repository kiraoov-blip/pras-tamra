import type {
  HourlyPoint,
  SimulationInput,
  SimulationResult,
} from "./types";

export const ENGINE_VERSION = "0.0.1-skeleton";

export function validateSimulationInput(input: SimulationInput): string[] {
  const errors: string[] = [];

  if (input.customerCount <= 0) errors.push("대상 고객 수는 1 이상이어야 합니다.");
  if (input.participationRate < 0 || input.participationRate > 1) {
    errors.push("참여율은 0과 1 사이여야 합니다.");
  }
  if (input.discountRate < 0 || input.discountRate > 1) {
    errors.push("할인율은 0과 1 사이여야 합니다.");
  }
  if (input.shiftRate < 0 || input.shiftRate > 1) {
    errors.push("부하이전율은 0과 1 사이여야 합니다.");
  }
  if (input.hourlyLoad.length === 0) errors.push("시간별 부하자료가 없습니다.");
  if (input.currentTariff.length === 0) errors.push("현행 요금자료가 없습니다.");

  return errors;
}

export function isForecastEvent(point: HourlyPoint, input: SimulationInput): boolean {
  const hour = new Date(point.timestamp).getHours();
  const { startHour, endHour, smpThresholdWonPerKwh, includeThreshold } = input.eventRule;
  const isTargetHour = hour >= startHour && hour < endHour;
  const meetsSmpRule = includeThreshold
    ? point.smpWonPerKwh <= smpThresholdWonPerKwh
    : point.smpWonPerKwh < smpThresholdWonPerKwh;

  return isTargetHour && meetsSmpRule;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  void input;
  throw new Error(
    "계산엔진 골격만 구성된 상태입니다. 발령 마스크, 부하이전, 요금 및 편익 산식을 구현해야 합니다.",
  );
}
