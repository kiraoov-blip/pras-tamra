import type { AnalysisYear, ApplianceCode } from "./types";

export interface SelectableAppliance {
  code: ApplianceCode;
  label: string;
  category: string;
  sourceKwhByYear: Record<AnalysisYear, number>;
}

export const SELECTABLE_APPLIANCES: readonly SelectableAppliance[] = [
  { code: "MOBILE_IT", label: "노트북·태블릿·휴대폰 충전", category: "IT·충전", sourceKwhByYear: { 2024: 9.54, 2025: 21.9, 2026: 12.24 } },
  { code: "GAME_CONSOLE", label: "게임콘솔", category: "AV", sourceKwhByYear: { 2024: 5.52, 2025: 17.76, 2026: 11.88 } },
  { code: "DISHWASHER", label: "식기세척기", category: "주방", sourceKwhByYear: { 2024: 17.6, 2025: 55, 2026: 38.1 } },
  { code: "FOOD_WASTE_PROCESSOR", label: "음식물처리기", category: "주방", sourceKwhByYear: { 2024: 0.43, 2025: 1.35, 2026: 0.93 } },
  { code: "WASHER", label: "세탁기", category: "세탁·청소", sourceKwhByYear: { 2024: 1.32, 2025: 3.96, 2026: 2.88 } },
  { code: "CLOTHES_DRYER", label: "의류건조기", category: "세탁·청소", sourceKwhByYear: { 2024: 14.05, 2025: 44.75, 2026: 30.3 } },
  { code: "CLOTHING_CARE", label: "의류관리기", category: "세탁·청소", sourceKwhByYear: { 2024: 5.15, 2025: 16.45, 2026: 11.1 } },
  { code: "ROBOT_VACUUM", label: "로봇청소기", category: "세탁·청소", sourceKwhByYear: { 2024: 0, 2025: 0, 2026: 0 } },
  { code: "CORDLESS_VACUUM", label: "무선청소기·충전", category: "세탁·청소", sourceKwhByYear: { 2024: 0.55, 2025: 1.65, 2026: 1.2 } },
  { code: "IRON", label: "다리미·스팀다리미", category: "세탁·청소", sourceKwhByYear: { 2024: 1.4, 2025: 4.6, 2026: 3 } },
  { code: "LIVING_ROOM_AC", label: "거실 에어컨", category: "냉방", sourceKwhByYear: { 2024: 12.2, 2025: 0, 2026: 0 } },
  { code: "HEAT_PUMP_HEATING", label: "히트펌프 난방", category: "난방", sourceKwhByYear: { 2024: 95.85, 2025: 140.4, 2026: 76.95 } },
  { code: "BOILER_CIRCULATION_PUMP", label: "보일러 순환펌프", category: "난방보조", sourceKwhByYear: { 2024: 7.67, 2025: 11.21, 2026: 5.9 } },
] as const;

export const ALL_APPLIANCE_CODES: ApplianceCode[] = SELECTABLE_APPLIANCES.map(({ code }) => code);

export function getApplianceShare(code: ApplianceCode, year: AnalysisYear): number {
  const total = SELECTABLE_APPLIANCES.reduce((sum, appliance) => sum + appliance.sourceKwhByYear[year], 0);
  const appliance = SELECTABLE_APPLIANCES.find((item) => item.code === code);
  return total > 0 && appliance ? appliance.sourceKwhByYear[year] / total : 0;
}

export function getSelectedApplianceShare(selected: readonly ApplianceCode[], year: AnalysisYear): number {
  const selectedCodes = new Set(selected);
  return SELECTABLE_APPLIANCES.reduce(
    (sum, appliance) => sum + (selectedCodes.has(appliance.code) ? getApplianceShare(appliance.code, year) : 0),
    0,
  );
}
