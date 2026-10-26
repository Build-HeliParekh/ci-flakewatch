// The 30-day flake-rate trend (REQ-UI-07, REQ-STA-05). A hidden table carries the same values
// for screen readers and tests.
import type { TrendPoint } from "@flakewatch/shared";
import { useEffect, useRef, useState } from "react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

/** The element's width, following resizes where ResizeObserver exists. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0) setWidth(element.clientWidth - 16);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const percent = (rate: number | null) =>
  rate === null ? "No commits" : `${(rate * 100).toFixed(1)}%`;

export function TrendChart({ points }: { points: readonly TrendPoint[] }) {
  const [ref, width] = useWidth(640);
  const data = points.map((point) => ({
    date: point.date.slice(5),
    rate: point.flakeRate === null ? null : point.flakeRate * 100,
  }));
  return (
    <figure className="trend">
      <figcaption className="section__title">Flake rate, last 30 days</figcaption>
      <div className="trend__chart" aria-hidden="true" ref={ref}>
        <LineChart
          width={width}
          height={180}
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
        >
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            interval={6}
            tickLine={false}
          />
          <YAxis
            domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Flake rate"]} />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </div>
      <table className="visually-hidden" aria-label="Flake rate by day">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Flake rate</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              key={point.date}
              data-testid="trend-point"
              data-date={point.date}
              data-rate={point.flakeRate ?? ""}
            >
              <td>{point.date}</td>
              <td>{percent(point.flakeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
