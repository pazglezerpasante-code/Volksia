import { Fragment, type ReactNode } from "react";

/**
 * Renderer mínimo de Markdown (negrita, cursiva, `código`, bloques de código,
 * listas, títulos, tablas y enlaces http/https). Sin dependencias y sin
 * dangerouslySetInnerHTML: todo se construye como elementos de React.
 */

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12px] text-accent-2">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-accent-2 underline">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const BULLET = /^\s*[*-]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={k++} className="overflow-x-auto rounded-xl bg-panel-2 p-3 font-mono text-xs leading-5">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      out.push(
        <p key={k++} className="font-semibold text-fg">
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableSep(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k++} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border-b border-line px-2 py-1.5 font-semibold">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-line/60 px-2 py-1.5">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = (ordered ? ORDERED : BULLET).exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={k++} className={`grid gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !isTableRow(lines[i])
    )
      para.push(lines[i++]);
    out.push(
      <p key={k++}>
        {para.map((t, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {inline(t)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="grid gap-2.5 leading-6">{out}</div>;
}
