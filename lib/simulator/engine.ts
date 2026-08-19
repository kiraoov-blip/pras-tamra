import type {
  AnalysisYear,
  ApplianceCode,
  CustomerTypeCode,
  SimulationInput,
  SimulationResult,
} from "./types";
import { SELECTABLE_APPLIANCES } from "./appliances";
import { REFERENCE_MONTHLY_USAGE_KWH } from "./defaults";
import {
  REFERENCE_DATA,
  type ReferenceDayType,
  type ReferenceEvent,
  type ReferenceSeason,
} from "./reference-data.generated";

export const ENGINE_VERSION = "2.3.0-ev-unit-normalized";

type BaseCustomerType = Exclude<CustomerTypeCode, "EV_TOTAL">;
type Components = Array<{ type: BaseCustomerType; weight: number }>;
type HourlyRoute = { base: number[]; shifted: number[]; movedKwh: number };
type SelectedEvent = ReferenceEvent & { hours: number[] };
type LoadProfileMap = Record<BaseCustomerType, Record<ReferenceSeason, readonly number[]>>;
type ApplianceProfileMap = Record<string, Record<ApplianceCode, readonly number[]>>;
type EventMap = Record<`${AnalysisYear}`, readonly ReferenceEvent[]>;

const LOAD_PROFILES = REFERENCE_DATA.loadProfiles as unknown as LoadProfileMap;
const APPLIANCE_PROFILES = REFERENCE_DATA.applianceProfiles as unknown as ApplianceProfileMap;
const EVENTS = REFERENCE_DATA.events as unknown as EventMap;

const EV_SLOW_USAGE = 1_949_025.8806533858;
const EV_FAST_USAGE = 576_504.612;
export const EV_TOTAL_SLOW_WEIGHT = EV_SLOW_USAGE / (EV_SLOW_USAGE + EV_FAST_USAGE);
export const EV_TOTAL_FAST_WEIGHT = 1 - EV_TOTAL_SLOW_WEIGHT;

const DAYS_PER_YEAR = 365;
export const EV_TARGET_DAILY_USAGE_KWH = {
  EV_SLOW_LOW_VOLTAGE: REFERENCE_MONTHLY_USAGE_KWH.EV_SLOW_LOW_VOLTAGE * 12 / DAYS_PER_YEAR,
  EV_FAST_HIGH_VOLTAGE: REFERENCE_MONTHLY_USAGE_KWH.EV_FAST_HIGH_VOLTAGE * 12 / DAYS_PER_YEAR,
} as const;

const BASIC_CHARGE_MONTHLY_WON: Record<BaseCustomerType, number> = {
  RESIDENTIAL_TOU: 4_310,
  EV_SLOW_LOW_VOLTAGE: 2_390,
  EV_FAST_HIGH_VOLTAGE: 2_580,
};

// EV energy-only values are independently reproduced from the annual workbook.
// Residential is corrected to the official tariff table: the detailed workbook
// incorrectly applied EV weekend time bands to residential TOU.
const ENERGY_CHARGE_2025_WON: Record<BaseCustomerType, number> = {
  RESIDENTIAL_TOU: 1_127_265.02449335,
  EV_SLOW_LOW_VOLTAGE: 491_772.6626142673,
  EV_FAST_HIGH_VOLTAGE: 584_640.2439547501,
};

const APPLIANCE_TO_CUSTOMER_SCALE = 0.625;
const CURTAILMENT_AVOIDANCE_FACTOR = 0.85;
const PEAK_HOURS = [16, 17, 18, 19, 20, 21] as const;

function repeated(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value);
}

