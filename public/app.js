const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const dailyRows = document.querySelector("#dailyRows");
const saveState = document.querySelector("#saveState");
let partMaster = [];
let partRecords = [];
let machineRecords = [];
let workerRecords = [];
let currentLang = "ko";

const i18n = {
  ko: {
    dailyTitle: "작업일보 입력",
    dailyTab: "작업일보",
    waiting: "저장 대기 중",
    productionDate: "생산일자",
    writer: "작성자",
    line: "라인",
    lineType: "라인구분",
    mctBedCount: "MCT 베드 수",
    shift: "주/야",
    workerName: "작업자",
    partNo: "품번",
    cycleTime: "C/T(초/개)",
    workHours: "작업시간",
    goodQty: "양품수량",
    rawDefectQty: "원재료 불량",
    reworkQty: "수정 불량",
    scrapQty: "폐기 불량",
    defectPpm: "불량 PPM",
    achievementRate: "성취율",
    lotNo: "LOT NO.",
    note: "비고",
    defectDetail: "불량내용",
    downtime: "비가동 내역",
    unknownPart: "미등록 품번",
    savingDaily: "작업일보 저장 중...",
    savedDaily: "작업일보 저장 완료",
  },
  vi: {
    dailyTitle: "Nhập nhật báo sản xuất",
    dailyTab: "Nhật báo",
    waiting: "Đang chờ lưu",
    productionDate: "Ngày sản xuất",
    writer: "Người ghi",
    line: "Chuyền/Máy",
    lineType: "Loại chuyền",
    mctBedCount: "Số bàn MCT",
    shift: "Ca ngày/đêm",
    workerName: "Công nhân",
    partNo: "Mã hàng",
    cycleTime: "C/T(giây/cái)",
    workHours: "Thời gian làm",
    goodQty: "Số lượng đạt",
    rawDefectQty: "Lỗi vật liệu",
    reworkQty: "Lỗi sửa",
    scrapQty: "Lỗi bỏ",
    defectPpm: "PPM lỗi",
    achievementRate: "Tỷ lệ đạt",
    lotNo: "LOT NO.",
    note: "Ghi chú",
    defectDetail: "Nội dung lỗi",
    downtime: "Nội dung dừng máy",
    unknownPart: "Mã hàng chưa đăng ký",
    savingDaily: "Đang lưu nhật báo...",
    savedDaily: "Đã lưu nhật báo",
  }
};

function t(key) {
  return i18n[currentLang][key] || i18n.ko[key] || key;
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function setStatus(text, type = "") {
  saveState.textContent = text;
  saveState.className = `status ${type}`.trim();
}

function numberValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

function findPart(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  return partRecords.find(part => part.partNo === key) || null;
}

function searchParts(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key.length < 2) return [];
  return partRecords
    .filter(part => {
      const partNo = String(part.partNo || "").toLowerCase();
      const partName = String(part.partName || "").toLowerCase();
      return partNo.includes(key) || partName.includes(key);
    })
    .slice(0, 12);
}

function findMachine(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  return machineRecords.find(machine => machine.machineName === key || machine.machineCode === key) || null;
}

function findWorker(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  return workerRecords.find(worker => worker.workerName === key || worker.workerId === key) || null;
}

function option(value, label = "") {
  const safeValue = String(value || "").replaceAll('"', "&quot;");
  const safeLabel = String(label || "").replaceAll('"', "&quot;");
  return `<option value="${safeValue}" label="${safeLabel}"></option>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function upsertDatalist(id, options) {
  let list = qs(`#${id}`);
  if (!list) {
    list = document.createElement("datalist");
    list.id = id;
    document.body.appendChild(list);
  }
  list.innerHTML = options.join("");
}

