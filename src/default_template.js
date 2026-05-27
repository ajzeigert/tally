export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header { display: flex; justify-content: space-between; margin-bottom: 32px; }
  .header h1 { font-size: 28px; margin-bottom: 4px; }
  .meta { text-align: right; color: #666; }
  .meta p { margin: 2px 0; }
  .from { color: #666; margin-bottom: 24px; font-size: 13px; }
  .from p { margin: 1px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { text-align: left; border-bottom: 2px solid #e0e0e0; padding: 8px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 8px; border-bottom: 1px solid #eee; }
  .right { text-align: right; }
  .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
  .totals table { width: auto; }
  .totals td { padding: 4px 12px; border: none; }
  .totals tr:last-child td { font-weight: bold; font-size: 16px; border-top: 2px solid #e0e0e0; padding-top: 8px; }
  .outstanding { margin-top: 12px; text-align: right; color: #c00; font-size: 13px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Invoice #{{invoiceNumber}}</h1>
      <p><strong>{{client}}</strong></p>
    </div>
    <div class="meta">
      <p>{{periodLabel}}</p>
      <p>Generated {{generatedDate}}</p>
    </div>
  </div>

  <div class="from">
    <p><strong>{{freelancerName}}</strong></p>
    {{#if freelancerEmail}}<p>{{freelancerEmail}}</p>{{/if}}
    {{#if freelancerPhone}}<p>{{freelancerPhone}}</p>{{/if}}
    {{#if freelancerLocation}}<p>{{freelancerLocation}}</p>{{/if}}
  </div>

  {{#if isRate}}
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th class="right">Hours</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each entries}}
      <tr>
        <td>{{date}}</td>
        <td>{{description}}</td>
        <td class="right">{{hours}}</td>
        <td class="right">{{amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="totals">
    <table>
      <tr><td>Total hours</td><td class="right">{{totalHours}}</td></tr>
      <tr><td>Rate</td><td class="right">{{rate}}/hr</td></tr>
      <tr><td>Total</td><td class="right">{{totalAmount}}</td></tr>
    </table>
  </div>
  {{/if}}

  {{#if isFee}}
  {{#if includeHours}}
  <table>
    <thead>
      <tr><th>Date</th><th>Description</th><th class="right">Hours</th></tr>
    </thead>
    <tbody>
      {{#each entries}}
      <tr><td>{{date}}</td><td>{{description}}</td><td class="right">{{hours}}</td></tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}
  <div class="totals">
    <table>
      <tr><td>Total</td><td class="right">{{totalAmount}}</td></tr>
    </table>
  </div>
  {{/if}}

  {{#if hasOutstanding}}
  <p class="outstanding">Outstanding balance: {{outstandingBalance}}</p>
  {{/if}}

  {{#if paymentTerms}}
  <div class="footer">
    <p>Payment terms: {{paymentTerms}}</p>
  </div>
  {{/if}}
</body>
</html>`;