function weekdayRates(type: BaseCustomerType, season: ReferenceSeason): number[] {
  if (type === "RESIDENTIAL_TOU") {
    return season === "SHOULDER"
      ? [...repeated(125.8, 8), ...repeated(153.8, 8), ...repeated(172.4, 6), ...repeated(125.8, 2)]
      : [...repeated(138.7, 8), ...repeated(184.7, 8), ...repeated(220.5, 6), ...repeated(138.7, 2)];
  }
  if (type === "EV_SLOW_LOW_VOLTAGE") {
    if (season === "SHOULDER") return [...repeated(85.4, 8), ...repeated(97.2, 8), ...repeated(102.1, 6), ...repeated(85.4, 2)];
    if (season === "SUMMER") return [...repeated(84.3, 8), ...repeated(172, 8), ...repeated(259.2, 6), ...repeated(84.3, 2)];
    return [...repeated(107.4, 8), ...repeated(154.9, 8), ...repeated(217.5, 6), ...repeated(107.4, 2)];
  }
  if (season === "SHOULDER") return [...repeated(80.2, 8), ...repeated(91, 8), ...repeated(94.9, 6), ...repeated(80.2, 2)];
  if (season === "SUMMER") return [...repeated(79.2, 8), ...repeated(137.4, 8), ...repeated(190.4, 6), ...repeated(79.2, 2)];
  return [...repeated(96.6, 8), ...repeated(127.7, 8), ...repeated(165.5, 6), ...repeated(96.6, 2)];
}

function tariffRates(type: BaseCustomerType, season: ReferenceSeason, dayType: ReferenceDayType): number[] {
  const weekday = weekdayRates(type, season);
  if (type === "RESIDENTIAL_TOU" || dayType === "WEEKDAY") return weekday;
  const low = weekday[0];
  const middle = weekday[8];
  const rates = dayType === "SATURDAY"
    ? [...repeated(low, 8), ...repeated(middle, 14), ...repeated(low, 2)]
    : repeated(low, 24);
  if (season === "SHOULDER") {
    for (let hour = 11; hour <= 13; hour += 1) rates[hour] *= 0.5;
  }
  return rates;
}

function existingEvWeekendDiscount(
  type: BaseCustomerType,
  season: ReferenceSeason,
  dayType: ReferenceDayType,
  hour: number,
): boolean {
  return type !== "RESIDENTIAL_TOU"
    && season === "SHOULDER"
    && dayType !== "WEEKDAY"
    && hour >= 11
    && hour <= 13;
}

function selectedEvents(input: SimulationInput): SelectedEvent[] {
  const source = EVENTS[String(input.analysisYear) as `${AnalysisYear}`];
  return source.flatMap((event) => {
    const matchesSeason = input.seasonFilter === "ALL" || event.season === input.seasonFilter;
    const matchesDayType = input.dayTypeFilter === "ALL"
      || (input.dayTypeFilter === "WEEKDAY" && event.dayType === "WEEKDAY")
      || (input.dayTypeFilter === "WEEKEND" && event.dayType !== "WEEKDAY");
    if (!matchesSeason || !matchesDayType) return [];
    const hours = input.eventRule.mode === "ACTUAL"
      ? [...event.actualHours]
      : event.smp.flatMap((smp, hour) => {
        const endingHour = hour + 1;
        return endingHour >= input.eventRule.startHour
          && endingHour <= input.eventRule.endHour
          && smp <= input.eventRule.smpThresholdWonPerKwh
          ? [hour]
          : [];
      });
    return hours.length > 0 ? [{ ...event, hours }] : [];
  });
}

function emptyApplianceRecord(): Record<ApplianceCode, number> {
  return Object.fromEntries(SELECTABLE_APPLIANCES.map(({ code }) => [code, 0])) as Record<ApplianceCode, number>;
}

function applianceRealizationRate(input: SimulationInput, code: ApplianceCode): number {
  const configured = input.applianceShiftRates?.[code] ?? input.shiftRate;
  return Math.max(0, Math.min(1, configured));
}

