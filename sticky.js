const fs = require("fs");
const path = require("path");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sticky.json");
const DEFAULT_INTERVAL = 1;
const MAX_INTERVAL = 1000;

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channels: {} }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!stored || !stored.channels) return { channels: {} };
    for (const entry of Object.values(stored.channels)) {
      if (entry && !Number.isInteger(entry.interval)) entry.interval = DEFAULT_INTERVAL;
    }
    return stored;
  } catch {
    return { channels: {} };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isSeniorHR(member) {
  return member?.roles?.cache?.has(SENIOR_HR_ROLE_ID) === true;
}

async function deleteStickyMessage(channel, data) {
  const entry = data.channels[channel.id];
  if (!entry?.messageId) return;
  const oldMessage = await channel.messages.fetch(entry.messageId).catch(() => null);
  if (oldMessage) await oldMessage.delete().catch(() => {});
}

function parseStickyInput(raw) {
  const input = raw.trim();
  if (!input) return { error: "Usage: !sticky [message interval] <message> or !sticky off" };
  if (input.toLowerCase() === "off") return { off: true };

  const match = input.match(/^(\d+)\s+([\s\S]+)$/);
  if (match) {
    const interval = Number(match[1]);
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
      return { error: "The message interval must be a whole number from 1 to " + MAX_INTERVAL + "." };
    }
    return { interval, text: match[2].trim() };
  }

  return { interval: DEFAULT_INTERVAL, text: input };
}

function setupSticky(client) {
  const data = loadData();
  const messageCounts = {};

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();
    if (!content.toLowerCase().startsWith("!sticky")) return;
    const parts = content.split(/\s+/);
    if (parts[0].toLowerCase() !== "!sticky") return;

    if (!isSeniorHR(message.member)) {
      await message.delete().catch(() => {});
      return;
    }
    await message.delete().catch(() => {});

    const parsed = parseStickyInput(content.slice(parts[0].length));
    if (parsed.error) {
      const reply = await message.channel.send(parsed.error).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    if (parsed.off) {
      await deleteStickyMessage(message.channel, data);
      delete data.channels[message.channel.id];
      delete messageCounts[message.channel.id];
      saveData(data);
      const reply = await message.channel.send("Sticky message removed.").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    if (!parsed.text || parsed.text.length > 2000) {
      const reply = await message.channel.send("The sticky message must be between 1 and 2,000 characters.").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    await deleteStickyMessage(message.channel, data);
    const sticky = await message.channel.send(parsed.text).catch(() => null);
    if (!sticky) return;

    data.channels[message.channel.id] = {
      messageId: sticky.id,
      text: parsed.text,
      interval: parsed.interval,
    };
    messageCounts[message.channel.id] = 0;
    saveData(data);
  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content.trim().toLowerCase().startsWith("!sticky")) return;

    const entry = data.channels[message.channel.id];
    if (!entry?.messageId) return;

    const interval = Number.isInteger(entry.interval) && entry.interval > 0
      ? Math.min(entry.interval, MAX_INTERVAL)
      : DEFAULT_INTERVAL;

    messageCounts[message.channel.id] = (messageCounts[message.channel.id] || 0) + 1;
    if (messageCounts[message.channel.id] < interval) return;
    messageCounts[message.channel.id] = 0;

    // Delete and repost the sticky so it returns to the bottom of the channel.
    await deleteStickyMessage(message.channel, data);
    const sticky = await message.channel.send(entry.text).catch(() => null);
    if (!sticky) return;

    data.channels[message.channel.id] = {
      messageId: sticky.id,
      text: entry.text,
      interval,
    };
    saveData(data);
  });

  client.once("clientReady", async () => {
    for (const [channelId, entry] of Object.entries(data.channels)) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased() || !channel.send) continue;
      const existing = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (!existing) {
        const sticky = await channel.send(entry.text).catch(() => null);
        if (sticky) {
          data.channels[channelId].messageId = sticky.id;
          saveData(data);
        }
      }
    }
  });
}

module.exports = { setup: setupSticky };
