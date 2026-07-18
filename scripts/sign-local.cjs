
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP = "/Applications/Miko.app";
const ENT = path.join(__dirname, "..", "desktop", "entitlements.mac.plist");

function sign(target, opts = "") {
  execSync(`codesign --sign - --force ${opts} "${target}"`, { stdio: "inherit" });
}


const serverDir = path.join(APP, "Contents", "Resources", "server");
if (fs.existsSync(serverDir)) {
  // node binary
  const nodeBin = path.join(serverDir, "node");
  if (fs.existsSync(nodeBin)) sign(nodeBin);

  // .node filesEnglish onlynative addonsEnglish only
  function findNodeFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findNodeFiles(full);
      } else if (entry.name.endsWith(".node")) {
        sign(full);
      }
    }
  }
  findNodeFiles(path.join(serverDir, "node_modules"));
}


const computerUseHelper = path.join(APP, "Contents", "Resources", "computer-use", "macos", "miko-computer-use-helper");
if (fs.existsSync(computerUseHelper)) {
  sign(computerUseHelper);
}


const frameworks = path.join(APP, "Contents", "Frameworks");
for (const entry of fs.readdirSync(frameworks)) {
  const full = path.join(frameworks, entry);
  if (entry.endsWith(".framework")) {
    sign(full, "--deep");
  } else if (entry.endsWith(".app")) {
    sign(full, `--entitlements "${ENT}"`);
  }
}


sign(APP, `--entitlements "${ENT}"`);


execSync(`codesign --verify --deep --strict "${APP}"`, { stdio: "inherit" });
console.log("✓ Signed and verified");
