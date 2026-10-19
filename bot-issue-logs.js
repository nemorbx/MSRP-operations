const ISSUE_LOG_CHANNEL_ID = "1561762073971531857";

function stringifyPart(part) {
  if (part instanceof Error) return part.stack || (part.name + ": " + part.message);
  if (typeof part === "string") return part;
  try { return JSON.stringify(part); } catch { return String(part); }
}

function setupBotIssueLogs(client) {
  let flushing = false;
  const pending = [];
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  async function sendLog(level, parts) {
    const detail = parts.map(stringifyPart).join(" ").trim();
    if (!detail) return;
    pending.push({ level, detail: detail.length > 3500 ? detail.slice(0, 3500) + "… (truncated)" : detail, at: new Date().toISOString() });
    if (flushing || !client.isReady()) return;
    flushing = true;
    try {
      while (pending.length) {
        const item = pending.shift();
        try {
          const channel = await client.channels.fetch(ISSUE_LOG_CHANNEL_ID);
          if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
            originalError("[Bot Issue Logs] Configured issue-log channel is unavailable: " + ISSUE_LOG_CHANNEL_ID);
            continue;
          }
          const safeDetail = item.detail.replace(/```/g, "'''");
          await channel.send({
            allowedMentions: { parse: [] },
            embeds: [{
              title: item.level === "ERROR" ? "Bot Error" : "Bot Warning",
              description: "```text\n" + safeDetail + "\n```",
              color: item.level === "ERROR" ? 0xD83C3E : 0xE0A33A,
              timestamp: item.at,
              footer: { text: "MSRP Operations • Central Issue Log" }
            }]
          });
        } catch (error) {
          // Do not recursively send logger delivery failures back through this logger.
          originalError("[Bot Issue Logs] Could not send an issue log:", error);
        }
      }
    } finally { flushing = false; }
  }

  console.error = (...parts) => { originalError(...parts); void sendLog("ERROR", parts); };
  console.warn = (...parts) => { originalWarn(...parts); void sendLog("WARNING", parts); };
  client.on("error", error => void sendLog("ERROR", ["Discord client error:", error]));
  client.on("shardError", error => void sendLog("ERROR", ["Discord gateway shard error:", error]));
  client.on("invalidated", () => void sendLog("ERROR", ["Discord session invalidated."]));
  client.once("clientReady", () => { if (pending.length) void sendLog("WARNING", ["Flushing queued startup issues."]); });
}

module.exports = { setupBotIssueLogs };