function applianceMaximumShares(events: readonly SelectedEvent[]): Record<ApplianceCode, number> {
  const maximumKwh = emptyApplianceRecord();
  events.forEach((event) => {
    const profileKey = `${event.season}_${event.dayType === "WEEKDAY" ? "WEEKDAY" : "WEEKEND"}`;
    const eventSet = new Set(event.hours);
    SELECTABLE_APPLIANCES.forEach(({ code }) => {
      maximumKwh[code] += APPLIANCE_PROFILES[profileKey][code].reduce(
        (sum, kwh, hour) => sum + (!eventSet.has(hour) ? kwh * APPLIANCE_TO_CUSTOMER_SCALE : 0),
        0,
      );
    });
  });
  const total = Object.values(maximumKwh).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    SELECTABLE_APPLIANCES.map(({ code }) => [code, total > 0 ? maximumKwh[code] / total : 0]),
  ) as Record<ApplianceCode, number>;
}

function componentsFor(customerType: CustomerTypeCode): Components {
  if (customerType === "EV_TOTAL") {
    return [
      { type: "EV_SLOW_LOW_VOLTAGE", weight: EV_TOTAL_SLOW_WEIGHT },
      { type: "EV_FAST_HIGH_VOLTAGE", weight: EV_TOTAL_FAST_WEIGHT },
    ];
  }
  return [{ type: customerType, weight: 1 }];
}

function copyProfile(type: BaseCustomerType, season: ReferenceSeason): number[] {
  const profile = [...LOAD_PROFILES[type][season]];
  if (type === "RESIDENTIAL_TOU") return profile;

  // The EV source sheets provide a 24-hour shape whose total is 42 kWh/day
  // (slow) or 50 kWh/day (fast). Those totals conflict with the workbook's
  // monthly representative usage of 336/400 kWh. Preserve the hourly shape,
  // but normalize its magnitude to the monthly usage converted to kWh/day.
  const rawDailyUsageKwh = profile.reduce((sum, value) => sum + value, 0);
  if (rawDailyUsageKwh <= 0) return profile;
  const scale = EV_TARGET_DAILY_USAGE_KWH[type] / rawDailyUsageKwh;
  return profile.map((value) => value * scale);
}

function distribute(shifted: number[], destinationHours: readonly number[], energy: number): void {
  if (energy <= 0 || destinationHours.length === 0) return;
  const addition = energy / destinationHours.length;
  destinationHours.forEach((hour) => { shifted[hour] += addition; });
}

function aggregateScenarioOne(
  type: BaseCustomerType,
  season: ReferenceSeason,
  eventHours: readonly number[],
  shiftRate: number,
): HourlyRoute {
  const base = copyProfile(type, season);
  const shifted = [...base];
  const count = Math.min(eventHours.length, PEAK_HOURS.length);
  const sourceHours = PEAK_HOURS.slice(PEAK_HOURS.length - count);
  let movedKwh = 0;
  sourceHours.forEach((hour) => {
    const removed = base[hour] * shiftRate;
    shifted[hour] -= removed;
    movedKwh += removed;
  });
  distribute(shifted, eventHours, movedKwh);
  return { base, shifted, movedKwh };
}

