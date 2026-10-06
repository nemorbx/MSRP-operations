const fs = require("fs");
const path = require("path");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sticky.json");

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channels: {} }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && data.channels ? data : { channels: {} };
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
  delete data.channels[channel.id];
  saveData(data);
}

function setupSticky(client) {
  const data = loadData();

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

    const stickyText = content.slice(parts[0].length).trim();

    if (!stickyText) {
      const reply = await message.channel.send("Usage: !sticky <message> or !sticky off").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    if (stickyText.toLowerCase() === "off") {
      await deleteStickyMessage(message.channel, data);
      const reply = await message.channel.send("Sticky message removed.").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    if (stickyText.length > 2000) {
      const reply = await message.channel.send("The sticky message must be 2,000 characters or less.").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    await deleteStickyMessage(message.channel, data);

    const sticky = await message.channel.send(stickyText).catch(() => null);
    if (!sticky) return;

    data.channels[message.channel.id] = {
      messageId: sticky.id,
      text: stickyText,
    };
    saveData(data);
  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;

    const entry = data.channels[message.channel.id];
    if (!entry?.messageId) return;

    // Any new member message makes the sticky move back to the bottom.
    // The sticky's own message is ignored because bot messages return above.
    const oldStickyId = entry.messageId;
    await deleteStickyMessage(message.channel, data);

    const sticky = await message.channel.send(entry.text).catch(() => null);
    if (!sticky) return;

    data.channels[message.channel.id] = {
      messageId: sticky.id,
      text: entry.text,
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
