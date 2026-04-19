/**
 * AiRecommendationReport — AI 제안서 추천 트래킹 리포트
 * Phase 2 Sprint 2-6
 *
 * 지표:
 *  - 추천 호출 수, 제안 개수 (addition/removal/emphasis)
 *  - 실제 적용률 (addition_rate / removal_rate)
 *  - 일별 추이 (SVG bar chart)
 *  - 가장 많이 적용된 모듈 Top N
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { getRecommendationStats } from "@/services/proposals";
import type { RecommendationStats } from "@/types/proposal";
import "./AiRecommendationReport.css";

type RangeOption = 7 | 14 | 30 | 90;

const RANGE_LABELS: Record<RangeOption, string> = {
  7: "최근 7일",
  14: "최근 14일",
  30: "최근 30일",
  90: "최근 90일",
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function AiRecommendationReport() {
  const { currentOrg, myRole } = useOrg();
  const [days, setDays] = useState<RangeOption>(30);
  const [stats, setStats] = useState<RecommendationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView =
    myRole === "owner" || myRole === "admin" || myRole === "member";

  const loadStats = useCallback(async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      const data = await getRecommendationStats(currentOrg.id, { days });
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "리포트 데이터 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, days]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const dailyMax = useMemo(() => {
    if (!stats) return 0;
    return stats.daily.reduce(
      (m, r) => Math.max(m, r.calls, r.additions, r.removals),
      0,
    );
  }, [stats]);

  if (!canView) {
    return (
      <div className="ai-report-page">
        <h2>AI 추천 리포트</h2>
        <p className="empty-state">조직 멤버 이상만 열람 가능합니다.</p>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="ai-report-page">
        <h2>AI 추천 리포트</h2>
        <p className="empty-state">소속된 조직이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="ai-report-page">
      <div className="page-header">
        <div>
          <h2>AI 추천 리포트</h2>
          <p className="page-subtitle">
            {currentOrg.name} · Claude 제안서 추천 활용 현황
          </p>
        </div>
        <div className="ai-report-controls">
          <select
            className="ai-report-range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as RangeOption)}
          >
            {Object.entries(RANGE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={loadStats}>
            새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <p className="loading">로딩 중...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : !stats ? (
        <p className="empty-state">데이터가 없습니다.</p>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="ai-kpi-grid">
            <div className="ai-kpi-card">
              <div className="ai-kpi-label">호출 수</div>
              <div className="ai-kpi-value">{stats.totals.calls}</div>
              <div className="ai-kpi-hint">
                {stats.range.from} ~ {stats.range.to}
              </div>
            </div>
            <div className="ai-kpi-card">
              <div className="ai-kpi-label">추가 제안</div>
              <div className="ai-kpi-value">{stats.totals.additions}</div>
              <div className="ai-kpi-hint">
                적용 {stats.totals.applied_additions}건 ·{" "}
                <strong className="ai-rate-positive">
                  {formatPercent(stats.totals.addition_rate)}
                </strong>
              </div>
            </div>
            <div className="ai-kpi-card">
              <div className="ai-kpi-label">제거 제안</div>
              <div className="ai-kpi-value">{stats.totals.removals}</div>
              <div className="ai-kpi-hint">
                적용 {stats.totals.applied_removals}건 ·{" "}
                <strong className="ai-rate-neutral">
                  {formatPercent(stats.totals.removal_rate)}
                </strong>
              </div>
            </div>
            <div className="ai-kpi-card">
              <div className="ai-kpi-label">강조 제안</div>
              <div className="ai-kpi-value">{stats.totals.emphasis}</div>
              <div className="ai-kpi-hint">참고용 가이드</div>
            </div>
          </div>

          {/* 일별 추이 */}
          <div className="card ai-report-card">
            <div className="ai-report-card-head">
              <h3>일별 추이</h3>
              <div className="ai-legend">
                <span className="ai-legend-item">
                  <span className="ai-dot ai-dot-call" /> 호출
                </span>
                <span className="ai-legend-item">
                  <span className="ai-dot ai-dot-add" /> 추가
                </span>
                <span className="ai-legend-item">
                  <span className="ai-dot ai-dot-remove" /> 제거
                </span>
              </div>
            </div>
            {stats.daily.length === 0 || dailyMax === 0 ? (
              <p className="empty-state">
                해당 기간에 추천 호출 이력이 없습니다.
              </p>
            ) : (
              <div className="ai-daily-chart">
                {stats.daily.map((row) => (
                  <div key={row.day} className="ai-daily-col">
                    <div className="ai-daily-bars">
                      <div
                        className="ai-bar ai-bar-call"
                        style={{ height: `${(row.calls / dailyMax) * 100}%` }}
                        title={`${row.day} · 호출 ${row.calls}`}
                      />
                      <div
                        className="ai-bar ai-bar-add"
                        style={{
                          height: `${(row.additions / dailyMax) * 100}%`,
                        }}
                        title={`${row.day} · 추가 제안 ${row.additions} / 적용 ${row.applied_additions}`}
                      />
                      <div
                        className="ai-bar ai-bar-remove"
                        style={{
                          height: `${(row.removals / dailyMax) * 100}%`,
                        }}
                        title={`${row.day} · 제거 제안 ${row.removals} / 적용 ${row.applied_removals}`}
                      />
                    </div>
                    <div className="ai-daily-label">{formatDate(row.day)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 적용 상위 모듈 */}
          <div className="card ai-report-card">
            <div className="ai-report-card-head">
              <h3>가장 많이 적용된 모듈</h3>
              <span className="ai-report-hint">
                추천 제안 중 실제로 슬라이드에 반영된 모듈
              </span>
            </div>
            {stats.top_applied_modules.length === 0 ? (
              <p className="empty-state">아직 적용 이력이 없습니다.</p>
            ) : (
              <table className="ai-top-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>모듈 코드</th>
                    <th style={{ width: 100, textAlign: "right" }}>
                      적용 횟수
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_applied_modules.map((row, i) => (
                    <tr key={row.code}>
                      <td>{i + 1}</td>
                      <td className="ai-top-code">{row.code}</td>
                      <td style={{ textAlign: "right" }}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AiRecommendationReport;
