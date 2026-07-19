function getText(el, selector) {
  const found = el.querySelector(selector);
  return found ? found.textContent.trim() : '';
}

export async function captureElement(element, scale = 3) {
  const html2canvas = (await import('html2canvas')).default;
  
  // === EXTRACT DATA ===
  const allHeadings = element.querySelectorAll('h1, h2, h3, [class*="font-bold"], [class*="font-extrabold"]');
  let monthYear = '';
  allHeadings.forEach(h => {
    const t = h.textContent.trim();
    if (t.match(/\d{4}/) || t.match(/January|February|March|April|May|June|July|August|September|October|November|December|জানুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর/)) {
      monthYear = t;
    }
  });
  
  const allTexts = Array.from(element.querySelectorAll('p, span, div')).map(e => e.textContent.trim()).filter(t => t.length > 0 && t.length < 100);
  const roomText = allTexts.find(t => t.includes('Room') || (t.includes('•') && !t.includes('Generated') && !t.includes('Per Person'))) || '';
  const room = roomText.split('•')[0]?.trim() || '';
  const userName = allTexts.find(t => t.length < 30 && (t.includes('Robin') || t.includes('Hossain'))) || '';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  const perPersonText = allTexts.find(t => t.includes('Per Person')) || '';
  const perPersonMatch = perPersonText.match(/৳([\d,]+)/);
  const perPersonUtility = perPersonMatch ? perPersonMatch[1] : '';
  
  // Extract 4 summary cards
  const extractCardValue = (labelPattern) => {
    const allEls = Array.from(element.querySelectorAll('*'));
    for (const el of allEls) {
      const text = el.textContent.trim();
      if (text === labelPattern || text.startsWith(labelPattern)) {
        const parent = el.closest('div');
        if (parent) {
          const valueEls = parent.querySelectorAll('p[class*="font"], span[class*="font"], p[class*="text-"], span[class*="text-"], p, span');
          for (const v of valueEls) {
            const val = v.textContent.trim();
            if (val.includes('৳') || val.includes('%')) return val;
          }
          const parentText = parent.textContent;
          const moneyMatch = parentText.match(/৳[\d,]+/);
          const percentMatch = parentText.match(/(\d+)%/);
          if (labelPattern.includes('Progress') && percentMatch) return percentMatch[1] + '%';
          if (moneyMatch) return moneyMatch[0];
        }
      }
    }
    for (const t of allTexts) {
      if (t.includes(labelPattern)) {
        const moneyMatch = t.match(/৳[\d,]+/g);
        const percentMatch = t.match(/(\d+)%/);
        if (labelPattern.includes('Progress') && percentMatch) return percentMatch[1] + '%';
        if (moneyMatch) return moneyMatch[moneyMatch.length - 1];
      }
    }
    return '';
  };
  
  const totalPayable = extractCardValue('Total Payable');
  const totalPaid = extractCardValue('Total Paid');
  const balance = extractCardValue('Balance');
  const progress = extractCardValue('Progress');
  
  // === EXTRACT TABLE DATA ===
  const billRows = [];
  const table = element.querySelector('table');
  
  // Try to get footer values from the live table's tfoot
  let footerShare = totalPayable || '';
  let footerPaid = totalPaid || '';
  let footerDue = '';
  let footerStatus = '';
  
  if (table) {
    // Extract regular rows (skip footer)
    const tbodyRows = table.querySelectorAll('tbody tr');
    tbodyRows.forEach((row, i) => {
      const cells = row.querySelectorAll('td, th');
      const data = Array.from(cells).map(c => c.textContent.trim());
      if (data.length >= 6) {
        const isPrevDue = data.some(d => d.includes('Previous') || d.includes('prev'));
        const isTotal = data.some(d => d.toLowerCase() === 'total');
        if (!isTotal) {
          billRows.push({
            sl: data[0] || String(i + 1),
            name: data[1] || '',
            totalCost: data[2] || '',
            share: data[3] || '',
            paid: data[4] || '',
            due: data[5] || '',
            status: data[6] || data[5] || '',
            isPrevDue
          });
        }
      }
    });
    
    // Get footer row data
    const tfootRow = table.querySelector('tfoot tr');
    if (tfootRow) {
      const footerCells = tfootRow.querySelectorAll('td, th');
      const footerData = Array.from(footerCells).map(c => c.textContent.trim());
      // Footer columns are: Total | Share | Paid | Due | Status
      if (footerData.length >= 4) {
        footerShare = footerData.find(d => d.includes('৳')) || footerData[1] || totalPayable;
        footerPaid = footerData.filter(d => d.includes('৳'))[1] || footerData[2] || totalPaid;
        footerDue = footerData.filter(d => d.includes('৳'))[2] || footerData[3] || '';
        footerStatus = footerData.find(d => ['Paid','Partial','Due','Advance','Pending'].includes(d)) || '';
      }
    }
  }
  
  // Calculate footer due if not found
  if (!footerDue) {
    const shareNum = parseInt((footerShare || '0').replace(/[^0-9]/g, ''));
    const paidNum = parseInt((footerPaid || '0').replace(/[^0-9]/g, ''));
    const diff = shareNum - paidNum;
    footerDue = diff > 0 ? '৳' + diff.toLocaleString() : '—';
  }
  
  // Separate previous due rows
  const prevDueRows = billRows.filter(r => r.isPrevDue);
  const normalRows = billRows.filter(r => !r.isPrevDue);
  
  const progressNum = parseInt(progress) || 0;
  const progressColor = progressNum >= 100 ? '#10b981,#059669' : progressNum >= 50 ? '#3b82f6,#2563eb' : '#f59e0b,#d97706';
  
  const buildBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('paid')) return '<span class="badge badge-paid">Paid</span>';
    if (s.includes('partial')) return '<span class="badge badge-partial">Partial</span>';
    if (s.includes('advance')) return '<span class="badge badge-advance">Advance</span>';
    return '<span class="badge badge-due">Due</span>';
  };
  
  const buildRow = (row, isPrev = false) => `
    <tr class="${isPrev ? 'prev-row' : ''}">
      <td class="c">${row.sl}</td>
      <td class="l fw">${(row.name || '').replace(/\(.*\)/, '')}</td>
      <td class="c">${row.totalCost || '—'}</td>
      <td class="c fw">${row.share || '—'}</td>
      <td class="c fw green">${row.paid || '—'}</td>
      <td class="c fw red">${row.due || '—'}</td>
      <td class="c">${buildBadge(row.status)}</td>
    </tr>`;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NestHub Statement</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f1f5f9;font-family:'Inter',sans-serif;padding:30px;display:flex;justify-content:center}
