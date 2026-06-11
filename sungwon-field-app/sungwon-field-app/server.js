import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PORT = Number(globalThis.process?.env?.PORT || 3000);
const ADMIN_PASSWORD = globalThis.process?.env?.ADMIN_PASSWORD || "1234";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = globalThis.process?.env?.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

async function ensureDb() {
  await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    await writeDb({ dailyReports: [], inspections: [], defectReports: [], partMaster: ["SA-1011280110"] });
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  const db = JSON.parse(raw || '{"dailyReports":[],"inspections":[],"defectReports":[],"partMaster":["SA-1011280110"]}');
  db.dailyReports ||= [];
  db.inspections ||= [];
  db.defectReports ||= [];
  db.partMaster ||= ["SA-1011280110"];
  return db;
}

async function writeDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fsp.rename(tmp, DATA_FILE);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

function normalizeDaily(input) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  return {
    id: cleanString(input.id) || crypto.randomUUID(),
    productionDate: cleanString(input.productionDate),
    writer: cleanString(input.writer),
    line: cleanString(input.line),
    lineType: cleanString(input.lineType),
    mctBedCount: cleanString(input.mctBedCount),
    shift: cleanString(input.shift),
    rows: rows.map(row => ({
      worker: cleanString(row.worker),
      partNo: cleanString(row.partNo),
      cycleTime: cleanNumber(row.cycleTime),
      workHours: cleanNumber(row.workHours),
      goodQty: cleanNumber(row.goodQty),
      rawDefectQty: cleanNumber(row.rawDefectQty),
      reworkQty: cleanNumber(row.reworkQty),
      scrapQty: cleanNumber(row.scrapQty),
      achievementRate: cleanString(row.achievementRate),
      lotNo: cleanString(row.lotNo),
      defectDetail: cleanString(row.defectDetail),
      downtime: cleanString(row.downtime),
      note: cleanString(row.note)
    })),
    updatedAt: new Date().toISOString()
  };
}

function normalizeInspection(input) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  return {
    id: cleanString(input.id) || crypto.randomUUID(),
    inspectionDate: cleanString(input.inspectionDate),
    partNo: cleanString(input.partNo),
    machineName: cleanString(input.machineName),
    writer: cleanString(input.writer),
    keyPoints: cleanString(input.keyPoints),
    defectTypes: cleanString(input.defectTypes),
    rows: rows.map(row => ({
      item: cleanString(row.item),
      spec: cleanString(row.spec),
      gauge: cleanString(row.gauge),
      values: row.values && typeof row.values === "object" ? row.values : {}
    })),
    qcConfirm: cleanString(input.qcConfirm),
    updatedAt: new Date().toISOString()
  };
}

function normalizeDefectReport(input) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  return {
    id: cleanString(input.id) || crypto.randomUUID(),
    defectDate: cleanString(input.defectDate),
    foreman: cleanString(input.foreman),
    qcName: cleanString(input.qcName),
    status: cleanString(input.status) || "자동취합",
    rows: rows.map(row => ({
      sourceDailyId: cleanString(row.sourceDailyId),
      sourceRowIndex: cleanNumber(row.sourceRowIndex),
      productionDate: cleanString(row.productionDate),
      machine: cleanString(row.machine),
      shift: cleanString(row.shift),
      worker: cleanString(row.worker),
      partNo: cleanString(row.partNo),
      productionQty: cleanNumber(row.productionQty),
      rawDefectQty: cleanNumber(row.rawDefectQty),
      reworkQty: cleanNumber(row.reworkQty),
      scrapQty: cleanNumber(row.scrapQty),
      qcRawDefectQty: cleanNumber(row.qcRawDefectQty),
      qcReworkQty: cleanNumber(row.qcReworkQty),
      qcScrapQty: cleanNumber(row.qcScrapQty),
      defectDetail: cleanString(row.defectDetail),
      qcMemo: cleanString(row.qcMemo)
    })),
    updatedAt: new Date().toISOString()
  };
}

function matchesFilter(record, query, dateField) {
  if (query.get("date") && record[dateField] !== query.get("date")) return false;
  if (query.get("line") && record.line !== query.get("line")) return false;
  if (query.get("shift") && record.shift !== query.get("shift")) return false;
  if (query.get("partNo")) {
    const partNo = query.get("partNo").toLowerCase();
    const hasPart = (record.rows || []).some(row => String(row.partNo || "").toLowerCase().includes(partNo));
    if (!hasPart && !String(record.partNo || "").toLowerCase().includes(partNo)) return false;
  }
  return true;
}

async function handleApi(req, res, url) {
  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = JSON.parse(await readBody(req) || "{}");
    return sendJson(res, 200, { ok: cleanString(body.password) === ADMIN_PASSWORD });
  }

  if (req.method === "GET" && url.pathname === "/api/parts") {
    return sendJson(res, 200, { items: db.partMaster });
  }

  if (req.method === "GET" && url.pathname === "/api/daily") {
    const items = db.dailyReports.filter(item => matchesFilter(item, url.searchParams, "productionDate"));
    return sendJson(res, 200, { items });
  }

  if (req.method === "POST" && url.pathname === "/api/daily") {
    const body = JSON.parse(await readBody(req) || "{}");
    const item = normalizeDaily(body);
    if (!item.productionDate) return sendJson(res, 400, { error: "productionDate is required" });
    db.dailyReports = db.dailyReports.filter(old => old.id !== item.id);
    db.dailyReports.push(item);
    await writeDb(db);
    return sendJson(res, 200, { item });
  }

  if (req.method === "GET" && url.pathname === "/api/inspections") {
    const items = db.inspections.filter(item => matchesFilter(item, url.searchParams, "inspectionDate"));
    return sendJson(res, 200, { items });
  }

  if (req.method === "GET" && url.pathname === "/api/defects") {
    const items = db.defectReports.filter(item => matchesFilter(item, url.searchParams, "defectDate"));
    return sendJson(res, 200, { items });
  }

  if (req.method === "POST" && url.pathname === "/api/defects") {
    const body = JSON.parse(await readBody(req) || "{}");
    const item = normalizeDefectReport(body);
    if (!item.defectDate) return sendJson(res, 400, { error: "defectDate is required" });
    db.defectReports = db.defectReports.filter(old => old.id !== item.id);
    db.defectReports.push(item);
    await writeDb(db);
    return sendJson(res, 200, { item });
  }

  if (req.method === "POST" && url.pathname === "/api/inspections") {
    const body = JSON.parse(await readBody(req) || "{}");
    const item = normalizeInspection(body);
    if (!item.inspectionDate) return sendJson(res, 400, { error: "inspectionDate is required" });
    db.inspections = db.inspections.filter(old => old.id !== item.id);
    db.inspections.push(item);
    await writeDb(db);
    return sendJson(res, 200, { item });
  }

  return sendJson(res, 404, { error: "API not found" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) return sendText(res, 404, "Not found");
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(target)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    fs.createReadStream(target).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

ensureDb().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Sung Won field app running at http://0.0.0.0:${PORT}`);
  });
});
