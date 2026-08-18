export type AnalysisYear = 2024 | 2025 | 2026;

export type CustomerTypeCode =
  | "RESIDENTIAL_TOU"
  | "EV_TOTAL"
  | "EV_SLOW_LOW_VOLTAGE"
  | "EV_FAST_HIGH_VOLTAGE";

export type LoadShiftMode =
  | "SCENARIO_1"
  | "RES_SCENARIO_2"
  | "EV_SCENARIO_2_1"
  | "EV_SCENARIO_2_2";
export type EventMode = "ACTUAL" | "RULE";
export type ApplianceCode =
  | "MOBILE_IT"
  | "GAME_CONSOLE"
  | "DISHWASHER"
  | "FOOD_WASTE_PROCESSOR"
  | "WASHER"
  | "CLOTHES_DRYER"
  | "CLOTHING_CARE"
  | "ROBOT_VACUUM"
  | "CORDLESS_VACUUM"
  | "IRON"
  | "LIVING_ROOM_AC"
  | "HEAT_PUMP_HEATING"
  | "BOILER_CIRCULATION_PUMP";

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
  selectedAppliances: ApplianceCode[];
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
  selectedApplianceCount: number;
  selectableApplianceCount: number;
  selectedApplianceShare: number;
  monthlyEventDays: number[];
  baseLoadProfile: number[];
  shiftedLoadProfile: number[];
  customer: CustomerResult;
  utility: UtilityResult;
  grid: GridResult;
  warnings: string[];
}