.statement{width:840px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.12)}
.header{background:linear-gradient(135deg,#0f172a,#1e293b,#1e3a5f);color:#fff;padding:28px 32px}
.header h1{font-size:20px;font-weight:900;color:#fff}
.header .sub{color:#94a3b8;font-size:12px;margin-top:4px}
.header .meta{text-align:right}
.header .ml{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:600}
.header .md{color:#cbd5e1;font-size:11px;margin-top:2px}
.header .mn{color:#fff;font-size:14px;font-weight:700;margin-top:4px}
.cards{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 12px;text-align:center}
.card .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:600;margin-bottom:4px}
.card .val{font-size:16px;font-weight:900}
.card.green{border-color:rgba(16,185,129,.3)}.card.green .val{color:#4ade80}
.card.red{border-color:rgba(239,68,68,.3)}.card.red .val{color:#f87171}
.card.blue{border-color:rgba(59,130,246,.3)}.card.blue .val{color:#93c5fd}
.progress-wrap{margin-top:12px}
.progress-top{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;font-weight:600;margin-bottom:4px}
.progress-bar{height:8px;background:rgba(255,255,255,.1);border-radius:10px;overflow:hidden}
.progress-fill{height:100%;border-radius:10px;background:linear-gradient(90deg,${progressColor})}
.section{padding:0 24px;background:#fff}
.section-head{display:flex;align-items:center;justify-content:space-between;padding:18px 0 10px;border-bottom:2px solid #f1f5f9}
.section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#334155}
.section-badge{font-size:10px;color:#64748b;font-weight:500;background:#f1f5f9;padding:4px 12px;border-radius:20px}
.table-wrap{padding:8px 0 16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;background:#f8fafc;padding:11px 14px;border-bottom:2px solid #e2e8f0}
th:nth-child(1){text-align:center;width:30px;border-radius:8px 0 0 0}
th:nth-child(2){text-align:left}
th:nth-child(3){text-align:center;width:90px}
th:nth-child(4){text-align:center;width:90px}
th:nth-child(5){text-align:center;width:90px}
th:nth-child(6){text-align:center;width:90px}
th:nth-child(7){text-align:center;width:85px;border-radius:0 8px 0 0}
.c{text-align:center;padding:10px 14px;font-size:11px;color:#334155}
.l{text-align:left;padding:10px 14px;font-size:12px}
.fw{font-weight:700}.green{color:#059669}.red{color:#dc2626}
tr.prev-row td{color:#c2410c!important;font-weight:600!important;background:#fff7ed!important}
td{border-bottom:1px solid #f1f5f9}
tfoot td{font-weight:900!important;font-size:12px!important;background:#f1f5f9!important;border-top:2px solid #d1d5db!important;border-bottom:none!important;padding:12px 14px!important}
tfoot td:first-child{text-align:left!important}
tfoot td:not(:first-child){text-align:center!important}
.badge{display:inline-flex;align-items:center;padding:5px 12px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
.badge-paid{background:#d1fae5;color:#065f46;border:1px solid #6ee7b7}
.badge-partial{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}
.badge-due{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.badge-advance{background:#dbeafe;color:#1e40af;border:1px solid #93c5fd}
.footer{text-align:center;padding:14px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}
.footer b{color:#64748b}
</style>
</head>
<body>
<div class="statement">
<div class="header">
<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
<div>
<h1>NestHub Monthly Statement</h1>
<p class="sub">${monthYear}${room ? ' • ' + room : ''}</p>
</div>
<div class="meta">
<p class="ml">Generated</p>
<p class="md">${today}</p>
${userName ? '<p class="mn">' + userName + '</p>' : ''}
</div>
</div>
<div class="cards">
<div class="card"><div class="lbl">Total Payable</div><div class="val" style="color:#fff">${totalPayable || '৳0'}</div></div>
<div class="card green"><div class="lbl">Total Paid</div><div class="val">${totalPaid || '৳0'}</div></div>
<div class="card ${(balance||'').includes('Due')?'red':(balance||'').includes('Adv')?'blue':''}"><div class="lbl">Balance</div><div class="val">${balance || '—'}</div></div>
<div class="card"><div class="lbl">Progress</div><div class="val" style="color:${progressNum>=100?'#4ade80':progressNum>=50?'#60a5fa':'#fbbf24'}">${progress || '0%'}</div></div>
</div>
${progress ? `
<div class="progress-wrap">
<div class="progress-top"><span>Payment Progress</span><span style="color:#fff;font-weight:700">${progress}</span></div>
<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(progressNum,100)}%"></div></div>
</div>` : ''}
</div>
<div class="section">
<div class="section-head">
<div class="section-title">📋 House Expense Breakdown</div>
<div class="section-badge">Per Person: ৳${perPersonUtility}</div>
</div>
<div class="table-wrap">
<table>
<thead><tr><th>#</th><th>Expense</th><th>Total</th><th>Share</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
<tbody>
${prevDueRows.map(r => buildRow(r, true)).join('')}
${normalRows.map(r => buildRow(r)).join('')}
${normalRows.length === 0 && prevDueRows.length === 0 ? '<tr><td colspan="7" class="c" style="padding:20px;color:#94a3b8">No data found</td></tr>' : ''}
</tbody>
<tfoot>
<tr>
<td colspan="3" style="text-align:left;font-weight:900;font-size:12px;background:#f1f5f9;padding:12px 14px;border-top:2px solid #d1d5db">Total</td>
<td style="text-align:center;font-weight:900;font-size:12px;background:#f1f5f9;padding:12px 14px;border-top:2px solid #d1d5db">${footerShare}</td>
<td style="text-align:center;font-weight:900;font-size:12px;color:#059669;background:#f1f5f9;padding:12px 14px;border-top:2px solid #d1d5db">${footerPaid}</td>
<td style="text-align:center;font-weight:900;font-size:12px;color:#dc2626;background:#f1f5f9;padding:12px 14px;border-top:2px solid #d1d5db">${footerDue}</td>
<td style="text-align:center;background:#f1f5f9;padding:12px 14px;border-top:2px solid #d1d5db">${buildBadge(footerStatus)}</td>
</tr>
</tfoot>
</table>
</div>
</div>
<div class="footer"><b>NestHub</b> Meal Management System • Generated ${today}</div>
</div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:1200px;z-index:99999;border:none;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);
  
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    const canvas = await html2canvas(doc.body, {
      scale,
      backgroundColor: '#f1f5f9',
      useCORS: true,
      logging: false,
      allowTaint: true,
      width: 900,
      height: doc.body.scrollHeight,
    });
    return canvas;
  } finally {
    document.body.removeChild(iframe);
  }
}