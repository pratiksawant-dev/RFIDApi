const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const envFile = path.resolve(__dirname, "../.env.online");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  });
}

const uploadUrl = (process.env.APP_UPDATE_URL || "https://qa-rfid-api.sparklerfid.net/api/AppUpdate/").replace(/\/?$/, "/upload");
const uploadKey = process.env.APP_UPDATE_UPLOAD_KEY;
const distDir = path.resolve(__dirname, "../release-online");

if (!uploadKey) {
  console.error("APP_UPDATE_UPLOAD_KEY missing in .env.online");
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  console.error("release-online folder was not found. Build the online EXE first.");
  process.exit(1);
}

const names = fs.readdirSync(distDir);
const latestName = names.find((name) => name.toLowerCase() === "latest.yml");
if (!latestName) {
  console.error("latest.yml not found in release-online");
  process.exit(1);
}

const latestText = fs.readFileSync(path.join(distDir, latestName), "utf8");
const setupMatch = latestText.match(/^path:\s*(.+)$/m);
const setupName = setupMatch ? setupMatch[1].trim().replace(/^['"]|['"]$/g, "") : "";
const blockmapName = setupName ? `${setupName}.blockmap` : "";
const files = [latestName, setupName, blockmapName].filter((name, index, list) => name && list.indexOf(name) === index && fs.existsSync(path.join(distDir, name)));

if (!setupName || !files.includes(setupName)) {
  console.error("Setup EXE named in latest.yml was not found in release-online");
  process.exit(1);
}

const boundary = "----SparkleUpdate" + Date.now();
const chunks = [];

function addFile(fileName) {
  const filePath = path.join(distDir, fileName);
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName.replace(/"/g, "")}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  ));
  chunks.push(fs.readFileSync(filePath));
  chunks.push(Buffer.from("\r\n"));
}

files.forEach(addFile);
chunks.push(Buffer.from(`--${boundary}--\r\n`));
const body = Buffer.concat(chunks);
const url = new URL(uploadUrl);
const lib = url.protocol === "https:" ? https : http;

console.log(`Uploading ${files.join(", ")} to ${uploadUrl}`);

const req = lib.request(
  {
    method: "POST",
    hostname: url.hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
      "X-App-Update-Key": uploadKey
    }
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.log("Upload status", res.statusCode, data);
      if (res.statusCode < 200 || res.statusCode >= 300) process.exit(1);
    });
  }
);

req.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
req.write(body);
req.end();
