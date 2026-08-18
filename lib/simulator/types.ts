export type AnalysisYear = 2024 | 2025 | 2026;

export type CustomerTypeCode =
  | "RESIDENTIAL_TOU"
  | "EV_SLOW_LOW_VOLTAGE"
  | "EV_FAST_HIGH_VOLTAGE";

export type LoadShiftMode = "AGGREGATE" | "SELECTIVE";
export type EventMode = "ACTUAL" | "RULE";

export interface EventRule {
  mode: EventMode;
  startHour: number;
  endHour: number;
  smpThresholdWonPerKwh: number;
}

export interface SimulationInput {
  analysisYear: AnalysisYear;
  customerType: CustomerTypeCode;
  customerCount: number;
  participationRate: number;
  discountRate: number;
  shiftRate: number;
  shiftMode: LoadShiftMode;
  weekendDiscountPriority: boolean;
  eventRule: EventRule;
}

export interface CustomerResult {
  currentAnnualBillWon: number;
  newAnnualBillWon: number;
  annualBenefitPerCustomerWon: number;
  totalAnnualBenefitWon: number;
}

export interface UtilityResult {
  currentSalesRevenueWon: number;
  newSalesRevenueWon: number;
  salesRevenueChangeWon: number;
  smpPurchaseCostChangeWon: number;
  shortTermNetImpactWon: number;
}

export interface GridResult {
  shiftedEnergyMwh: number;
  eventWindowLoadIncreaseMwh: number;
  curtailmentReductionMwh: number;
}

export interface SimulationResult {
  engineVersion: string;
  eventDays: number;
  eventHours: number;
  participatingCustomers: number;
  monthlyEventDays: number[];
  baseLoadProfile: number[];
  shiftedLoadProfile: number[];
  customer: CustomerResult;
  utility: UtilityResult;
  grid: GridResult;
  warnings: string[];
}
