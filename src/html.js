import { DEFAULT_TEMPLATE } from "./default_template.js";

function formatMoney(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function processEachBlocks(template, data) {
  const out = [];
  let pos = 0;
  const openTag = "{{#each ";
  const closeTag = "{{/each}}";

  while (pos < template.length) {
    const openIdx = template.indexOf(openTag, pos);
    if (openIdx === -1) { out.push(template.slice(pos)); break; }

    out.push(template.slice(pos, openIdx));

    const tagEnd = template.indexOf("}}", openIdx + openTag.length);
    if (tagEnd === -1) { out.push(template.slice(openIdx)); break; }

    const key = template.slice(openIdx + openTag.length, tagEnd).trim();
    const bodyStart = tagEnd + 2;

    // Find matching {{/each}} with balance counting
    let depth = 1, searchPos = bodyStart, closeIdx = -1;
    while (searchPos < template.length && depth > 0) {
      const nextOpen = template.indexOf("{{#each ", searchPos);
      const nextClose = template.indexOf(closeTag, searchPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++; searchPos = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) closeIdx = nextClose;
        else searchPos = nextClose + closeTag.length;
      }
    }

    if (closeIdx === -1) { out.push(template.slice(openIdx)); break; }

    const body = template.slice(bodyStart, closeIdx);
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        let itemBody = body;
        // Resolve {{#if ../parentKey}}...{{/if}} against parent data
        itemBody = itemBody.replace(
          /\{\{#if \.\.\/([\w]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
          (_m, parentKey, ifBody) => {
            const val = data[parentKey];
            if (val === undefined || val === null || val === false || val === "" || val === 0) return "";
            return ifBody;
          },
        );
        // Resolve {{../parentVar}} against parent data
        itemBody = itemBody.replace(
          /\{\{\.\.\/([\w]+)\}\}/g,
          (_m, parentKey) => String(data[parentKey] ?? ""),
        );
        out.push(renderTemplate(itemBody, item));
      }
    }

    pos = closeIdx + closeTag.length;
  }

  return out.join("");
}

function processIfBlocks(template, data) {
  let result = template;
  let safety = 0;
  while (result.includes("{{#if ") && safety++ < 50) {
    const prev = result;
    result = result.replace(
      /\{\{#if (\w+)\}\}((?:(?!\{\{#if )[\s\S])*?)\{\{\/if\}\}/g,
      (_match, key, body) => {
        const val = data[key];
        if (val === undefined || val === null || val === false || val === "" || val === 0) return "";
        return body;
      },
    );
    if (result === prev) break;
  }
  return result;
}

function renderTemplate(template, data) {
  let result = processEachBlocks(template, data);
  result = processIfBlocks(result, data);
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return "";
    return String(val);
  });
  return result;
}

export function renderInvoice(invoiceData, customTemplate) {
  const template = customTemplate ?? DEFAULT_TEMPLATE;

  const flatData = {
    invoiceNumber: invoiceData.invoiceNumber,
    client: invoiceData.client,
    periodLabel: invoiceData.periodLabel,
    generatedDate: invoiceData.generatedDate,
    freelancerName: invoiceData.freelancer.name,
    freelancerEmail: invoiceData.freelancer.email,
    freelancerPhone: invoiceData.freelancer.phone,
    freelancerLocation: invoiceData.freelancer.location,
    isRate: invoiceData.mode === "rate",
    isFee: invoiceData.mode === "fee",
    includeHours: invoiceData.includeHours ?? false,
    rate: invoiceData.rate ? formatMoney(invoiceData.rate) : "",
    totalHours: invoiceData.totalHours,
    totalAmount: formatMoney(invoiceData.totalAmount),
    entries: invoiceData.entries?.map((e) => ({
      ...e,
      amount: e.amount !== undefined ? formatMoney(e.amount) : "",
    })),
    hasOutstanding: invoiceData.outstandingBalance > 0,
    outstandingBalance: formatMoney(invoiceData.outstandingBalance),
    paymentTerms: invoiceData.paymentTerms,
  };

  return renderTemplate(template, flatData);
}
