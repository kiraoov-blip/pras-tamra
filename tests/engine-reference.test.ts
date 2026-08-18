import assert from "node:assert/strict";
import test from "node:test";
// Explicit extensions let Node's built-in TypeScript stripper run this test without a loader.
import { DEFAULT_SIMULATION_INPUT } from "../lib/simulator/defaults.ts";
import { runSimulation } from "../lib/simulator/engine.ts";
import { ALL_APPLIANCE_CODES } from "../lib/simulator/appliances.ts";
import type { SimulationInput } from "../lib/simulator/types.ts";

function simulate(overrides: Partial<SimulationInput> = {}) {
  return runSimulation({
    ...DEFAULT_SIMULATION_INPUT,
    ...overrides,
    eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, ...overrides.eventRule },
  });
}

test("2025 주택용 엑셀 기준점을 재현한다", () => {
  assert.ok(Math.abs(simulate({ shiftRate: 0 }).customer.annualBenefitPerCustomerWon - 10142.423877833862) < 0.001);
  assert.ok(Math.abs(simulate({ shiftRate: 0.5 }).customer.annualBenefitPerCustomerWon - 18840.123696286726) < 0.001);
  assert.ok(Math.abs(simulate({ shiftRate: 1 }).customer.annualBenefitPerCustomerWon - 27537.823514739648) < 0.001);
});

test("2024 주택용 기준점과 2026 YTD 발령실적을 재현한다", () => {
  assert.ok(Math.abs(simulate({ analysisYear: 2024 }).customer.annualBenefitPerCustomerWon - 8440.643493022013) < 0.001);
  const ytd = simulate({ analysisYear: 2026 });
  assert.equal(ytd.eventDays, 39);
  assert.equal(ytd.eventHours, 100);
});

test("EV 주말할인 우선순위 기준점을 구분한다", () => {
  const slowPriority = simulate({ customerType: "EV_SLOW_LOW_VOLTAGE", weekendDiscountPriority: true });
  const slowForecast = simulate({ customerType: "EV_SLOW_LOW_VOLTAGE", weekendDiscountPriority: false });
  assert.ok(Math.abs(slowPriority.customer.annualBenefitPerCustomerWon - 15900.19903571237) < 0.001);
  assert.ok(Math.abs(slowForecast.customer.annualBenefitPerCustomerWon - 21080.949078926315) < 0.001);

  const fastPriority = simulate({ customerType: "EV_FAST_HIGH_VOLTAGE", weekendDiscountPriority: true });
  assert.ok(Math.abs(fastPriority.customer.annualBenefitPerCustomerWon - 18422.322531052858) < 0.001);
});

test("입력 변경이 편익과 이전량에 반영되고 부하 총량은 보존된다", () => {
  const base = simulate();
  const changed = simulate({ discountRate: 0.7, shiftRate: 0.8, participationRate: 0.6 });
  assert.notEqual(changed.customer.annualBenefitPerCustomerWon, base.customer.annualBenefitPerCustomerWon);
  assert.notEqual(changed.grid.shiftedEnergyMwh, base.grid.shiftedEnergyMwh);
  assert.equal(changed.participatingCustomers, 720);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum(changed.baseLoadProfile) - sum(changed.shiftedLoadProfile)) < 1e-9);
});

test("가전 선택형은 전체 선택 시 일괄 이전과 같고 해제한 가전만 제외한다", () => {
  const aggregate = simulate();
  const allSelected = simulate({ shiftMode: "SELECTIVE", selectedAppliances: [...ALL_APPLIANCE_CODES] });
  assert.ok(Math.abs(allSelected.customer.annualBenefitPerCustomerWon - aggregate.customer.annualBenefitPerCustomerWon) < 0.001);
  assert.ok(Math.abs(allSelected.grid.shiftedEnergyMwh - aggregate.grid.shiftedEnergyMwh) < 1e-9);

  const noneSelected = simulate({ shiftMode: "SELECTIVE", selectedAppliances: [] });
  const noShift = simulate({ shiftRate: 0 });
  assert.ok(Math.abs(noneSelected.customer.annualBenefitPerCustomerWon - noShift.customer.annualBenefitPerCustomerWon) < 0.001);
  assert.equal(noneSelected.grid.shiftedEnergyMwh, 0);

  const withoutHeatPump = simulate({
    shiftMode: "SELECTIVE",
    selectedAppliances: ALL_APPLIANCE_CODES.filter((code) => code !== "HEAT_PUMP_HEATING"),
  });
  assert.ok(withoutHeatPump.grid.shiftedEnergyMwh < aggregate.grid.shiftedEnergyMwh);
  assert.ok(Math.abs(withoutHeatPump.selectedApplianceShare - (1 - 140.4 / 319.03)) < 1e-9);
});

test("음수 SMP 임계값이면 업로드 자료의 0원 발령시간이 제외된다", () => {
  const result = simulate({ eventRule: { ...DEFAULT_SIMULATION_INPUT.eventRule, mode: "RULE", smpThresholdWonPerKwh: -1 } });
  assert.equal(result.eventHours, 0);
  assert.equal(result.customer.totalAnnualBenefitWon, 0);
});
