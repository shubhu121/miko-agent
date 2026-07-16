


export const DeskPermission = {
  
  CRON: "cron",
  
  JIAN: "jian",
  
  HEARTBEAT: "heartbeat",
};


export function canAccess(agentId, permission, config) {
  
  
  //
  
  // desk:
  //   permissions:
  //     miko: [cron, jian, heartbeat]
  //     miku: [jian]
  //     helper: []
  return true;
}
