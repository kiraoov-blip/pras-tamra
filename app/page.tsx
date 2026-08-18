"use client";

import { useMemo, useState } from "react";

type CustomerType = "주택용 TOU" | "전기차 완속 저압" | "전기차 급속·고압";
type ResultTab = "고객" | "한전" | "계통";

const monthlyEvents = [4, 6, 15, 14, 6, 0, 0, 0, 0, 2, 7, 2];
const months = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const baseLoad = [42, 39, 36, 34, 33, 35, 40, 48, 61, 53, 49, 48, 47, 46, 47, 49, 58, 72, 86, 92, 90, 82, 69, 55];

const referenceBenefit: Record<CustomerType, { base: number; slope: number; use: number }> = {
  "주택용 TOU": { base: 10142, slope: 17395, use: 584 },
  "전기차 완속 저압": { base: 10319, slope: 21524, use: 336 },
  "전기차 급속·고압": { base: 20955, slope: 7176, use: 400 },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <div className="field-label"><span>{children}</span>{hint ? <small>{hint}</small> : null}</div>;
}

function StatusDot({ tone = "blue" }: { tone?: "blue" | "green" | "amber" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

export default function Home() {
  const [customerType, setCustomerType] = useState<CustomerType>("주택용 TOU");
  const [customerCount, setCustomerCount] = useState(1200);
  const [participation, setParticipation] = useState(80);
  const [discount, setDiscount] = useState(50);
  const [shiftRate, setShiftRate] = useState(50);
  const [scenario, setScenario] = useState<"aggregate" | "smart">("aggregate");
  const [weekendPriority, setWeekendPriority] = useState(true);
  const [resultTab, setResultTab] = useState<ResultTab>("고객");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const reference = referenceBenefit[customerType];
  const participatingCustomers = Math.round(customerCount * (participation / 100));
  const customerBenefit = Math.round((reference.base + reference.slope * (shiftRate / 100)) * (discount / 50));
  const totalBenefit = customerBenefit * participatingCustomers;
  const shiftedMwh = Math.round((participatingCustomers * reference.use * 12 * (shiftRate / 100) * 0.18) / 1000);

  const shiftedLoad = useMemo(() => {
    const result = [...baseLoad];
    const moved = shiftRate * 0.14;
    [17, 18, 19, 20, 21].forEach((hour) => { result[hour] = Math.max(14, result[hour] - moved); });
    [10, 11, 12, 13, 14, 15].forEach((hour) => { result[hour] += (moved * 5) / 6; });
    return result;
  }, [shiftRate]);

  const resultCopy = {
    고객: {
      eyebrow: "고객 관점",
      title: "할인과 부하이전으로 발생하는 요금 편익",
      items: [["고객당 연간 편익", `${formatNumber(customerBenefit)}원`, "provisional"], ["전체 고객 편익", `${formatNumber(totalBenefit / 10000)}만원`, "provisional"], ["참여 고객 수", `${formatNumber(participatingCustomers)}호`, "normal"]],
    },
    한전: {
      eyebrow: "한전 관점",
      title: "판매수익과 SMP 기반 구입비 영향을 분리",
      items: [["전력판매수익 변화", "엔진 연결 대기", "waiting"], ["SMP 구입비 영향", "엔진 연결 대기", "waiting"], ["단기 순재무영향", "엔진 연결 대기", "waiting"]],
    },
    계통: {
      eyebrow: "계통 관점",
      title: "태양광 과잉시간으로 이동한 전력량을 확인",
      items: [["연간 이전 전력량", `${formatNumber(shiftedMwh)}MWh`, "provisional"], ["발령시간 증가부하", "엔진 연결 대기", "waiting"], ["출력제어 완화량", "별도 가정 필요", "waiting"]],
    },
  } as const;
  const activeResult = resultCopy[resultTab];

  const reset = () => {
    setCustomerType("주택용 TOU"); setCustomerCount(1200); setParticipation(80);
    setDiscount(50); setShiftRate(50); setScenario("aggregate"); setWeekendPriority(true);
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
            <div><span>발령기준</span><strong>제주 SMP ≤ 0원</strong></div><div><span>대상시간</span><strong>10시–16시</strong></div>
            <div><span>2025 실적</span><strong>56일 · 150시간</strong></div><div><span>기본 할인율</span><strong>50%</strong></div>
          </div>
        </div>
      </header>

      <div className="page-shell workspace">
        <section className="section-card settings-card">
          <div className="section-heading"><div><p>01 · INPUT</p><h2>분석 조건</h2></div><button className="text-button" onClick={reset}>기본값으로 초기화</button></div>
          <div className="settings-grid">
            <label className="control-field"><FieldLabel>분석연도</FieldLabel><select defaultValue="2025"><option>2024</option><option>2025</option><option>2026 YTD</option></select></label>
            <label className="control-field"><FieldLabel>고객 유형</FieldLabel><select value={customerType} onChange={(event) => setCustomerType(event.target.value as CustomerType)}><option>주택용 TOU</option><option>전기차 완속 저압</option><option>전기차 급속·고압</option></select></label>
            <label className="control-field"><FieldLabel hint="호">대상 고객 수</FieldLabel><input type="number" min="1" value={customerCount} onChange={(event) => setCustomerCount(Math.max(1, Number(event.target.value)))} /></label>
            <label className="control-field"><FieldLabel hint="월">기준 사용량</FieldLabel><div className="unit-input"><input value={reference.use} readOnly /><span>kWh</span></div></label>
            <label className="control-field range-field"><FieldLabel hint={`${participation}%`}>제도 참여율</FieldLabel><input type="range" min="0" max="100" step="5" value={participation} onChange={(event) => setParticipation(Number(event.target.value))} /></label>
            <label className="control-field range-field"><FieldLabel hint={`${discount}%`}>발령시간 할인율</FieldLabel><input type="range" min="0" max="100" step="5" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label>
            <div className="control-field"><FieldLabel>주말할인 중복처리</FieldLabel><button className={`toggle-row ${weekendPriority ? "active" : ""}`} onClick={() => setWeekendPriority((value) => !value)} aria-pressed={weekendPriority}><span className="toggle"><i /></span><span>{weekendPriority ? "기존 주말할인 우선" : "전기예보 할인 우선"}</span></button></div>
          </div>
          <button className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}><span>고급 발령조건</span><span>{advancedOpen ? "−" : "+"}</span></button>
          {advancedOpen ? <div className="advanced-panel">
            <label className="control-field"><FieldLabel>발령방식</FieldLabel><select defaultValue="actual"><option value="actual">2025년 실제 발령</option><option value="rule">SMP 조건 자동판정</option><option value="manual">사용자 지정</option></select></label>
            <label className="control-field"><FieldLabel hint="원/kWh">SMP 임계값</FieldLabel><input type="number" defaultValue="0" /></label>
            <label className="control-field"><FieldLabel>적용시간 범위</FieldLabel><select defaultValue="10-16"><option value="10-16">10시–16시</option><option value="09-17">09시–17시</option><option value="custom">직접 설정</option></select></label>
          </div> : null}
        </section>

        <section className="section-card scenario-card">
          <div className="section-heading"><div><p>02 · SCENARIO</p><h2>부하이전 시나리오</h2></div><span className="scenario-badge">단일 시나리오</span></div>
          <div className="scenario-layout">
            <div className="scenario-options">
              <button className={`scenario-option ${scenario === "aggregate" ? "selected" : ""}`} onClick={() => setScenario("aggregate")}><span className="radio-dot" /><span><strong>시나리오 1 · 전체부하 이전</strong><small>최대부하 시간대 사용량의 일정 비율을 발령시간대로 균등 이전</small></span></button>
              <button className={`scenario-option ${scenario === "smart" ? "selected" : ""}`} onClick={() => setScenario("smart")}><span className="radio-dot" /><span><strong>시나리오 2 · 선택부하 이전</strong><small>요금편익이 큰 가전 또는 충전부하를 발령시간대로 선택 이전</small></span></button>
            </div>
            <div className="shift-control">
              <div className="shift-value"><span>부하이전율</span><strong>{shiftRate}<small>%</small></strong></div>
              <input type="range" min="0" max="100" step="10" value={shiftRate} onChange={(event) => setShiftRate(Number(event.target.value))} />
              <div className="range-marks"><span>0%</span><span>50%</span><span>100%</span></div>
              <div className="route-row"><div><span>이전 출발</span><strong>{customerType === "전기차 완속 저압" ? "경부하" : "최대부하"}</strong></div><span className="route-arrow">→</span><div><span>이전 도착</span><strong>발령시간</strong></div></div>
            </div>
          </div>
        </section>

        <section className="metric-grid" aria-label="분석 핵심 지표">
          <article className="metric-card accent-blue"><p>발령일수</p><strong>56<small>일</small></strong><span>2025년 실제 발령</span></article>
          <article className="metric-card"><p>총 발령시간</p><strong>150<small>시간</small></strong><span>일평균 2.68시간</span></article>
          <article className="metric-card"><p>참여 고객</p><strong>{formatNumber(participatingCustomers)}<small>호</small></strong><span>전체의 {participation}%</span></article>
          <article className="metric-card accent-green"><p>예상 이전량</p><strong>{formatNumber(shiftedMwh)}<small>MWh</small></strong><span>임시 산식 적용</span></article>
        </section>

        <section className="analysis-grid">
          <article className="section-card load-chart-card">
            <div className="section-heading compact"><div><p>03 · LOAD PROFILE</p><h2>시간별 전력사용량 변화</h2></div><div className="legend"><span><i className="legend-base" />현행</span><span><i className="legend-shifted" />부하이전 후</span></div></div>
            <div className="chart-callout"><StatusDot tone="amber" /> 10–16시 전기예보 발령시간</div>
            <div className="load-chart" role="img" aria-label="24시간 현행 및 부하이전 후 사용량 비교 예시 그래프">
              {baseLoad.map((value, index) => <div className={`bar-slot ${index >= 10 && index <= 15 ? "forecast-window" : ""}`} key={index}><div className="bar-stack"><i className="bar base" style={{ height: `${value}%` }} /><i className="bar shifted" style={{ height: `${shiftedLoad[index]}%` }} /></div><span>{index % 3 === 0 ? `${index}` : ""}</span></div>)}
            </div>
            <p className="chart-note">현재는 화면 검토용 표준 부하곡선이며, 계산엔진 연결 후 발령일·계절·고객유형별 실제 곡선으로 대체됩니다.</p>
          </article>

          <article className="section-card result-card">
            <div className="result-tabs" role="tablist" aria-label="분석 관점 선택">{(["고객", "한전", "계통"] as ResultTab[]).map((tab) => <button key={tab} className={resultTab === tab ? "active" : ""} onClick={() => setResultTab(tab)} role="tab" aria-selected={resultTab === tab}>{tab}</button>)}</div>
            <div className="result-intro"><p>{activeResult.eyebrow}</p><h2>{activeResult.title}</h2></div>
            <div className="result-list">{activeResult.items.map(([label, value, status]) => <div key={label}><span>{label}</span><strong className={status}>{value}</strong></div>)}</div>
            <div className="engine-notice"><span>계산엔진 연결 상태</span><strong><StatusDot tone="amber" /> 대기</strong><small>현재 표시된 금액과 이전량은 화면 구성을 확인하기 위한 잠정값입니다.</small></div>
          </article>
        </section>

        <section className="section-card calendar-card">
          <div className="section-heading compact"><div><p>04 · EVENT CALENDAR</p><h2>2025년 월별 전기예보 발령현황</h2></div><span className="total-chip">합계 56일</span></div>
          <div className="month-chart">{monthlyEvents.map((value, index) => <div className="month-column" key={months[index]}><strong>{value || "-"}</strong><div><i style={{ height: `${Math.max(4, (value / 15) * 100)}%` }} className={value === 0 ? "zero" : ""} /></div><span>{months[index]}</span></div>)}</div>
        </section>

        <section className="method-strip"><div><span>1</span><p><strong>발령조건 판정</strong>SMP·시간대 기준</p></div><i>→</i><div><span>2</span><p><strong>할인 적용</strong>중복할인 우선순위</p></div><i>→</i><div><span>3</span><p><strong>부하 재배분</strong>에너지 총량 보존</p></div><i>→</i><div><span>4</span><p><strong>편익 산정</strong>고객·한전·계통</p></div></section>
      </div>

      <footer><div className="page-shell footer-inner"><span>PRAS · 탐라는 전기예보제</span><p>초기 화면 골격 — 계산엔진 및 검증 로직 연결 전</p></div></footer>
    </main>
  );
}
