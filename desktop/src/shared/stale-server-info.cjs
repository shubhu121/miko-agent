
function resolveStaleServerInfoDisposition({ pidAlive, knownDead, portConflict }) {
  if (!pidAlive || knownDead) {
    return { removeInfoFile: true, failFast: false };
  }
  return { removeInfoFile: false, failFast: portConflict !== false };
}

module.exports = { resolveStaleServerInfoDisposition };
