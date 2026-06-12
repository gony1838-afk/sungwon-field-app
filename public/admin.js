const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

let dailyItems = [];
let defectItems = [];
let currentDefectReport = null;
let partMaster = [];

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setStatus(text, type = "") {
  const el = qs("#adminStatus");
  if (!el) return;
  el.textContent = text;
  el.className = `status ${type}`.trim();
}

function buildQuery() {
  const query = new URLSearchParams();
  const date = qs("#filterDate").value;
  const line = qs("#filterLine").value.trim();
  const shift = qs("#filterShift").value;
  const partNo = qs("#filterPart").value.trim();
  if (date) query.set("date", date);
  if (line) query.set("line", line);
  if (shift) query.set("shift", shift);
  if (partNo) query.set("partNo", partNo);
  return query.toString();
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "저장 실패");
  return json;
}

async function loadData() {
  setStatus("조회 중...");
  const query = buildQuery();
  const [dailyRes, defectRes, partRes] = await Promise.all([
    fetch(`/api/daily?${query}`),
    fetch(`/api/defects?${query}`),
    fetch("/api/parts")
  ]);
  dailyItems = (await dailyRes.json()).items || [];
  defectItems = (await defectRes.json()).items || [];
  partMaster = (await partRes.json()).items || [];
  currentDefectReport = defectItems.find(item => item.defectDate === qs("#filterDate").value) || null;
  renderAll();
  setStatus(`조회 완료: 작업일보 ${dailyItems.length}건, 불량일보 ${defectItems.length}건`, "ok");
}

function flatDailyRows() {
  return dailyItems.flatMap(item => (item.rows || []).map((row, index) => ({
    dailyId: item.id,
    rowIndex: index,
    productionDate: item.productionDate,
    writer: item.writer,
    line: item.line,
    lineType: item.lineType,
    mctBedCount: item.mctBedCount,
    shift: item.shift,
    updatedAt: item.updatedAt,
    ...row
  })));
}

function numberInput(name, value) {
  return `<input class="cell-input qty-input" name="${name}" type="number" min="0" step="1" inputmode="numeric" value="${number(value)}">`;
}

function textInput(name, value) {
  return `<input class="cell-input" name="${name}" value="${String(value ?? "").replaceAll('"', "&quot;")}">`;
}

function productionQty(row) {
  return number(row.goodQty) + number(row.rawDefectQty) + number(row.reworkQty) + number(row.scrapQty);
}

function workerDefectQty(row) {
  return number(row.rawDefectQty) + number(row.reworkQty) + number(row.scrapQty);
}

function qcDefectQty(row) {
  return number(row.qcRawDefectQty) + number(row.qcReworkQty) + number(row.qcScrapQty);
}

function workerPpmDefectQty(row) {
  return number(row.reworkQty) + number(row.scrapQty);
}

function qcPpmDefectQty(row) {
  return number(row.qcReworkQty) + number(row.qcScrapQty);
}

function ppm(defects, production) {
  return production > 0 ? Math.round((defects / production) * 1_000_000) : 0;
}

function lineTypeLabel(value) {
  if (value === "cncManual" || value === "manual") return "CNC 수동";
  if (value === "cncAuto" || value === "auto" || value === "CNC") return "CNC 자동";
  if (value === "MCT") return "MCT";
  return value || "";
}

function isKnownPart(partNo) {
  if (!partNo) return true;
  return partMaster.includes(partNo);
}

function partWarning(partNo) {
  return isKnownPart(partNo) ? "" : `<div class="part-warning">미등록 품번</div>`;
}

function defectKey(row) {
  return `${row.sourceDailyId || row.dailyId || ""}:${row.sourceRowIndex ?? row.rowIndex ?? ""}:${row.partNo || ""}`;
}

function savedDefectMap() {
  const map = new Map();
  (currentDefectReport?.rows || []).forEach(row => map.set(defectKey(row), row));
  return map;
}