function residentialApplianceScenario(
  season: ReferenceSeason,
  dayType: ReferenceDayType,
  eventHours: readonly number[],
  input: SimulationInput,
  selectedAppliances: ReadonlySet<ApplianceCode>,
): HourlyRoute {
  const base = copyProfile("RESIDENTIAL_TOU", season);
  const shifted = [...base];
  const rates = tariffRates("RESIDENTIAL_TOU", season, dayType);
  const eventSet = new Set(eventHours);
  const profileKey = `${season}_${dayType === "WEEKDAY" ? "WEEKDAY" : "WEEKEND"}`;
  let movedKwh = 0;

  selectedAppliances.forEach((code) => {
    const appliance = APPLIANCE_PROFILES[profileKey][code];
    const sourceHours = appliance
      .map((kwh, hour) => ({ hour, kwh, rate: rates[hour] }))
      .filter(({ hour, kwh }) => !eventSet.has(hour) && kwh > 0)
      .sort((left, right) => right.rate - left.rate || right.hour - left.hour);
    let remaining = sourceHours.reduce((sum, item) => sum + item.kwh, 0)
      * applianceRealizationRate(input, code);
    let applianceMoved = 0;
    sourceHours.forEach(({ hour, kwh }) => {
      const removed = Math.min(kwh, remaining);
      shifted[hour] -= removed * APPLIANCE_TO_CUSTOMER_SCALE;
      remaining -= removed;
      applianceMoved += removed * APPLIANCE_TO_CUSTOMER_SCALE;
    });
    movedKwh += applianceMoved;
    distribute(shifted, eventHours, applianceMoved);
  });

  shifted.forEach((value, hour) => {
    if (value >= 0) return;
    const correction = -value;
    shifted[hour] = 0;
    movedKwh -= correction;
    eventHours.forEach((destination) => { shifted[destination] -= correction / eventHours.length; });
  });
  return { base, shifted, movedKwh: Math.max(0, movedKwh) };
}

function evFastScenario(
  type: BaseCustomerType,
  season: ReferenceSeason,
  eventHours: readonly number[],
  shiftRate: number,
): HourlyRoute {
  const base = copyProfile(type, season);
  const shifted = [...base];
  if (type !== "EV_FAST_HIGH_VOLTAGE") return { base, shifted, movedKwh: 0 };
  const sourceHour = 17;
  const movedKwh = base[sourceHour] * shiftRate;
  shifted[sourceHour] -= movedKwh;
  shifted[eventHours[0]] += movedKwh;
  return { base, shifted, movedKwh };
}

function evSlowScenario(
  type: BaseCustomerType,
  season: ReferenceSeason,
  eventHours: readonly number[],
  shiftRate: number,
): HourlyRoute {
  const base = copyProfile(type, season);
  const shifted = [...base];
  if (type !== "EV_SLOW_LOW_VOLTAGE") return { base, shifted, movedKwh: 0 };
  const sourceHours = [23, 0, 1];
  const movedKwh = sourceHours.reduce((sum, hour) => sum + base[hour] * shiftRate, 0);
  sourceHours.forEach((hour) => { shifted[hour] -= base[hour] * shiftRate; });
  distribute(shifted, eventHours, movedKwh);
  return { base, shifted, movedKwh };
}

function routeForEvent(
  type: BaseCustomerType,
  input: SimulationInput,
  event: ReferenceEvent & { hours: number[] },
  selectedAppliances: ReadonlySet<ApplianceCode>,
): HourlyRoute {
  if (input.shiftMode === "SCENARIO_1") {
    return aggregateScenarioOne(type, event.season, event.hours, input.shiftRate);
  }
  if (input.shiftMode === "RES_SCENARIO_2" && type === "RESIDENTIAL_TOU") {
    return residentialApplianceScenario(event.season, event.dayType, event.hours, input, selectedAppliances);
  }
  if (input.shiftMode === "EV_SCENARIO_2_1") return evFastScenario(type, event.season, event.hours, input.shiftRate);
  if (input.shiftMode === "EV_SCENARIO_2_2") return evSlowScenario(type, event.season, event.hours, input.shiftRate);
  const base = copyProfile(type, event.season);
  return { base, shifted: [...base], movedKwh: 0 };
}

