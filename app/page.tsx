"use client";

import { useMemo, useState } from "react";
import { REFERENCE_MONTHLY_USAGE_KWH } from "@/lib/simulator/defaults";
import { runSimulation } from "@/lib/simulator/engine";
import { ALL_APPLIANCE_CODES, getApplianceShare, SELECTABLE_APPLIANCES } from "@/lib/simulator/appliances";
import type { AnalysisYear, ApplianceCode, CustomerTypeCode, EventMode } from "@/lib/simulator/types";

type CustomerType = "주택용 TOU" | "전기차 완속 저압" | "전기차 급속·고압";
type ResultTab = "고객" | "한전" | "계통";

const months = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const CUSTOMER_CODES: Record<CustomerType, CustomerTypeCode> = {
  "주택용 TOU": "RESIDENTIAL_TOU",
  "전기차 완속 저압": "EV_SLOW_LOW_VOLTAGE",
  "전기차 급속·고압": "EV_FAST_HIGH_VOLTAGE",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

function formatWon(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${formatNumber(rounded)}원`;
}

function formatMwh(value: number) {
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)}MWh`;
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <div className="field-label"><span>{children}</span>{hint ? <small>{hint}</small> : null}</div>;
}

function StatusDot({ tone = "blue" }: { tone?: "blue" | "green" | "amber" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

export default function Home() {
  const [analysisYear, setAnalysisYear] = useState<AnalysisYear>(2025);
  const [customerType, setCustomerType] = useState<CustomerType>("주택용 TOU");
  const [customerCount, setCustomerCount] = useState(1200);
  const [participation, setParticipation] = useState(80);
  const [discount, setDiscount] = useState(50);
  const [shiftRate, setShiftRate] = useState(50);
  const [scenario, setScenario] = useState<"aggregate" | "smart">("aggregate");
  const [selectedAppliances, setSelectedAppliances] = useState<ApplianceCode[]>([...ALL_APPLIANCE_CODES]);
  const [weekendPriority, setWeekendPriority] = useState(true);
  const [eventMode, setEventMode] = useState<EventMode>("ACTUAL");
  const [smpThreshold, setSmpThreshold] = useState(0);
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(16);
  const [resultTab, setResultTab] = useState<ResultTab>("고객");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const customerCode = CUSTOMER_CODES[customerType];
  const monthlyUsage = REFERENCE_MONTHLY_USAGE_KWH[customerCode];
  const result = useMemo(() => runSimulation({
    analysisYear,
    customerType: customerCode,
    customerCount,
    participationRate: participation / 100,
    discountRate: discount / 100,
    shiftRate: shiftRate / 100,
    shiftMode: scenario === "aggregate" ? "AGGREGATE" : "SELECTIVE",
    selectedAppliances,
    weekendDiscountPriority: weekendPriority,
    eventRule: {
      mode: eventMode,
      startHour,
      endHour,
      smpThresholdWonPerKwh: smpThreshold,
    },
  }), [analysisYear, customerCode, customerCount, participation, discount, shiftRate, scenario, selectedAppliances, weekendPriority, eventMode, startHour, endHour, smpThreshold]);

  const maxProfile = Math.max(...result.baseLoadProfile, ...result.shiftedLoadProfile) * 1.08;
  const averageEventHours = result.eventDays ? result.eventHours / result.eventDays : 0;
  const yearLabel = analysisYear === 2026 ? "2026 YTD" : `${analysisYear}년`;

  const resultCopy: Record<ResultTab, {
    eyebrow: string;
    title: string;
    items: Array<[string, string]>;
  }> = {
    고객: {
      eyebrow: "고객 관점",
      title: "할인과 부하이전으로 발생하는 요금 편익",
      items: [
        ["고객당 기준기간 편익", formatWon(result.customer.annualBenefitPerCustomerWon)],
        ["참여고객 전체 편익", formatWon(result.customer.totalAnnualBenefitWon)],
        ["제도 적용 후 고객요금", `${formatNumber(result.customer.newAnnualBillWon)}원`],
      ],
    },
    한전: {
      eyebrow: "한전 관점",
      title: "판매수입 감소와 SMP 구입비 절감을 분리",
      items: [
        ["전력판매수입 변화", formatWon(result.utility.salesRevenueChangeWon)],
        ["SMP 구입비 변화", formatWon(result.utility.smpPurchaseCostChangeWon)],
        ["단기 순재무영향", formatWon(result.utility.shortTermNetImpactWon)],
      ],
    },
    계통: {
      eyebrow: "계통 관점",
      title: "태양광 과잉시간으로 이동한 전력량",
      items: [
        ["기준기간 이전 전력량", formatMwh(result.grid.shiftedEnergyMwh)],
        ["발령시간 증가부하", formatMwh(result.grid.eventWindowLoadIncreaseMwh)],
        ["출력제어 흡수 가능량", formatMwh(result.grid.curtailmentReductionMwh)],
      ],
    },
  };
  const activeResult = resultCopy[resultTab];

  const reset = () => {
    setAnalysisYear(2025); setCustomerType("주택용 TOU"); setCustomerCount(1200);
    setParticipation(80); setDiscount(50); setShiftRate(50); setScenario("aggregate");
    setSelectedAppliances([...ALL_APPLIANCE_CODES]);
    setWeekendPriority(true); setEventMode("ACTUAL"); setSmpThreshold(0);
    setStartHour(10); setEndHour(16);
  };

  const changeCustomerType = (value: CustomerType) => {
    setCustomerType(value);
    if (value !== "주택용 TOU") setScenario("aggregate");
  };

  const toggleAppliance = (code: ApplianceCode) => {
    setSelectedAppliances((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]);
  };

  return (
    <main>
      <header className="hero">
        <div className="page-shell hero-grid">
          <div className="hero-title">
            <span className="brand-mark" aria-hidden="true">P</span>
            <div>
              <h1>탐라는 전기예보제 요금·편익 분석 시뮬레이터</h1>
              <p>PRAS - TAMRA</p>
            </div>
          </div>
          <div className="hero-summary" aria-label="기본 분석 조건 요약">
            <div><span>발령기준</span><strong>{eventMode === "ACTUAL" ? `${yearLabel} 실제 발령` : `제주 SMP ≤ ${smpThreshold}원`}</strong></div>
            <div><span>대상시간</span><strong>{eventMode === "ACTUAL" ? "10시–16시" : `${startHour}시–${endHour}시`}</strong></div>
            <div><span>{yearLabel} 실적</span><strong>{result.eventDays}일 · {result.eventHours}시간</strong></div>
            <div><span>적용 할인율</span><strong>{discount}%</strong></div>
          </div>
        </div>
      </header>

      <div className="page-shell workspace">
        <section className="section-card settings-card">
          <div className="section-heading"><div><p>01 · INPUT</p><h2>분석 조건</h2></div><button className="text-button" onClick={reset}>기본값으로 초기화</button></div>
          <div className="settings-grid">
            <label className="control-field"><FieldLabel>분석연도</FieldLabel><select value={analysisYear} onChange={(event) => setAnalysisYear(Number(event.target.value) as AnalysisYear)}><option value={2024}>2024</option><option value={2025}>2025</option><option value={2026}>2026 YTD</option></select></label>
            <label className="control-field"><FieldLabel>고객 유형</FieldLabel><select value={customerType} onChange={(event) => changeCustomerType(event.target.value as CustomerType)}><option>주택용 TOU</option><option>전기차 완속 저압</option><option>전기차 급속·고압</option></select></label>
            <label className="control-field"><FieldLabel hint="호">대상 고객 수</FieldLabel><input type="number" min="1" value={customerCount} onChange={(event) => setCustomerCount(Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="control-field"><FieldLabel hint="월">기준 사용량</FieldLabel><div className="unit-input"><input value={monthlyUsage} readOnly /><span>kWh</span></div></label>
            <label className="control-field range-field"><FieldLabel hint={`${participation}%`}>제도 참여율</FieldLabel><input type="range" min="0" max="100" step="5" value={participation} onChange={(event) => setParticipation(Number(event.target.value))} /></label>
            <label className="control-field range-field"><FieldLabel hint={`${discount}%`}>발령시간 할인율</FieldLabel><input type="range" min="0" max="100" step="5" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label>
            <div className="control-field"><FieldLabel>주말할인 중복처리</FieldLabel><button type="button" className={`toggle-row ${weekendPriority ? "active" : ""}`} onClick={() => setWeekendPriority((value) => !value)} aria-pressed={weekendPriority}><span className="toggle"><i /></span><span>{weekendPriority ? "기존 주말할인 우선" : "전기예보 할인 우선"}</span></button></div>
          </div>
          <button className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}><span>고급 발령조건</span><span>{advancedOpen ? "−" : "+"}</span></button>
          {advancedOpen ? <div className="advanced-panel">
            <label className="control-field"><FieldLabel>발령방식</FieldLabel><select value={eventMode} onChange={(event) => setEventMode(event.target.value as EventMode)}><option value="ACTUAL">연도별 실제 발령</option><option value="RULE">SMP 조건 재판정</option></select></label>
            <label className="control-field"><FieldLabel hint="원/kWh">SMP 임계값</FieldLabel><input type="number" max="0" value={smpThreshold} disabled={eventMode === "ACTUAL"} onChange={(event) => setSmpThreshold(Math.min(0, Number(event.target.value) || 0))} /></label>
            <div className="hour-range">
              <label className="control-field"><FieldLabel>시작시간</FieldLabel><input type="number" min="1" max="24" value={startHour} disabled={eventMode === "ACTUAL"} onChange={(event) => setStartHour(Math.max(1, Math.min(endHour, Number(event.target.value) || 1)))} /></label>
              <label className="control-field"><FieldLabel>종료시간</FieldLabel><input type="number" min="1" max="24" value={endHour} disabled={eventMode === "ACTUAL"} onChange={(event) => setEndHour(Math.min(24, Math.max(startHour, Number(event.target.value) || startHour)))} /></label>
            </div>
          </div> : null}
        </section>

        <section className="section-card scenario-card">
          <div className="section-heading"><div><p>02 · SCENARIO</p><h2>부하이전 시나리오</h2></div><span className="scenario-badge">실시간 계산</span></div>
          <div className="scenario-layout">
            <div className="scenario-options">
              <button className={`scenario-option ${scenario === "aggregate" ? "selected" : ""}`} onClick={() => setScenario("aggregate")}><span className="radio-dot" /><span><strong>시나리오 1 · 일괄 부하이전</strong><small>{customerType === "주택용 TOU" ? "13개 이전 가능 가전을 모두 포함해 동일한 이전율 적용" : "충전 집중시간의 사용량에 이전율을 일괄 적용"}</small></span></button>
              <button disabled={customerType !== "주택용 TOU"} className={`scenario-option ${scenario === "smart" ? "selected" : ""}`} onClick={() => setScenario("smart")}><span className="radio-dot" /><span><strong>시나리오 2 · 가전 선택형 이전</strong><small>{customerType === "주택용 TOU" ? "체크한 가전의 엑셀상 이전 가능 전력량에만 이전율 적용" : "주택용 TOU 고객에서만 가전별 선택 가능"}</small></span></button>
            </div>
            <div className="shift-control">
              <div className="shift-value"><span>부하이전율</span><strong>{shiftRate}<small>%</small></strong></div>
              <input type="range" min="0" max="100" step="10" value={shiftRate} onChange={(event) => setShiftRate(Number(event.target.value))} />
              <div className="range-marks"><span>0%</span><span>50%</span><span>100%</span></div>
              <div className="route-row"><div><span>이전 출발</span><strong>{customerType.includes("전기차") ? "충전 집중시간" : "최대부하"}</strong></div><span className="route-arrow">→</span><div><span>이전 도착</span><strong>발령시간</strong></div></div>
            </div>
          </div>
          {scenario === "smart" && customerType === "주택용 TOU" ? <div className="appliance-selector">
            <div className="appliance-selector-head">
              <div><p>이전 대상 주요 가전</p><strong>{result.selectedApplianceCount}/{result.selectableApplianceCount}개 선택 · 이전 가능량 {Math.round(result.selectedApplianceShare * 100)}%</strong></div>
              <div><button type="button" onClick={() => setSelectedAppliances([...ALL_APPLIANCE_CODES])}>전체 선택</button><button type="button" onClick={() => setSelectedAppliances([])}>전체 해제</button></div>
            </div>
            <div className="appliance-grid">
              {SELECTABLE_APPLIANCES.map((appliance) => {
                const share = getApplianceShare(appliance.code, analysisYear) * 100;
                return <label className={`appliance-check ${selectedAppliances.includes(appliance.code) ? "checked" : ""}`} key={appliance.code}>
                  <input type="checkbox" checked={selectedAppliances.includes(appliance.code)} onChange={() => toggleAppliance(appliance.code)} />
                  <span><strong>{appliance.label}</strong><small>{appliance.category} · {share > 0 ? `이전비중 ${share.toFixed(1)}%` : "해당 연도 이전량 없음"}</small></span>
                </label>;
              })}
            </div>
            <p className="appliance-note">가전별 비중은 {yearLabel} 실제 발령일의 계절·주중·주말 부하곡선에서 10–16시 밖의 이전 가능 사용량을 기준으로 산정합니다. 모든 가전을 선택하면 시나리오 1과 동일합니다.</p>
          </div> : null}
        </section>

        <section className="metric-grid" aria-label="분석 핵심 지표">
          <article className="metric-card accent-blue"><p>발령일수</p><strong>{result.eventDays}<small>일</small></strong><span>{yearLabel} 적용 기준</span></article>
          <article className="metric-card"><p>총 발령시간</p><strong>{result.eventHours}<small>시간</small></strong><span>일평균 {averageEventHours.toFixed(2)}시간</span></article>
          <article className="metric-card"><p>참여 고객</p><strong>{formatNumber(result.participatingCustomers)}<small>호</small></strong><span>전체의 {participation}%</span></article>
          <article className="metric-card accent-green"><p>예상 이전량</p><strong>{formatNumber(result.grid.shiftedEnergyMwh)}<small>MWh</small></strong><span>에너지 총량 보존</span></article>
        </section>

        <section className="analysis-grid">
          <article className="section-card load-chart-card">
            <div className="section-heading compact"><div><p>03 · LOAD PROFILE</p><h2>시간별 전력사용량 변화</h2></div><div className="legend"><span><i className="legend-base" />현행</span><span><i className="legend-shifted" />부하이전 후</span></div></div>
            <div className="chart-callout"><StatusDot tone="amber" /> {eventMode === "ACTUAL" ? "10–16시" : `${startHour}–${endHour}시`} 전기예보 발령시간</div>
            <div className="load-chart" role="img" aria-label="24시간 현행 및 부하이전 후 사용량 비교 그래프">
              {result.baseLoadProfile.map((value, index) => {
                const hour = index + 1;
                const windowStart = eventMode === "ACTUAL" ? 10 : startHour;
                const windowEnd = eventMode === "ACTUAL" ? 16 : endHour;
                return <div className={`bar-slot ${hour >= windowStart && hour <= windowEnd ? "forecast-window" : ""}`} key={hour}><div className="bar-stack"><i className="bar base" style={{ height: `${(value / maxProfile) * 100}%` }} /><i className="bar shifted" style={{ height: `${(result.shiftedLoadProfile[index] / maxProfile) * 100}%` }} /></div><span>{hour % 3 === 1 ? hour : ""}</span></div>;
              })}
            </div>
            <p className="chart-note">고객유형별 엑셀 기준 부하형상을 정규화해 표시합니다. 부하이전 전후의 24시간 에너지 총량은 동일합니다.</p>
          </article>

          <article className="section-card result-card">
            <div className="result-tabs" role="tablist" aria-label="분석 관점 선택">{(["고객", "한전", "계통"] as ResultTab[]).map((tab) => <button key={tab} className={resultTab === tab ? "active" : ""} onClick={() => setResultTab(tab)} role="tab" aria-selected={resultTab === tab}>{tab}</button>)}</div>
            <div className="result-intro"><p>{activeResult.eyebrow}</p><h2>{activeResult.title}</h2></div>
            <div className="result-list">{activeResult.items.map(([label, value]) => <div key={label}><span>{label}</span><strong className="calculated">{value}</strong></div>)}</div>
            <div className="engine-notice connected"><span>계산엔진 연결 상태</span><strong><StatusDot tone="green" /> 정상</strong><small>Excel 보간 엔진 {result.engineVersion}{result.warnings.length ? ` · 가정 ${result.warnings.length}건` : " · 기준점 일치"}</small></div>
          </article>
        </section>

        {result.warnings.length ? <section className="assumption-strip"><strong>적용 가정</strong><ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}

        <section className="section-card calendar-card">
          <div className="section-heading compact"><div><p>04 · EVENT CALENDAR</p><h2>{yearLabel} 월별 전기예보 발령현황</h2></div><span className="total-chip">합계 {result.eventDays}일</span></div>
          <div className="month-chart">{result.monthlyEventDays.map((value, index) => <div className="month-column" key={months[index]}><strong>{value || "-"}</strong><div><i style={{ height: `${Math.max(4, (value / Math.max(15, ...result.monthlyEventDays)) * 100)}%` }} className={value === 0 ? "zero" : ""} /></div><span>{months[index]}</span></div>)}</div>
        </section>

        <section className="method-strip"><div><span>1</span><p><strong>발령조건 판정</strong>SMP·시간대 기준</p></div><i>→</i><div><span>2</span><p><strong>할인 적용</strong>중복할인 우선순위</p></div><i>→</i><div><span>3</span><p><strong>부하 재배분</strong>에너지 총량 보존</p></div><i>→</i><div><span>4</span><p><strong>편익 산정</strong>고객·한전·계통</p></div></section>
      </div>

      <footer><div className="page-shell footer-inner"><span>PRAS · 탐라는 전기예보제</span><p>Excel 기준점 보정 계산엔진 · 한전 구입비는 SMP 회피단가 130원/kWh, 출력제어 흡수율 85% 가정</p></div></footer>
    </main>
  );
}
