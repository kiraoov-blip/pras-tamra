import type { EventRule, SimulationInput } from "./types";

export const DEFAULT_EVENT_RULE: EventRule = {
  mode: "ACTUAL",
  startHour: 10,
  endHour: 16,
  smpThresholdWonPerKwh: 0,
};

export const DEFAULT_SIMULATION_INPUT: SimulationInput = {
  analysisYear: 2025,
  customerType: "RESIDENTIAL_TOU",
  customerCount: 1200,
  participationRate: 0.8,
  discountRate: 0.5,
  shiftRate: 0.5,
  shiftMode: "AGGREGATE",
  weekendDiscountPriority: true,
  eventRule: DEFAULT_EVENT_RULE,
};

export const REFERENCE_MONTHLY_USAGE_KWH = {
  RESIDENTIAL_TOU: 584,
  EV_SLOW_LOW_VOLTAGE: 336,
  EV_FAST_HIGH_VOLTAGE: 400,
} as const;