function createDailyRow(index) {
  const div = document.createElement("div");
  div.className = "entry-row";
  div.innerHTML = `
    <h3>작업 ${index + 1}</h3>
    <div class="grid">
      <label class="field"><span data-i18n="workerName">${t("workerName")}</span><input name="worker" list="workerMasterList" required></label>
      <label class="field part-search-field"><span data-i18n="partNo">${t("partNo")}</span><input name="partNo" autocomplete="off" required><div class="match-list" data-part-suggestions></div><span class="part-warning" data-part-warning></span></label>
      <label class="field"><span>품명</span><input name="partName" readonly></label>
      <label class="field"><span data-i18n="cycleTime">${t("cycleTime")}</span><input name="cycleTime" type="number" min="0" step="any" inputmode="decimal"></label>
      <label class="field"><span data-i18n="workHours">${t("workHours")}</span><input name="workHours" type="number" min="0" step="any" inputmode="decimal"></label>
      <label class="field"><span data-i18n="goodQty">${t("goodQty")}</span><input name="goodQty" type="number" min="0" step="1" inputmode="numeric"></label>
      <label class="field"><span data-i18n="rawDefectQty">${t("rawDefectQty")}</span><input name="rawDefectQty" type="number" min="0" step="1" inputmode="numeric"></label>
      <label class="field"><span data-i18n="reworkQty">${t("reworkQty")}</span><input name="reworkQty" type="number" min="0" step="1" inputmode="numeric"></label>
      <label class="field"><span data-i18n="scrapQty">${t("scrapQty")}</span><input name="scrapQty" type="number" min="0" step="1" inputmode="numeric"></label>
      <label class="field"><span>미가공 원재료</span><input name="unprocessedRawQty" type="number" min="0" step="1" inputmode="numeric"></label>
      <label class="field"><span data-i18n="achievementRate">${t("achievementRate")}</span><input name="achievementRate" readonly></label>
      <label class="field"><span data-i18n="defectPpm">${t("defectPpm")}</span><input name="defectPpm" readonly></label>
      <label class="field"><span data-i18n="lotNo">${t("lotNo")}</span><input name="lotNo"></label>
      <label class="field"><span data-i18n="note">${t("note")}</span><input name="note"></label>
      <label class="field"><span data-i18n="defectDetail">${t("defectDetail")}</span><textarea name="defectDetail"></textarea></label>
      <label class="field"><span data-i18n="downtime">${t("downtime")}</span><textarea name="downtime"></textarea></label>
    </div>
  `;
  div.addEventListener("input", event => {
    if (event.target.type === "number" && Number(event.target.value) < 0) event.target.value = 0;
    if (event.target.name === "partNo") {
      renderPartSuggestions(div);
      applyPartSelection(div);
    }
    updateAchievement(div);
  });
  div.addEventListener("click", event => {
    const button = event.target.closest("[data-part-value]");
    if (!button) return;
    qs("[name='partNo']", div).value = button.dataset.partValue;
    qs("[data-part-suggestions]", div).innerHTML = "";
    applyPartSelection(div);
    updateAchievement(div);
  });
  const writer = qs("#dailyWriter")?.value.trim();
  if (writer) qs("[name='worker']", div).value = writer;
  return div;
}

function applyPartSelection(row) {
  const input = qs("[name='partNo']", row);
  const part = findPart(input.value);
  qs("[name='partName']", row).value = part?.partName || "";
  const cycleInput = qs("[name='cycleTime']", row);
  if (part?.standardCt && !numberValue(cycleInput.value)) {
    cycleInput.value = part.standardCt;
  }
  updatePartWarning(row);
}

function renderPartSuggestions(row) {
  const input = qs("[name='partNo']", row);
  const box = qs("[data-part-suggestions]", row);
  const matches = searchParts(input.value);
  if (!matches.length || findPart(input.value)) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = matches.map(part => `
    <button type="button" class="match-item" data-part-value="${escapeHtml(part.partNo)}">
      <strong>${escapeHtml(part.partNo)}</strong>
      <span>${escapeHtml(part.partName || "")}</span>
    </button>
  `).join("");
}

function syncWorkersFromWriter() {
  const writer = qs("#dailyWriter").value.trim();
  qsa(".entry-row", dailyRows).forEach(row => {
    qs("[name='worker']", row).value = writer;
  });
}

function updatePartWarning(row) {
  const input = qs("[name='partNo']", row);
  const warning = qs("[data-part-warning]", row);
  const isKnown = !input.value || partMaster.includes(input.value.trim());
  warning.textContent = isKnown ? "" : t("unknownPart");
  input.classList.toggle("input-warning", !isKnown);
}

function updateAchievement(row) {
  const cycle = numberValue(qs("[name='cycleTime']", row).value);
  const hours = numberValue(qs("[name='workHours']", row).value);
  const good = numberValue(qs("[name='goodQty']", row).value);
  const rateFactor = operationRate(cycle, qs("#lineType").value, qs("#mctBedCount").value);
  const output = cycle > 0 ? ((hours * 3600) / cycle) * rateFactor : 0;
  const rate = output > 0 ? (good / output) * 100 : 0;
  qs("[name='achievementRate']", row).value = rate ? `${rate.toFixed(1)}%` : "";
  updateDefectPpm(row);
}

function updateDefectPpm(row) {
  const good = numberValue(qs("[name='goodQty']", row).value);
  const raw = numberValue(qs("[name='rawDefectQty']", row).value);
  const rework = numberValue(qs("[name='reworkQty']", row).value);
  const scrap = numberValue(qs("[name='scrapQty']", row).value);
  const production = good + raw + rework + scrap;
  const ppmDefects = rework + scrap;
  const ppm = production > 0 ? Math.round((ppmDefects / production) * 1_000_000) : 0;
  qs("[name='defectPpm']", row).value = ppm ? ppm.toLocaleString() : "";
}