function discountedRates(
  type: BaseCustomerType,
  event: ReferenceEvent & { hours: number[] },
  discountRate: number,
  weekendPriority: boolean,
): number[] {
  const current = tariffRates(type, event.season, event.dayType);
  const eventSet = new Set(event.hours);
  return current.map((rate, hour) => {
    if (!eventSet.has(hour)) return rate;
    if (weekendPriority && existingEvWeekendDiscount(type, event.season, event.dayType, hour)) return rate;
    return rate * (1 - discountRate);
  });
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function currentBill(type: BaseCustomerType, year: AnalysisYear): number {
  if (year === 2026) {
    return ENERGY_CHARGE_2025_WON[type] * (135 / 365) + BASIC_CHARGE_MONTHLY_WON[type] * 5;
  }
  const dayScale = year === 2024 ? 366 / 365 : 1;
  return ENERGY_CHARGE_2025_WON[type] * dayScale + BASIC_CHARGE_MONTHLY_WON[type] * 12;
}

export function validateSimulationInput(input: SimulationInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.customerCount) || input.customerCount < 1) errors.push("대상 고객 수는 1 이상이어야 합니다.");
  if (!Number.isFinite(input.participationRate) || input.participationRate < 0 || input.participationRate > 1) errors.push("참여율은 0과 1 사이여야 합니다.");
  if (!Number.isFinite(input.discountRate) || input.discountRate < 0 || input.discountRate > 1) errors.push("할인율은 0과 1 사이여야 합니다.");
  if (!Number.isFinite(input.shiftRate) || input.shiftRate < 0 || input.shiftRate > 1) errors.push("부하이전율은 0과 1 사이여야 합니다.");
  if (input.applianceShiftRates && Object.values(input.applianceShiftRates).some(
    (value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1),
  )) errors.push("가전별 이전 설정률은 0과 1 사이여야 합니다.");
  if (!Number.isFinite(input.eventRule.smpThresholdWonPerKwh)) errors.push("SMP 임계값은 숫자여야 합니다.");
  if (input.eventRule.startHour > input.eventRule.endHour) errors.push("발령 시작시간은 종료시간보다 늦을 수 없습니다.");
  return errors;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  const warnings = validateSimulationInput(input);
  const events = selectedEvents(input);
  const components = componentsFor(input.customerType);
  const selectedCodes = new Set(input.selectedAppliances);
  const selectedApplianceCount = SELECTABLE_APPLIANCES.filter(({ code }) => selectedCodes.has(code)).length;
  const maximumShares = applianceMaximumShares(events);
  const configuredShares = Object.fromEntries(SELECTABLE_APPLIANCES.map(({ code }) => [
    code,
    selectedCodes.has(code) ? maximumShares[code] * applianceRealizationRate(input, code) : 0,
  ])) as Record<ApplianceCode, number>;
  const selectedApplianceShare = input.shiftMode === "RES_SCENARIO_2" && input.customerType === "RESIDENTIAL_TOU"
    ? Object.values(configuredShares).reduce((sum, value) => sum + value, 0)
    : 1;
  const participatingCustomers = Math.round(input.customerCount * input.participationRate);
  const monthlyEventDays = Array.from({ length: 12 }, () => 0);
  events.forEach((event) => { monthlyEventDays[event.month - 1] += 1; });

  let benefitPerCustomer = 0;
  let movedKwhPerCustomer = 0;
  let smpCostChangePerCustomer = 0;
  let annualCurrentBill = 0;
  const chartBase = Array.from({ length: 24 }, () => 0);
  const chartShifted = Array.from({ length: 24 }, () => 0);

  components.forEach(({ type, weight }) => {
    annualCurrentBill += currentBill(type, input.analysisYear) * weight;
    events.forEach((event) => {
      const route = routeForEvent(type, input, event, selectedCodes);
      const currentRates = tariffRates(type, event.season, event.dayType);
      const newRates = discountedRates(type, event, input.discountRate, input.weekendDiscountPriority);
      benefitPerCustomer += (dot(route.base, currentRates) - dot(route.shifted, newRates)) * weight;
      movedKwhPerCustomer += route.movedKwh * weight;
      smpCostChangePerCustomer += route.shifted.reduce(
        (sum, value, hour) => sum + (value - route.base[hour]) * event.smp[hour],
        0,
      ) * weight;
      for (let hour = 0; hour < 24; hour += 1) {
        chartBase[hour] += route.base[hour] * weight;
        chartShifted[hour] += route.shifted[hour] * weight;
      }
    });
  });

  if (events.length > 0) {
    for (let hour = 0; hour < 24; hour += 1) {
      chartBase[hour] /= events.length;
      chartShifted[hour] /= events.length;
    }
  } else {
    const fallbackSeason = input.seasonFilter === "ALL" ? "SHOULDER" : input.seasonFilter;
    components.forEach(({ type, weight }) => {
      const profile = copyProfile(type, fallbackSeason);
      profile.forEach((value, hour) => {
        chartBase[hour] += value * weight;
        chartShifted[hour] += value * weight;
      });
    });
  }

  const shiftedEnergyMwh = movedKwhPerCustomer * participatingCustomers / 1_000;
  const totalBenefit = benefitPerCustomer * participatingCustomers;
  const currentSales = annualCurrentBill * participatingCustomers;
  const salesChange = -totalBenefit;
  const smpCostChange = smpCostChangePerCustomer * participatingCustomers;

  if (input.shiftMode === "RES_SCENARIO_2" && input.customerType === "RESIDENTIAL_TOU" && selectedApplianceCount === 0) {
    warnings.push("선택된 가전이 없어 할인 효과만 계산하고 부하이전량은 0으로 계산했습니다.");
  }
  if (input.shiftMode === "EV_SCENARIO_2_1" && input.customerType === "EV_SLOW_LOW_VOLTAGE") {
    warnings.push("시나리오 2-1은 급속 1시간 충전 전용이므로 완속 고객의 부하이전량은 0입니다.");
  }
  if (input.shiftMode === "EV_SCENARIO_2_2" && input.customerType === "EV_FAST_HIGH_VOLTAGE") {
    warnings.push("시나리오 2-2는 완속 3시간 충전 전용이므로 급속 고객의 부하이전량은 0입니다.");
  }
  if (input.eventRule.mode === "ACTUAL" && input.analysisYear === 2025) {
    warnings.push("2025년 실적은 56일·195시간의 시나리오 발령구간을 적용했습니다. SMP≤0인 개별 시간은 150시간으로 별도 집계됩니다.");
  }
  if (input.eventRule.mode === "RULE") {
    warnings.push("SMP 자동판정은 원자료의 시간대별 SMP가 입력 임계값 이하인 시간만 다시 선택합니다.");
  }
  if (input.seasonFilter !== "ALL" || input.dayTypeFilter !== "ALL") {
    warnings.push("계절·요일 선택은 해당 조건의 발령·부하이전 효과만 필터링하며, 현행 고객요금은 분석연도 전체 기준입니다.");
  }
  if (events.length === 0) {
    warnings.push("선택한 연도·계절·요일·발령조건에 해당하는 발령실적이 없어 할인 및 부하이전 효과는 0으로 계산했습니다.");
  }
  if (input.analysisYear === 2026) {
    warnings.push("2026년은 5월 15일까지의 YTD 발령자료와 5개월 기본요금을 적용했습니다.");
  }
  warnings.push("출력제어 회피 가능량은 발령시간 부하 증가량의 85%가 실제 출력제어를 대체한다는 가정값입니다.");

  return {
    engineVersion: ENGINE_VERSION,
    eventDays: events.length,
    eventHours: events.reduce((sum, event) => sum + event.hours.length, 0),
    participatingCustomers,
    selectedApplianceCount,
    selectableApplianceCount: SELECTABLE_APPLIANCES.length,
    selectedApplianceShare,
    applianceMaximumShares: maximumShares,
    applianceConfiguredShares: configuredShares,
    monthlyEventDays,
    baseLoadProfile: chartBase,
    shiftedLoadProfile: chartShifted,
    customer: {
      currentAnnualBillWon: annualCurrentBill,
      newAnnualBillWon: annualCurrentBill - benefitPerCustomer,
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
      curtailmentReductionMwh: shiftedEnergyMwh * CURTAILMENT_AVOIDANCE_FACTOR,
    },
    warnings,
  };
}