function buildDefectRows() {
  const saved = savedDefectMap();
  return flatDailyRows()
    .filter(row => productionQty(row) > 0 || workerDefectQty(row) > 0 || row.defectDetail)
    .map(row => {
      const base = {
        sourceDailyId: row.dailyId,
        sourceRowIndex: row.rowIndex,
        productionDate: row.productionDate,
        machine: row.line,
        shift: row.shift === "야간" ? "야간" : "주간",
        worker: row.worker,
        partNo: row.partNo,
        productionQty: productionQty(row),
        rawDefectQty: number(row.rawDefectQty),
        reworkQty: number(row.reworkQty),
        scrapQty: number(row.scrapQty),
        qcRawDefectQty: 0,
        qcReworkQty: 0,
        qcScrapQty: 0,
        defectDetail: row.defectDetail,
        qcMemo: ""
      };
      const savedRow = saved.get(defectKey(base)) || {};
      return { ...base, ...savedRow, rawDefectQty: base.rawDefectQty, reworkQty: base.reworkQty, scrapQty: base.scrapQty };
    });
}

function renderSummary() {
  const rows = buildDefectRows();
  const production = rows.reduce((sum, row) => sum + number(row.productionQty), 0);
  const workerDefects = rows.reduce((sum, row) => sum + workerDefectQty(row), 0);
  const qcDefects = rows.reduce((sum, row) => sum + qcDefectQty(row), 0);
  const finalDefects = qcDefects ? rows.reduce((sum, row) => sum + qcPpmDefectQty(row), 0) : rows.reduce((sum, row) => sum + workerPpmDefectQty(row), 0);
  qs("#summary").innerHTML = `
    <div class="metric"><span>작업일보</span><strong>${dailyItems.length}</strong></div>
    <div class="metric"><span>생산수량</span><strong>${production.toLocaleString()}</strong></div>
    <div class="metric"><span>작업자 입력 불량</span><strong>${workerDefects.toLocaleString()}</strong></div>
    <div class="metric"><span>최종 PPM</span><strong>${ppm(finalDefects, production).toLocaleString()}</strong></div>
  `;
}

function renderDefects() {
  const rows = buildDefectRows();
  const body = rows.map((row, index) => {
    const finalDefects = qcDefectQty(row) ? qcPpmDefectQty(row) : workerPpmDefectQty(row);
    return `
      <tr data-defect-index="${index}">
        <td>${row.productionDate || ""}</td>
        <td>${row.machine || ""}</td>
        <td>${row.shift || ""}</td>
        <td>${row.worker || ""}</td>
        <td class="${isKnownPart(row.partNo) ? "" : "part-error"}">${row.partNo || ""}${partWarning(row.partNo)}</td>
        <td>${number(row.productionQty).toLocaleString()}</td>
        <td>${numberInput("rawDefectQty", row.rawDefectQty)}</td>
        <td>${numberInput("reworkQty", row.reworkQty)}</td>
        <td>${numberInput("scrapQty", row.scrapQty)}</td>
        <td>${numberInput("qcRawDefectQty", row.qcRawDefectQty)}</td>
        <td>${numberInput("qcReworkQty", row.qcReworkQty)}</td>
        <td>${numberInput("qcScrapQty", row.qcScrapQty)}</td>
        <td>${textInput("defectDetail", row.defectDetail)}</td>
        <td>${textInput("qcMemo", row.qcMemo)}</td>
        <td>${ppm(finalDefects, number(row.productionQty)).toLocaleString()}</td>
      </tr>
    `;
  }).join("");
  const dayRows = rows.filter(row => row.shift === "주간");
  const nightRows = rows.filter(row => row.shift === "야간");
  qs("#defectTableBody").innerHTML = body + renderSubtotal("(주간) 소계", dayRows) + renderSubtotal("(야간) 소계", nightRows) + renderSubtotal("합계", rows);
}

function renderSubtotal(label, rows) {
  const production = rows.reduce((sum, row) => sum + number(row.productionQty), 0);
  const worker = rows.reduce((sum, row) => sum + workerDefectQty(row), 0);
  const qc = rows.reduce((sum, row) => sum + qcDefectQty(row), 0);
  const workerPpm = rows.reduce((sum, row) => sum + workerPpmDefectQty(row), 0);
  const qcPpm = rows.reduce((sum, row) => sum + qcPpmDefectQty(row), 0);
  return `
    <tr class="subtotal-row">
      <td colspan="5">${label}</td>
      <td>${production.toLocaleString()}</td>
      <td colspan="3">작업자 ${worker.toLocaleString()}</td>
      <td colspan="3">QC ${qc.toLocaleString()}</td>
      <td>불량률(PPM) :</td>
      <td colspan="2">${ppm(qc ? qcPpm : workerPpm, production).toLocaleString()}</td>
    </tr>
  `;
}

