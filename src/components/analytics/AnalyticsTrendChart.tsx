import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, Eye, Heart, Bookmark, MessageCircle, UsersRound, UserRoundPlus } from 'lucide-react';

export interface ChartDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
  secondaryValue?: number;
}

interface AnalyticsTrendChartProps {
  data: ChartDataPoint[];
  metricLabel: string;
  metricColor?: string;
  timeRangeLabel?: string;
  earliestTrackedDate?: string;
  isLoading?: boolean;
}

export const AnalyticsTrendChart: React.FC<AnalyticsTrendChartProps> = ({
  data,
  metricLabel,
  metricColor = 'var(--color-accent, #6366f1)',
  timeRangeLabel,
  earliestTrackedDate,
  isLoading = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 230 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // ResizeObserver to ensure 100% responsiveness without page re-render glitch
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setDimensions({
            width: Math.floor(entry.contentRect.width),
            height: Math.max(190, Math.min(260, Math.floor(entry.contentRect.width * 0.35))),
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute metrics and coordinates
  const padding = { top: 20, right: 20, bottom: 32, left: 42 };
  const chartWidth = Math.max(dimensions.width - padding.left - padding.right, 50);
  const chartHeight = Math.max(dimensions.height - padding.top - padding.bottom, 50);

  const maxValue = useMemo(() => {
    if (!data || data.length === 0) return 5;
    const max = Math.max(...data.map(d => d.value));
    if (max <= 0) return 5;
    // Round up nicely
    const power = Math.pow(10, Math.floor(Math.log10(max)));
    const multiple = max / power;
    if (multiple <= 1) return power;
    if (multiple <= 2) return 2 * power;
    if (multiple <= 5) return 5 * power;
    return Math.ceil(multiple) * power;
  }, [data]);

  const points = useMemo(() => {
    if (!data || data.length === 0) return [];
    const count = data.length;
    return data.map((d, i) => {
      const x = count === 1 ? padding.left + chartWidth / 2 : padding.left + (i / (count - 1)) * chartWidth;
      const y = padding.top + chartHeight - (d.value / maxValue) * chartHeight;
      return { x, y, ...d };
    });
  }, [data, chartWidth, chartHeight, maxValue, padding]);

  // Generate SVG path for line and area fill
  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '' };
    if (points.length === 1) {
      const p = points[0];
      return {
        linePath: `M ${p.x - 10} ${p.y} L ${p.x + 10} ${p.y}`,
        areaPath: `M ${p.x - 10} ${p.y} L ${p.x + 10} ${p.y} L ${p.x + 10} ${padding.top + chartHeight} L ${p.x - 10} ${padding.top + chartHeight} Z`,
      };
    }

    // Build smooth cubic bezier curve
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      line += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const bottomY = padding.top + chartHeight;
    const area = `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return { linePath: line, areaPath: area };
  }, [points, chartHeight, padding]);

  // Format date helper
  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Determine tick interval for X-axis to prevent label overlap
  const xTicks = useMemo(() => {
    if (points.length === 0) return [];
    if (points.length <= 7) return points;
    const step = Math.ceil(points.length / (dimensions.width < 450 ? 4 : 7));
    return points.filter((_, idx) => idx === 0 || idx === points.length - 1 || idx % step === 0);
  }, [points, dimensions.width]);

  // Y-axis gridlines
  const yTicks = useMemo(() => {
    return [0, maxValue * 0.5, maxValue];
  }, [maxValue]);

  const activePoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;

    let closestIdx = 0;
    let minDistance = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - pointerX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });
    setHoveredIndex(closestIdx);
  };

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className="w-full h-56 rounded-2xl bg-surface-elevated/40 border border-border flex items-center justify-center animate-pulse"
      >
        <div className="flex items-center gap-2.5 text-xs text-text-muted">
          <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span>Loading performance telemetry...</span>
        </div>
      </div>
    );
  }

  // Zero / Empty Real Data State
  if (!data || data.length === 0) {
    const getMetricIcon = (label: string) => {
      const lower = (label || '').toLowerCase();
      if (lower.includes('view')) return Eye;
      if (lower.includes('like')) return Heart;
      if (lower.includes('save')) return Bookmark;
      if (lower.includes('comment')) return MessageCircle;
      if (lower.includes('follow')) return UserRoundPlus;
      if (lower.includes('engag') || lower.includes('percent') || lower.includes('%')) return UsersRound;
      return Eye;
    };
    const MetricIcon = getMetricIcon(metricLabel);
    const cleanMetricLabel = metricLabel.replace(/\s*%/g, '').trim().toLowerCase();

    return (
      <div
        ref={containerRef}
        className="w-full py-12 sm:py-14 px-4 rounded-2xl bg-surface border border-border text-center flex flex-col items-center justify-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border shadow-soft flex items-center justify-center mx-auto mb-3 text-accent">
          <MetricIcon className="w-5 h-5 text-accent" />
        </div>
        <h4 className="text-sm font-semibold text-text-primary mb-1">
          No {cleanMetricLabel} recorded in this period
        </h4>
        <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
          {cleanMetricLabel.includes('follow')
            ? 'Follower growth and net changes will appear here as users follow or unfollow your profile.'
            : 'Daily analytics collection is active. As new views and interactions occur, your daily performance trend will populate here automatically.'}
        </p>
        {earliestTrackedDate && (
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-elevated text-[11px] text-text-muted border border-border">
            <Calendar className="w-3 h-3 text-accent" />
            <span>Daily collection started on {formatDateLabel(earliestTrackedDate)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full space-y-2 select-none relative">
      <div className="relative w-full rounded-2xl bg-surface border border-border p-2 sm:p-3 overflow-hidden">
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="overflow-visible block touch-none cursor-crosshair"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
          role="img"
          aria-label={`${metricLabel} trend chart`}
        >
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent, #6366f1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-accent, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((val, idx) => {
            const y = padding.top + chartHeight - (val / maxValue) * chartHeight;
            return (
              <g key={`y-grid-${idx}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartWidth}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeDasharray={val === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-current text-text-muted text-[10px] font-mono"
                >
                  {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val)}
                  {metricLabel.toLowerCase().includes('engag') ? '%' : ''}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}

          {/* Line Curve */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-accent, #6366f1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points on line (for small datasets) */}
          {points.length <= 14 &&
            points.map((p, idx) => (
              <circle
                key={`pt-${idx}`}
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === idx ? 5 : 3}
                fill="var(--color-surface, #ffffff)"
                stroke="var(--color-accent, #6366f1)"
                strokeWidth={hoveredIndex === idx ? 2.5 : 1.5}
                className="transition-all duration-150"
              />
            ))}

          {/* Active Hover Guide & Highlighted Point */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padding.top}
                x2={activePoint.x}
                y2={padding.top + chartHeight}
                stroke="currentColor"
                className="text-text-muted/40"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="6"
                fill="var(--color-accent, #6366f1)"
                stroke="var(--color-surface, #ffffff)"
                strokeWidth="2.5"
                className="shadow-md"
              />
            </g>
          )}

          {/* X-Axis Ticks & Labels */}
          {xTicks.map((p, idx) => (
            <g key={`x-tick-${idx}`}>
              <text
                x={p.x}
                y={padding.top + chartHeight + 18}
                textAnchor="middle"
                className="fill-current text-text-muted text-[10px] font-medium"
              >
                {formatDateLabel(p.date)}
              </text>
            </g>
          ))}
        </svg>

        {/* Floating Tooltip Card */}
        {activePoint && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 px-3 py-2 rounded-xl bg-surface-elevated/95 backdrop-blur-sm border border-border shadow-soft text-left transition-transform duration-75"
            style={{
              left: `${Math.max(60, Math.min(dimensions.width - 60, activePoint.x))}px`,
              top: `${Math.max(8, activePoint.y - 48)}px`,
            }}
          >
            <p className="text-[10px] text-text-muted font-medium">{formatDateLabel(activePoint.date)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <p className="text-xs font-bold text-text-primary">
                {metricLabel.toLowerCase().includes('engag')
                  ? `${activePoint.value}% engagement`
                  : `${activePoint.value.toLocaleString()} ${metricLabel.toLowerCase()}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Subtle Information Note if selected range predates start */}
      {earliestTrackedDate && (
        <p className="text-[11px] text-text-muted text-right px-1">
          Daily metrics collected starting from {formatDateLabel(earliestTrackedDate)}. Lifetime counts in summary cards
          reflect all historical activity.
        </p>
      )}
    </div>
  );
};
