import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SIMULATION_INPUT } from "../lib/simulator/defaults.ts";
import { EV_TOTAL_FAST_WEIGHT, EV_TOTAL_SLOW_WEIGHT, runSimulation } from "../lib/simulator/engine.ts";
import { ALL_APPLIANCE_CODES } from "../lib/simulator/appliances.ts";
import type { SimulationInput } from "../lib/simulator/types.ts";

function simulate(overrides: Partial<SimulationInput> = {}) {
  return runSimulation({
    ...DEFAULT_SIMULATION_INPUT,
    ...overrides,
    eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, ...overrides.eventRule },
  });
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function nearly(actual: number, expected: number, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("2025 실적 발령구간과 SMP 자동판정 시간을 서로 구분한다", () => {
  const actual = simulate();
  const rule = simulate({ eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, mode: "RULE" } });
  assert.equal(actual.eventDays, 56);
  assert.equal(actual.eventHours, 195);
  assert.equal(rule.eventDays, 56);
  assert.equal(rule.eventHours, 150);
  assert.equal(sum(actual.monthlyEventDays), 56);
});

test("할인만 적용한 기준점과 수정된 기본요금 포함 청구액을 재현한다", () => {
  const scenarioOne = simulate({ shiftMode: "SCENARIO_1", shiftRate: 0 });
  const scenarioTwo = simulate({ shiftMode: "RES_SCENARIO_2", shiftRate: 0 });
  nearly(scenarioOne.customer.annualBenefitPerCustomerWon, 10_142.423876244207);
  nearly(scenarioTwo.customer.annualBenefitPerCustomerWon, scenarioOne.customer.annualBenefitPerCustomerWon);
  // Correct residential tariff: 1,127,265.024 energy + 4,310 x 12 basic charge.
  nearly(scenarioOne.customer.currentAnnualBillWon, 1_178_985.02449335);
  assert.equal(scenarioOne.grid.shiftedEnergyMwh, 0);
  assert.equal(scenarioOne.utility.smpPurchaseCostChangeWon, 0);
});

test("시나리오 1은 1% 입력에 연속 반응하고 최대부하 여섯 시간 이내에서 에너지를 보존한다", () => {
  const at10 = simulate({ shiftMode: "SCENARIO_1", shiftRate: 0.1 });
  const at11 = simulate({ shiftMode: "SCENARIO_1", shiftRate: 0.11 });
  const at100 = simulate({ shiftMode: "SCENARIO_1", shiftRate: 1 });
  assert.ok(at11.customer.annualBenefitPerCustomerWon > at10.customer.annualBenefitPerCustomerWon);
  assert.ok(at11.grid.shiftedEnergyMwh > at10.grid.shiftedEnergyMwh);
  assert.ok(at100.shiftedLoadProfile.every((value) => value >= -1e-12));
  nearly(sum(at100.baseLoadProfile), sum(at100.shiftedLoadProfile), 1e-9);
});

test("주택용 13개 가전 선택은 실제 이동경로를 바꾸며 선택하지 않으면 이전하지 않는다", () => {
  const allSelected = simulate({ shiftMode: "RES_SCENARIO_2", selectedAppliances: [...ALL_APPLIANCE_CODES] });
  const noneSelected = simulate({ shiftMode: "RES_SCENARIO_2", selectedAppliances: [] });
  const noShift = simulate({ shiftMode: "RES_SCENARIO_2", shiftRate: 0 });
  assert.ok(allSelected.grid.shiftedEnergyMwh > 0);
  assert.equal(noneSelected.grid.shiftedEnergyMwh, 0);
  nearly(noneSelected.customer.annualBenefitPerCustomerWon, noShift.customer.annualBenefitPerCustomerWon);

  const withoutHeatPump = simulate({
    shiftMode: "RES_SCENARIO_2",
    selectedAppliances: ALL_APPLIANCE_CODES.filter((code) => code !== "HEAT_PUMP_HEATING"),
  });
  assert.ok(withoutHeatPump.grid.shiftedEnergyMwh < allSelected.grid.shiftedEnergyMwh);
  nearly(sum(allSelected.baseLoadProfile), sum(allSelected.shiftedLoadProfile), 1e-9);
  assert.ok(allSelected.shiftedLoadProfile.every((value) => value >= -1e-12));
});

