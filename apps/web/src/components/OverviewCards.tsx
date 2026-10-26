// The summary counts above the table (REQ-UI-01).
import type { SummaryResponse } from "@flakewatch/shared";
import { formatCount } from "../lib/format.js";

interface Card {
  key: keyof Pick<SummaryResponse, "broken" | "quarantined" | "flaky" | "failedAttemptsFromFlakes">;
  label: string;
  hint: string;
}

const CARDS: readonly Card[] = [
  { key: "broken", label: "Broken", hint: "Failing every time: fix the code" },
  { key: "quarantined", label: "Quarantined", hint: "Flaky often enough to stop blocking merges" },
  { key: "flaky", label: "Flaky", hint: "Failed and passed on the same commit" },
  {
    key: "failedAttemptsFromFlakes",
    label: "Failed attempts from flakes",
    hint: "CI runs wasted by flaky and quarantined tests",
  },
];

export function OverviewCards({ summary }: { summary: SummaryResponse }) {
  return (
    <dl className="cards" aria-label="Summary">
      {CARDS.map((card) => (
        <div key={card.key} className={`card card--${card.key}`}>
          <dt className="card__label">{card.label}</dt>
          <dd className="card__value" data-testid={`card-${card.key}`}>
            {formatCount(summary[card.key])}
          </dd>
          <dd className="card__hint">{card.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
