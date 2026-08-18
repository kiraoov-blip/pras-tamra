import type {
  AnalysisYear,
  CustomerTypeCode,
  SimulationInput,
  SimulationResult,
} from "./types";
import { getSelectedApplianceShare, SELECTABLE_APPLIANCES } from "./appliances";

export const ENGINE_VERSION = "1.1.0-appliance-selection";

type Point = readonly [shiftPercent: number, benefitWon: number];

const RESIDENTIAL_2025: readonly Point[] = [
  [0, 10142.423877833862], [10, 11881.963841524426],
  [30, 15361.043768905613], [50, 18840.123696286726],
  [80, 24058.743587358476], [100, 27537.823514739648],
];
const RESIDENTIAL_2024: readonly Point[] = [
  [0, 4129.802627900179], [10, 4991.970800924566],
  [30, 6716.307146973268], [50, 8440.643493022013],
  [80, 11027.148012095131], [100, 12751.484358143862],
];

const CALIBRATION = {
  RESIDENTIAL_TOU: {
    currentAnnualCharge: 1092522.2452596456,
    gross2025: RESIDENTIAL_2025,
    priority2025: RESIDENTIAL_2025,
    movedKwhAt100: 163.22,
    sourceRate: 188.72,
    destinationRate: 164.28,
    baseProfile: [42,39,36,34,33,35,40,48,61,53,49,48,47,46,47,49,58,72,86,92,90,82,69,55],
  },
  EV_SLOW_LOW_VOLTAGE: {
    currentAnnualCharge: 491772.6626142673,
    gross2025: [[0,10318.87949721437],[50,21080.949078926315],[100,31843.018660638278]] as readonly Point[],
    priority2025: [[0,8741.66865394899],[50,15900.19903571237],[100,23058.72941747577]] as readonly Point[],
    movedKwhAt100: 624.2,
    sourceRate: 92.86,
    destinationRate: 116.77,
    baseProfile: [98,87,71,56,41,29,21,18,18,19,19,18,18,18,18,19,21,26,33,39,45,52,85,100],
  },
  EV_FAST_HIGH_VOLTAGE: {
    currentAnnualCharge: 584640.2439547501,
    gross2025: [[0,20954.52198632108],[50,24542.52499331522],[100,28130.52800030937]] as readonly Point[],
    priority2025: [[0,15237.315689055282],[50,18422.322531052858],[100,21607.329373050445]] as readonly Point[],
    movedKwhAt100: 210.8,
    sourceRate: 85.76,
    destinationRate: 103.45,
    baseProfile: [86,82,76,67,55,43,35,31,34,43,53,62,69,73,76,78,80,83,87,91,95,98,96,91],
  },
} as const;

const EVENT_DATA: Record<AnalysisYear, { days: number; hours: number; months: number[]; zeroHours: number[]; period: number }> = {
  2024: { days: 18, hours: 47, months: [0,3,0,0,0,2,0,0,0,3,8,2], zeroHours: [0,3,3,4,5,0,1,0,2,5,9,17,7,5,3,1,0,0,0,0,0,0,0,0], period: 1 },
  2025: { days: 56, hours: 150, months: [4,6,15,14,6,0,0,0,0,2,7,2], zeroHours: [0,0,0,1,0,0,0,0,1,10,30,53,37,14,4,2,0,0,0,0,0,0,0,0], period: 1 },
  2026: { days: 39, hours: 100, months: [4,6,15,6,8,0,0,0,0,0,0,0], zeroHours: [0,0,0,0,0,0,0,0,0,0,16,38,30,14,2,0,0,0,0,0,0,0,0,0], period: 5 / 12 },
};

