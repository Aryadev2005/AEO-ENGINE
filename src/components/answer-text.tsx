interface AnswerTextProps {
  text: string;
  brandName: string;
  competitorNames: string[];
}

/** Highlights the brand (green) and known competitors (amber) inside an LLM answer. Spec §7. */
export function AnswerText({ text, brandName, competitorNames }: AnswerTextProps) {
  const names = [brandName, ...competitorNames].filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
  }

  const pattern = names.map((n) => escapeRegExp(n)).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const isBrand = part.toLowerCase() === brandName.toLowerCase();
        const isCompetitor = competitorNames.some((c) => c.toLowerCase() === part.toLowerCase());
        if (isBrand) {
          return (
            <mark
              key={i}
              className="rounded bg-green-200/70 px-0.5 font-medium text-green-900 dark:bg-green-900/40 dark:text-green-300"
            >
              {part}
            </mark>
          );
        }
        if (isCompetitor) {
          return (
            <mark
              key={i}
              className="rounded bg-amber-200/70 px-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
