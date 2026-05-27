import yaml from "js-yaml";

const OVERRIDE_FIELDS = ["name", "email", "phone", "location", "payment_terms"];

export function parseTimesheet(text) {
  const raw = yaml.load(text);

  if (!raw.client) throw new Error("Timesheet is missing required field: client");
  if (!raw.entries || !Array.isArray(raw.entries)) {
    throw new Error("Timesheet is missing required field: entries");
  }
  if (!raw.mode) throw new Error("Timesheet is missing required field: mode");
  if (raw.mode !== "rate" && raw.mode !== "fee") {
    throw new Error("mode must be 'rate' or 'fee'");
  }
  if (raw.mode === "rate" && raw.rate === undefined) {
    throw new Error("Timesheet is missing required field: rate");
  }
  if (raw.mode === "fee" && raw.fee === undefined) {
    throw new Error("Timesheet is missing required field: fee");
  }

  const overrides = {};
  for (const field of OVERRIDE_FIELDS) {
    if (raw[field] !== undefined) overrides[field] = raw[field];
  }

  const entries = raw.entries.map((e) => {
    const dateVal = e.date instanceof Date
      ? e.date.toISOString().slice(0, 10)
      : String(e.date);
    return {
      date: dateVal,
      hours: Number(e.hours),
      description: String(e.description),
    };
  });

  const base = { client: String(raw.client), mode: raw.mode, overrides, entries };
  if (raw.mode === "rate") return { ...base, rate: Number(raw.rate) };
  return { ...base, fee: Number(raw.fee) };
}

export function clientSlug(client) {
  return client.toLowerCase().replace(/\s+/g, "-");
}

export function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function weekEnd(dateStr) {
  const start = weekStart(dateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export function filterByWeek(entries, dateStr) {
  const start = weekStart(dateStr);
  const end = weekEnd(dateStr);
  return entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d >= start && d <= end;
  });
}

export function filterByMonth(entries, monthStr) {
  return entries.filter((e) => e.date.startsWith(monthStr));
}

export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function filterByRange(entries, start, end) {
  return entries.filter((e) => e.date >= start && e.date <= end);
}