test("EV 2-1은 급속, 2-2는 완속 충전경로에만 부하이전을 적용한다", () => {
  const slow21 = simulate({ customerType: "EV_SLOW_LOW_VOLTAGE", shiftMode: "EV_SCENARIO_2_1" });
  const slow22 = simulate({ customerType: "EV_SLOW_LOW_VOLTAGE", shiftMode: "EV_SCENARIO_2_2" });
  const fast21 = simulate({ customerType: "EV_FAST_HIGH_VOLTAGE", shiftMode: "EV_SCENARIO_2_1" });
  const fast22 = simulate({ customerType: "EV_FAST_HIGH_VOLTAGE", shiftMode: "EV_SCENARIO_2_2" });
  assert.equal(slow21.grid.shiftedEnergyMwh, 0);
  assert.ok(slow22.grid.shiftedEnergyMwh > 0);
  assert.ok(fast21.grid.shiftedEnergyMwh > 0);
  assert.equal(fast22.grid.shiftedEnergyMwh, 0);
});

test("EV 전체는 완속·급속 실적 비중을 합산한다", () => {
  const total = simulate({ customerType: "EV_TOTAL", shiftMode: "SCENARIO_1" });
  const slow = simulate({ customerType: "EV_SLOW_LOW_VOLTAGE", shiftMode: "SCENARIO_1" });
  const fast = simulate({ customerType: "EV_FAST_HIGH_VOLTAGE", shiftMode: "SCENARIO_1" });
  nearly(
    total.customer.annualBenefitPerCustomerWon,
    slow.customer.annualBenefitPerCustomerWon * EV_TOTAL_SLOW_WEIGHT
      + fast.customer.annualBenefitPerCustomerWon * EV_TOTAL_FAST_WEIGHT,
  );

  const total21 = simulate({ customerType: "EV_TOTAL", shiftMode: "EV_SCENARIO_2_1" });
  const total22 = simulate({ customerType: "EV_TOTAL", shiftMode: "EV_SCENARIO_2_2" });
  assert.ok(total21.grid.shiftedEnergyMwh > 0);
  assert.ok(total22.grid.shiftedEnergyMwh > 0);
  assert.notEqual(total21.grid.shiftedEnergyMwh, total22.grid.shiftedEnergyMwh);
});

test("기존 EV 주말할인을 우선하면 중복할인 방식보다 편익이 작다", () => {
  const priority = simulate({
    customerType: "EV_SLOW_LOW_VOLTAGE",
    shiftMode: "EV_SCENARIO_2_2",
    weekendDiscountPriority: true,
  });
  const stacked = simulate({
    customerType: "EV_SLOW_LOW_VOLTAGE",
    shiftMode: "EV_SCENARIO_2_2",
    weekendDiscountPriority: false,
  });
  assert.ok(priority.customer.annualBenefitPerCustomerWon < stacked.customer.annualBenefitPerCustomerWon);
});

test("SMP 구입비 변화는 고정단가가 아니라 시간별 부하차와 SMP의 내적으로 계산한다", () => {
  const noShift = simulate({ shiftMode: "SCENARIO_1", shiftRate: 0 });
  const shifted = simulate({ shiftMode: "SCENARIO_1", shiftRate: 0.5 });
  assert.equal(noShift.utility.smpPurchaseCostChangeWon, 0);
  assert.ok(shifted.utility.smpPurchaseCostChangeWon < 0);
  assert.notEqual(
    shifted.utility.smpPurchaseCostChangeWon,
    -(shifted.grid.shiftedEnergyMwh * 1_000 * 130),
  );
});

test("SMP 임계값을 낮추면 음수 SMP 시간만 남아 발령범위가 축소된다", () => {
  const atZero = simulate({ eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, mode: "RULE", smpThresholdWonPerKwh: 0 } });
  const belowZero = simulate({ eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, mode: "RULE", smpThresholdWonPerKwh: -1 } });
  assert.ok(belowZero.eventDays > 0);
  assert.ok(belowZero.eventDays < atZero.eventDays);
  assert.ok(belowZero.eventHours < atZero.eventHours);
});

test("연도별 원자료와 2026 YTD 청구기간을 적용한다", () => {
  const y2024 = simulate({ analysisYear: 2024 });
  const y2026 = simulate({ analysisYear: 2026 });
  assert.equal(y2024.eventDays, 18);
  assert.equal(y2024.eventHours, 68);
  assert.equal(y2026.eventDays, 39);
  assert.equal(y2026.eventHours, 100);
  assert.ok(y2026.customer.currentAnnualBillWon < y2024.customer.currentAnnualBillWon);
});
