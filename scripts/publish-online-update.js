const fs = require("fs");
const path = require("path");

const releaseDir = path.resolve(__dirname, "..", "release-online");
const ymlPath = path.join(releaseDir, "latest.yml");

if (!fs.existsSync(ymlPath)) {
  console.error("release-online\\latest.yml was not found. Build the online EXE first.");
  process.exit(1);
}

const yml = fs.readFileSync(ymlPath, "utf8");
const pathLine = yml.match(/^path:\s*(.+)$/m);
const setupName = pathLine ? pathLine[1].trim().replace(/^['"]|['"]$/g, "") : "";
if (!setupName) {
  console.error("latest.yml has no setup file path.");
  process.exit(1);
}

const fileNames = ["latest.yml", setupName, `${setupName}.blockmap`];
const targets = ["C:\\SparkleDashboardEXE"];
const remoteDir = String(process.env.APP_UPDATE_PUBLISH_DIR || "").trim();
if (remoteDir) targets.push(remoteDir);

let failedRemote = false;

for (const target of targets) {
  try {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fileNames) {
      const source = path.join(releaseDir, name);
      if (!fs.existsSync(source)) {
        console.warn(`Skip missing file: ${source}`);
        continue;
      }
      const destination = path.join(target, name);
      console.log(`Copy ${name} -> ${destination}`);
      fs.copyFileSync(source, destination);
    }
    console.log(`Update files copied to ${target}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`Could not copy update files to ${target}: ${message}`);
    if (target === remoteDir) failedRemote = true;
    else process.exitCode = 1;
  }
}

if (failedRemote) {
  console.error("The server folder was not updated. Share C:\\SparkleDashboardEXE on the QA server and set APP_UPDATE_PUBLISH_DIR in .env.online.");
}

uploadUpdateFiles(releaseDir, fileNames).catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});

async function uploadUpdateFiles(folder, names) {
  const uploadUrl = String(process.env.APP_UPDATE_UPLOAD_URL || "").trim();
  const uploadKey = String(process.env.APP_UPDATE_UPLOAD_KEY || "").trim();
  if (!uploadUrl || !uploadKey) return;

  const form = new FormData();
  for (const name of names) {
    const source = path.join(folder, name);
    if (!fs.existsSync(source)) continue;
    form.append("files", new Blob([fs.readFileSync(source)]), name);
  }

  console.log(`Uploading update files to ${uploadUrl}`);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-App-Update-Key": uploadKey },
    body: form
  });
  const body = await response.text();
  if (response.status === 404) {
    console.error("Upload API is not published on the server yet. Publish GoldStringWebApp, then run the build again.");
    console.error(body);
    return;
  }
  if (!response.ok) {
    throw new Error(`Update upload failed (${response.status}): ${body}`);
  }
  console.log(body);
}