function interpolate(points: readonly Point[], shiftRate: number): number {
  const x = Math.max(0, Math.min(100, shiftRate * 100));
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    if (x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return points[points.length - 1][1];
}

function benefitAtHalfDiscount(
  customerType: CustomerTypeCode,
  year: AnalysisYear,
  shiftRate: number,
  weekendPriority: boolean,
): { base: number; shifted: number } {
  const calibration = CALIBRATION[customerType];
  const points = weekendPriority ? calibration.priority2025 : calibration.gross2025;
  const base2025 = interpolate(points, 0);
  const shifted2025 = interpolate(points, shiftRate);

  if (customerType === "RESIDENTIAL_TOU" && year === 2024) {
    const base = interpolate(RESIDENTIAL_2024, 0);
    return { base, shifted: interpolate(RESIDENTIAL_2024, shiftRate) };
  }
  if (year === 2025) return { base: base2025, shifted: shifted2025 };
  if (year === 2026) return { base: base2025 * (100 / 150), shifted: shifted2025 * (100 / 150) };

  const residentialRatio = interpolate(RESIDENTIAL_2024, shiftRate) / interpolate(RESIDENTIAL_2025, shiftRate);
  const residentialBaseRatio = interpolate(RESIDENTIAL_2024, 0) / interpolate(RESIDENTIAL_2025, 0);
  return { base: base2025 * residentialBaseRatio, shifted: shifted2025 * residentialRatio };
}

function eventSelection(input: SimulationInput) {
  const basis = EVENT_DATA[input.analysisYear];
  if (input.eventRule.mode === "ACTUAL") {
    return { days: basis.days, hours: basis.hours, months: basis.months, scale: 1 };
  }
  const start = Math.max(1, Math.min(24, Math.round(input.eventRule.startHour)));
  const end = Math.max(start, Math.min(24, Math.round(input.eventRule.endHour)));
  const hours = input.eventRule.smpThresholdWonPerKwh < 0
    ? 0
    : basis.zeroHours.slice(start - 1, end).reduce((sum, value) => sum + value, 0);
  const scale = basis.hours === 0 ? 0 : hours / basis.hours;
  return {
    hours,
    days: Math.min(basis.days, Math.round(basis.days * scale)),
    months: basis.months.map((value) => Math.round(value * scale)),
    scale,
  };
}

function shiftedProfile(customerType: CustomerTypeCode, effectiveShiftRate: number) {
  const base = [...CALIBRATION[customerType].baseProfile];
  const shifted = [...base];
  const sourceHours = customerType === "RESIDENTIAL_TOU" ? [17,18,19,20,21] : [0,1,2,22,23];
  const destinationHours = [9,10,11,12,13,14,15];
  const removable = sourceHours.reduce((sum, hour) => sum + base[hour] * 0.22 * effectiveShiftRate, 0);
  sourceHours.forEach((hour) => { shifted[hour] -= base[hour] * 0.22 * effectiveShiftRate; });
  destinationHours.forEach((hour) => { shifted[hour] += removable / destinationHours.length; });
  return { base, shifted };
}

export function validateSimulationInput(input: SimulationInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.customerCount) || input.customerCount < 1) errors.push("대상 고객 수는 1 이상이어야 합니다.");
  if (input.participationRate < 0 || input.participationRate > 1) errors.push("참여율은 0과 1 사이여야 합니다.");
  if (input.discountRate < 0 || input.discountRate > 1) errors.push("할인율은 0과 1 사이여야 합니다.");
  if (input.shiftRate < 0 || input.shiftRate > 1) errors.push("부하이전율은 0과 1 사이여야 합니다.");
  if (input.eventRule.startHour > input.eventRule.endHour) errors.push("발령 시작시간은 종료시간보다 늦을 수 없습니다.");
  return errors;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  const warnings = validateSimulationInput(input);
  const calibration = CALIBRATION[input.customerType];
  const event = eventSelection(input);
  const participatingCustomers = Math.round(input.customerCount * input.participationRate);
  const selective = input.shiftMode === "SELECTIVE";
  const selectedApplianceShare = selective && input.customerType === "RESIDENTIAL_TOU"
    ? getSelectedApplianceShare(input.selectedAppliances, input.analysisYear)
    : 1;
  const selectedCodes = new Set(input.selectedAppliances);
  const selectedApplianceCount = SELECTABLE_APPLIANCES.filter(({ code }) => selectedCodes.has(code)).length;
  const effectiveShiftRate = input.shiftRate * selectedApplianceShare;
  const half = benefitAtHalfDiscount(input.customerType, input.analysisYear, effectiveShiftRate, input.weekendDiscountPriority);
  const halfIncrement = half.shifted - half.base;
  const halfSavingPerKwh = calibration.sourceRate - calibration.destinationRate * 0.5;
  const selectedSavingPerKwh = calibration.sourceRate - calibration.destinationRate * (1 - input.discountRate);
  const discountOnlyBenefit = half.base * (input.discountRate / 0.5);
  const shiftBenefit = halfSavingPerKwh === 0 ? 0 : halfIncrement * (selectedSavingPerKwh / halfSavingPerKwh);
  const benefitPerCustomer = (discountOnlyBenefit + shiftBenefit) * event.scale;

  const basis = EVENT_DATA[input.analysisYear];
  const shiftedKwhPerCustomer = calibration.movedKwhAt100 * effectiveShiftRate * (basis.hours / 150) * event.scale;
  const shiftedEnergyMwh = shiftedKwhPerCustomer * participatingCustomers / 1000;
  const totalBenefit = benefitPerCustomer * participatingCustomers;
  const currentBill = calibration.currentAnnualCharge * basis.period;
  const currentSales = currentBill * participatingCustomers;
  const salesChange = -totalBenefit;
  const smpCostChange = -(shiftedEnergyMwh * 1000 * 130);
  const profiles = shiftedProfile(input.customerType, effectiveShiftRate);

  if (selective && input.customerType === "RESIDENTIAL_TOU" && selectedApplianceCount === 0) warnings.push("선택된 가전이 없어 부하이전량은 0으로 계산했습니다.");
  if (input.customerType === "RESIDENTIAL_TOU" && !input.weekendDiscountPriority) warnings.push("주택용 주말 중복처리 해제 효과는 엑셀에 별도 기준점이 없어 현 기준점과 동일하게 처리했습니다.");
  if (input.analysisYear !== 2025 && input.customerType !== "RESIDENTIAL_TOU") warnings.push("EV의 2024·2026 값은 2025 EV 기준점에 해당 연도 발령실적 보정계수를 적용했습니다.");
  if (input.eventRule.mode === "RULE") warnings.push("SMP 자동판정은 업로드 자료에 포함된 비양(0원) 발령 후보일 내에서 재산정합니다.");

  return {
    engineVersion: ENGINE_VERSION,
    eventDays: event.days,
    eventHours: event.hours,
    participatingCustomers,
    selectedApplianceCount,
    selectableApplianceCount: SELECTABLE_APPLIANCES.length,
    selectedApplianceShare,
    monthlyEventDays: event.months,
    baseLoadProfile: profiles.base,
    shiftedLoadProfile: profiles.shifted,
    customer: {
      currentAnnualBillWon: currentBill,
      newAnnualBillWon: currentBill - benefitPerCustomer,
      annualBenefitPerCustomerWon: benefitPerCustomer,
      totalAnnualBenefitWon: totalBenefit,
    },
    utility: {
      currentSalesRevenueWon: currentSales,
      newSalesRevenueWon: currentSales + salesChange,
      salesRevenueChangeWon: salesChange,
      smpPurchaseCostChangeWon: smpCostChange,
      shortTermNetImpactWon: salesChange - smpCostChange,
    },
    grid: {
      shiftedEnergyMwh,
      eventWindowLoadIncreaseMwh: shiftedEnergyMwh,
      curtailmentReductionMwh: shiftedEnergyMwh * 0.85,
    },
    warnings,
  };
}