function renderDaily() {
  qs("#dailyTableBody").innerHTML = flatDailyRows().map(row => `
    <tr data-daily-id="${row.dailyId}" data-row-index="${row.rowIndex}">
      <td>${row.productionDate || ""}</td>
      <td>${row.line || ""}</td>
      <td>${row.shift || ""}</td>
      <td>${lineTypeLabel(row.lineType)}</td>
      <td>${row.lineType === "MCT" ? `${row.mctBedCount || ""}베드` : ""}</td>
      <td>${row.writer || ""}</td>
      <td>${row.worker || ""}</td>
      <td class="${isKnownPart(row.partNo) ? "" : "part-error"}">${row.partNo || ""}${partWarning(row.partNo)}</td>
      <td>${row.cycleTime || ""}</td>
      <td>${row.workHours || ""}</td>
      <td>${numberInput("goodQty", row.goodQty)}</td>
      <td>${numberInput("rawDefectQty", row.rawDefectQty)}</td>
      <td>${numberInput("reworkQty", row.reworkQty)}</td>
      <td>${numberInput("scrapQty", row.scrapQty)}</td>
      <td>${row.achievementRate || ""}</td>
      <td>${row.lotNo || ""}</td>
      <td>${textInput("defectDetail", row.defectDetail)}</td>
      <td>${row.downtime || ""}</td>
      <td>${row.note || ""}</td>
    </tr>
  `).join("");
}

function readDefectRowsFromTable() {
  const baseRows = buildDefectRows();
  return qsa("tr[data-defect-index]").map(tr => {
    const row = baseRows[Number(tr.dataset.defectIndex)];
    return {
      ...row,
      rawDefectQty: number(qs("[name='rawDefectQty']", tr).value),
      reworkQty: number(qs("[name='reworkQty']", tr).value),
      scrapQty: number(qs("[name='scrapQty']", tr).value),
      qcRawDefectQty: number(qs("[name='qcRawDefectQty']", tr).value),
      qcReworkQty: number(qs("[name='qcReworkQty']", tr).value),
      qcScrapQty: number(qs("[name='qcScrapQty']", tr).value),
      defectDetail: qs("[name='defectDetail']", tr).value,
      qcMemo: qs("[name='qcMemo']", tr).value
    };
  });
}