function operationRate(cycle, lineType, mctBedCount) {
  if (lineType === "cncAuto" || lineType === "auto" || lineType === "CNC") return 1;
  if (lineType === "MCT") return mctBedCount === "1" ? 0.8 : 1;
  if (lineType !== "cncManual" && lineType !== "manual") return 1;
  if (cycle <= 15) return 0.5;
  if (cycle <= 20) return 0.6;
  if (cycle <= 25) return 0.7;
  if (cycle <= 30) return 0.8;
  if (cycle <= 60) return 0.85;
  if (cycle <= 180) return 0.9;
  return 1;
}

function refreshAchievements() {
  qsa(".entry-row", dailyRows).forEach(updateAchievement);
}

function updateLineOptions() {
  const isMct = qs("#lineType").value === "MCT";
  qs("#mctBedField").style.display = isMct ? "" : "none";
  refreshAchievements();
}

function addDailyRow() {
  dailyRows.appendChild(createDailyRow(dailyRows.children.length));
}

function collectDaily() {
  const machine = findMachine(qs("#dailyLine").value);
  return {
    productionDate: qs("#productionDate").value,
    writer: qs("#dailyWriter").value,
    line: machine?.machineName || qs("#dailyLine").value,
    machineCode: machine?.machineCode || "",
    machineName: machine?.machineName || qs("#dailyLine").value,
    lineType: qs("#lineType").value,
    mctBedCount: qs("#lineType").value === "MCT" ? qs("#mctBedCount").value : "",
    shift: qs("#dailyShift").value,
    rows: qsa(".entry-row", dailyRows).map(row => {
      const worker = findWorker(qs("[name='worker']", row).value);
      const part = findPart(qs("[name='partNo']", row).value);
      return {
        worker: worker?.workerName || qs("[name='worker']", row).value,
        workerId: worker?.workerId || "",
        workerName: worker?.workerName || qs("[name='worker']", row).value,
        partNo: qs("[name='partNo']", row).value,
        partName: part?.partName || qs("[name='partName']", row).value,
        lc: part?.lc || "",
        materialPartNo: part?.materialPartNo || "",
        cycleTime: numberValue(qs("[name='cycleTime']", row).value),
        workHours: numberValue(qs("[name='workHours']", row).value),
        goodQty: numberValue(qs("[name='goodQty']", row).value),
        rawDefectQty: numberValue(qs("[name='rawDefectQty']", row).value),
        reworkQty: numberValue(qs("[name='reworkQty']", row).value),
        scrapQty: numberValue(qs("[name='scrapQty']", row).value),
        unprocessedRawQty: numberValue(qs("[name='unprocessedRawQty']", row).value),
        achievementRate: qs("[name='achievementRate']", row).value,
        defectPpm: qs("[name='defectPpm']", row).value,
        lotNo: qs("[name='lotNo']", row).value,
        defectDetail: qs("[name='defectDetail']", row).value,
        downtime: qs("[name='downtime']", row).value,
        note: qs("[name='note']", row).value
      };
    })
  };
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

async function saveDaily() {
  try {
    setStatus(t("savingDaily"));
    await postJson("/api/daily", collectDaily());
    setStatus(t("savedDaily"), "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function setTab(tab) {
  qsa("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  qsa(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${tab}Panel`));
  qs("#screenTitle").textContent = t("dailyTitle");
}

async function loadMasters() {
  let response = await fetch("/masters.json");
  if (!response.ok) response = await fetch("/api/masters");
  const masters = await response.json();
  partRecords = masters.parts || [];
  machineRecords = masters.machines || [];
  workerRecords = (masters.workers || []).filter(worker => worker.active !== false);
  partMaster = partRecords.map(part => part.partNo);
  upsertDatalist("partMasterList", partRecords.map(part => option(part.partNo, part.partName)));
  upsertDatalist("machineMasterList", machineRecords.map(machine => option(machine.machineName, machine.machineCode)));
  upsertDatalist("workerMasterList", workerRecords.map(worker => option(worker.workerName, worker.workerId)));
  qs("#dailyLine").setAttribute("list", "machineMasterList");
  qs("#dailyWriter").setAttribute("list", "workerMasterList");
}

function applyLanguage(lang) {
  currentLang = lang;
  qsa("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  qsa(".entry-row", dailyRows).forEach(updatePartWarning);
  qs("#saveState").textContent = t("waiting");
  setTab("daily");
}

async function init() {
  await loadMasters();
  qs("#productionDate").value = today();
  addDailyRow();
  qsa("[data-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.tab)));
  qs("#lineType").addEventListener("change", updateLineOptions);
  qs("#mctBedCount").addEventListener("change", refreshAchievements);
  qs("#addDailyRow").addEventListener("click", addDailyRow);
  qs("#saveDaily").addEventListener("click", saveDaily);
  qs("#langKo").addEventListener("click", () => applyLanguage("ko"));
  qs("#langVi").addEventListener("click", () => applyLanguage("vi"));
  qs("#dailyWriter").addEventListener("input", syncWorkersFromWriter);
  updateLineOptions();
  applyLanguage("ko");
  setTab("daily");
}

init();
