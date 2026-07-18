
function resolvePostUpdateAnnouncement({ currentVersion, lastSeenVersion, isPackagedLike, setupComplete }) {
  if (!isPackagedLike) return { pending: false, seedVersion: null };
  if (typeof currentVersion !== "string" || !currentVersion) return { pending: false, seedVersion: null };
  if (lastSeenVersion === currentVersion) return { pending: false, seedVersion: null };
  if (!lastSeenVersion && !setupComplete) return { pending: false, seedVersion: currentVersion };
  return { pending: true, seedVersion: null };
}


function parseProductVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version == null ? "" : version).trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}


function compareProductVersions(a, b) {
  const left = parseProductVersion(a);
  const right = parseProductVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}


function coerceDigestHistory(v2Value, v1Value) {
  if (
    v2Value
    && typeof v2Value === "object"
    && !Array.isArray(v2Value)
    && v2Value.schema === 2
    && Array.isArray(v2Value.entries)
    && v2Value.entries.length > 0
  ) {
    return v2Value.entries;
  }
  if (v1Value && typeof v1Value === "object" && !Array.isArray(v1Value)) {
    return [v1Value];
  }
  return [];
}


function sliceDigestHistory({ entries, lastSeenVersion, currentVersion }) {
  if (!Array.isArray(entries) || !parseProductVersion(currentVersion)) return [];
  const usable = entries
    .filter((entry) => entry && typeof entry === "object" && parseProductVersion(entry.version))
    .filter((entry) => compareProductVersions(entry.version, currentVersion) <= 0)
    .sort((a, b) => compareProductVersions(b.version, a.version));

  const markerParsed = parseProductVersion(lastSeenVersion);
  if (!markerParsed) {
    
    return usable.filter((entry) => compareProductVersions(entry.version, currentVersion) === 0);
  }
  return usable.filter((entry) => compareProductVersions(entry.version, lastSeenVersion) > 0);
}

module.exports = {
  resolvePostUpdateAnnouncement,
  parseProductVersion,
  compareProductVersions,
  coerceDigestHistory,
  sliceDigestHistory,
};
