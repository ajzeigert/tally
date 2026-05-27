import { weekStart, weekEnd, formatDate } from "./timesheet.js";

export function resolvePeriod(input, now = new Date()) {
  if (input === "this-week") {
    const todayStr = formatDate(now);
    const start = weekStart(todayStr);
    const end = weekEnd(todayStr);
    return weekResult(start, end);
  }

  if (input === "last-week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    const start = weekStart(formatDate(d));
    const end = weekEnd(formatDate(d));
    return weekResult(start, end);
  }

  if (input === "this-month") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return monthResult(`${y}-${m}`);
  }

  if (input === "last-month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return monthResult(`${y}-${m}`);
  }

  if (/^\d{4}-\d{2}$/.test(input)) {
    return monthResult(input);
  }

  if (/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [start, end] = input.split(",");
    return {
      start, end,
      label: `range ${start},${end}`,
      humanLabel: `${start} to ${end}`,
    };
  }

  throw new Error(
    `Invalid period: "${input}". Use YYYY-MM-DD,YYYY-MM-DD, YYYY-MM, ` +
    `this-week, last-week, this-month, or last-month.`
  );
}

function monthResult(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  const humanLabel = new Date(y, m - 1).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
  return { start, end, label: `month ${monthStr}`, humanLabel };
}

function weekResult(start, end) {
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return {
    start: startStr,
    end: endStr,
    label: `week ${startStr}`,
    humanLabel: `Week of ${fmt(start)} – ${fmt(end)}`,
  };
}