async function saveQcCorrections() {
  try {
    setStatus("QC 수정 저장 중...");
    const rows = readDefectRowsFromTable();
    const hasQc = rows.some(row => qcDefectQty(row) > 0 || row.qcMemo);
    const payload = {
      id: currentDefectReport?.id,
      defectDate: qs("#filterDate").value,
      qcName: qs("#qcName").value,
      status: hasQc ? "QC수정" : "자동취합",
      rows
    };
    const saved = await postJson("/api/defects", payload);
    currentDefectReport = saved.item;
    await loadData();
    setStatus("QC 수정 저장 완료", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function applyDailyCorrectionsToMemory() {
  qsa("tr[data-daily-id]").forEach(tr => {
    const item = dailyItems.find(report => report.id === tr.dataset.dailyId);
    const row = item?.rows?.[Number(tr.dataset.rowIndex)];
    if (!row) return;
    row.goodQty = number(qs("[name='goodQty']", tr).value);
    row.rawDefectQty = number(qs("[name='rawDefectQty']", tr).value);
    row.reworkQty = number(qs("[name='reworkQty']", tr).value);
    row.scrapQty = number(qs("[name='scrapQty']", tr).value);
    row.defectDetail = qs("[name='defectDetail']", tr).value;
  });
}

async function saveDailyCorrections() {
  try {
    setStatus("작업일보 수정 저장 중...");
    applyDailyCorrectionsToMemory();
    await Promise.all(dailyItems.map(item => postJson("/api/daily", item)));
    await loadData();
    setStatus("작업일보 수정 저장 완료", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function exportErp() {
  const defectRows = readDefectRowsFromTable();
  const dailyRows = flatDailyRows();
  const rows = [
    ["구분", "생산일자", "라인/작업호기", "라인구분", "MCT베드", "주/야", "작업자", "품번", "품번확인", "생산수량", "양품수량", "원재료불량", "수정불량", "폐기불량", "QC원재료", "QC수정", "QC폐기", "불량내역", "QC메모", "불량률(PPM)"],
    ...dailyRows.map(row => ["작업일보", row.productionDate, row.line, lineTypeLabel(row.lineType), row.lineType === "MCT" ? row.mctBedCount : "", row.shift, row.worker, row.partNo, isKnownPart(row.partNo) ? "OK" : "미등록", productionQty(row), row.goodQty, row.rawDefectQty, row.reworkQty, row.scrapQty, "", "", "", row.defectDetail, "", ""]),
    ...defectRows.map(row => {
      const finalDefects = qcDefectQty(row) || workerDefectQty(row);
      return ["불량일보", row.productionDate, row.machine, "", "", row.shift, row.worker, row.partNo, isKnownPart(row.partNo) ? "OK" : "미등록", row.productionQty, "", row.rawDefectQty, row.reworkQty, row.scrapQty, row.qcRawDefectQty, row.qcReworkQty, row.qcScrapQty, row.defectDetail, row.qcMemo, ppm(finalDefects, row.productionQty)];
    })
  ];
  downloadCsv(`ERP_등록자료_${qs("#filterDate").value || today()}.csv`, rows);
}

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayShift(value) {
  const text = String(value || "");
  return text.includes("야") ? "야간" : "주간";
}

function finalRawDefect(row) {
  return qcDefectQty(row) > 0 ? number(row.qcRawDefectQty) : number(row.rawDefectQty);
}

function finalRework(row) {
  return qcDefectQty(row) > 0 ? number(row.qcReworkQty) : number(row.reworkQty);
}

function finalScrap(row) {
  return qcDefectQty(row) > 0 ? number(row.qcScrapQty) : number(row.scrapQty);
}

function finalDefectTotal(row) {
  return finalRework(row) + finalScrap(row);
}

function blankRows(count, colSpan) {
  return Array.from({ length: count }, () => `<tr>${Array.from({ length: colSpan }, () => "<td>&nbsp;</td>").join("")}</tr>`).join("");
}

function printSubtotal(label, rows) {
  const production = rows.reduce((sum, row) => sum + number(row.productionQty), 0);
  const raw = rows.reduce((sum, row) => sum + finalRawDefect(row), 0);
  const rework = rows.reduce((sum, row) => sum + finalRework(row), 0);
  const scrap = rows.reduce((sum, row) => sum + finalScrap(row), 0);
  return `
    <tr class="print-subtotal">
      <td colspan="4">${label}</td>
      <td>${production.toLocaleString()}</td>
      <td>${raw.toLocaleString()}</td>
      <td>${rework.toLocaleString()}</td>
      <td>${scrap.toLocaleString()}</td>
      <td colspan="2">불량률(PPM) :</td>
      <td>${ppm(raw + rework + scrap, production).toLocaleString()}</td>
    </tr>
  `;
}

function renderPrintSheets() {
  applyDailyCorrectionsToMemory();
  const date = qs("#filterDate").value || today();
  const dailyRows = flatDailyRows();
  const defectRows = readDefectRowsFromTable();
  const dayDefects = defectRows.filter(row => displayShift(row.shift) === "주간");
  const nightDefects = defectRows.filter(row => displayShift(row.shift) === "야간");
  const dailyBody = dailyRows.map(row => `
    <tr>
      <td>${html(row.line)}</td>
      <td>${html(row.worker || row.writer)}</td>
      <td>${html(row.partNo)}</td>
      <td>${html(row.cycleTime)}</td>
      <td>${html(row.workHours)}</td>
      <td>${number(row.goodQty).toLocaleString()}</td>
      <td>${number(row.rawDefectQty).toLocaleString()}</td>
      <td>${number(row.reworkQty).toLocaleString()}</td>
      <td>${number(row.scrapQty).toLocaleString()}</td>
      <td>${html(row.achievementRate)}</td>
      <td>${html(row.lotNo)}</td>
      <td>${html(row.defectDetail)}</td>
      <td>${html(row.downtime)}</td>
      <td>${html(row.note)}</td>
    </tr>
  `).join("");
  const defectBody = defectRows.map(row => `
    <tr>
      <td>${html(row.machine)}</td>
      <td>${html(row.worker)}</td>
      <td>${html(row.partNo)}</td>
      <td>${number(row.productionQty).toLocaleString()}</td>
      <td>${finalRawDefect(row).toLocaleString()}</td>
      <td>${finalRework(row).toLocaleString()}</td>
      <td>${finalScrap(row).toLocaleString()}</td>
      <td>${html(row.defectDetail)}</td>
      <td>${html(row.qcMemo)}</td>
      <td>${displayShift(row.shift)}</td>
      <td>${ppm(finalDefectTotal(row), number(row.productionQty)).toLocaleString()}</td>
    </tr>
  `).join("");

  qs("#printSheets").innerHTML = `
    <article class="print-sheet">
      <div class="print-title-row">
        <div class="print-logo">SUNG WON</div>
        <h1>작 업 일 보</h1>
        <table class="approval-table"><tr><th>작성</th><th>품질</th><th>승인</th></tr><tr><td></td><td></td><td></td></tr></table>
      </div>
      <div class="print-meta">생산일자 : ${html(date)} <span>※ 결근/지각/조퇴/연차 기록요망</span></div>
      <table class="print-table daily-print-table">
        <thead>
          <tr>
            <th rowspan="2">라인</th><th rowspan="2">성명</th><th rowspan="2">품번</th><th rowspan="2">C/T</th><th rowspan="2">작업시간</th><th rowspan="2">양품수량</th>
            <th colspan="3">불량 구분</th><th rowspan="2">성취율</th><th rowspan="2">LOT NO.</th><th rowspan="2">불량내용</th><th rowspan="2">비가동 내역</th><th rowspan="2">비고</th>
          </tr>
          <tr><th>원소재</th><th>수정</th><th>폐기</th></tr>
        </thead>
        <tbody>${dailyBody}${blankRows(Math.max(0, 12 - dailyRows.length), 14)}</tbody>
      </table>
    </article>
    <article class="print-sheet">
      <div class="print-title-row">
        <div class="print-logo">SUNG WON</div>
        <h1>[ 불 량 일 보 ]</h1>
        <table class="approval-table"><tr><th>작성</th><th>품질</th><th>검토</th><th>승인</th></tr><tr><td></td><td></td><td></td><td></td></tr></table>
      </div>
      <div class="print-meta">생산일자 : ${html(date)} <span>QC 수정 수량 기준</span></div>
      <table class="print-table defect-print-table">
        <thead>
          <tr>
            <th rowspan="2">작업호기</th><th rowspan="2">작업자</th><th rowspan="2">품번</th><th rowspan="2">생산수량</th>
            <th colspan="3">QC 검토</th><th rowspan="2">불량 내역</th><th rowspan="2">QC 메모</th><th rowspan="2">주야</th><th rowspan="2">불량률(PPM)</th>
          </tr>
          <tr><th>원재료</th><th>수정</th><th>폐기</th></tr>
        </thead>
        <tbody>
          ${defectBody}
          ${blankRows(Math.max(0, 12 - defectRows.length), 11)}
          ${printSubtotal("(주간) 소계", dayDefects)}
          ${printSubtotal("(야간) 소계", nightDefects)}
          ${printSubtotal("합계", defectRows)}
        </tbody>
      </table>
    </article>
  `;
}

function printAdminSheets() {
  renderPrintSheets();
  window.print();
}

function renderAll() {
  if (currentDefectReport) {
    qs("#qcName").value = currentDefectReport.qcName || qs("#qcName").value;
  }
  renderSummary();
  renderDefects();
  renderDaily();
}

function ensureUnlocked() {
  if (sessionStorage.getItem("sungwonAdminUnlocked") !== "1") {
    window.location.replace("/admin.html");
    return false;
  }
  return true;
}

function logoutAdmin() {
  sessionStorage.removeItem("sungwonAdminUnlocked");
  window.location.href = "/admin.html";
}

function init() {
  if (!ensureUnlocked()) return;
  qs("#filterDate").value = today();
  qs("#loadData").addEventListener("click", loadData);
  qs("#saveQcCorrections").addEventListener("click", saveQcCorrections);
  qs("#saveDailyCorrections").addEventListener("click", saveDailyCorrections);
  qs("#exportErp").addEventListener("click", exportErp);
  qs("#printAdmin")?.addEventListener("click", printAdminSheets);
  qs("#adminLogout").addEventListener("click", logoutAdmin);
  qsa("[data-auto-load]").forEach(input => input.addEventListener("change", loadData));
  document.addEventListener("input", event => {
    if (event.target.matches(".qty-input") && Number(event.target.value) < 0) event.target.value = 0;
  });
  loadData().catch(error => setStatus(error.message, "error"));
}

init();
