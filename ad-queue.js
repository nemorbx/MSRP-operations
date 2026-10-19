const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const ADS_CHANNEL_ID = "1527179630140854404";
const DATA_FILE = path.join(__dirname, "advertisement-queue.json");
const TIME_ZONE = "America/Chicago";
const POST_HOUR = 17; // 5:00 PM Central, a reasonable US evening audience window.
const CHECK_INTERVAL_MS = 30 * 1000;
let schedulerStarted = false;
let posting = false;

const adCommand = new SlashCommandBuilder()
  .setName("ad")
  .setDescription("Schedule an advertisement. Senior High Rank only.")
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName("schedule")
    .setDescription("Add an advertisement to the daily posting queue.")
    .addStringOption(option => option.setName("type")
      .setDescription("Whether the advertisement should ping members.")
      .setRequired(true)
      .addChoices(
        { name: "No ping", value: "none" },
        { name: "@here", value: "here" },
        { name: "@everyone", value: "everyone" }
      ))
    .addStringOption(option => option.setName("advertisement")
      .setDescription("Full advertisement text to post when its turn arrives.")
      .setRequired(true)
      .setMaxLength(1900))
  );

const pendingCommand = new SlashCommandBuilder()
  .setName("pending-ads")
  .setDescription("View pending ads. Senior High Rank only.")
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName("view")
    .setDescription("View queued advertisement details without showing their full text.")
  );

function readQueue() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { nextPostAt: null, items: [], nextId: 1 };
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      nextPostAt: Number.isFinite(data.nextPostAt) ? data.nextPostAt : null,
      items: Array.isArray(data.items) ? data.items : [],
      nextId: Number.isInteger(data.nextId) ? data.nextId : 1
    };
  } catch (error) {
    console.error("[Ad Queue] Failed to read queue:", error);
    return { nextPostAt: null, items: [], nextId: 1 };
  }
}

function writeQueue(queue) {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(queue, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function getCentralParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function centralTimeToUtc(year, month, day, hour) {
  // Iteratively resolve Central time (including daylight-saving transitions) to UTC.
  const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const p = getCentralParts(new Date(guess));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour), Number(p.minute), Number(p.second));
    guess += desired - represented;
  }
  return guess;
}

function nextPostingTime(from = Date.now()) {
  const now = new Date(from);
  const p = getCentralParts(now);
  let candidate = centralTimeToUtc(Number(p.year), Number(p.month), Number(p.day), POST_HOUR);
  if (candidate <= from) {
    const tomorrow = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1));
    candidate = centralTimeToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), POST_HOUR);
  }
  return candidate;
}

function centralLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short"
  }).format(new Date(timestamp)) + " Central";
}

function hasSeniorHR(interaction) {
  return Boolean(interaction.member?.roles?.cache?.has(SENIOR_HR_ROLE_ID));
}

function safeText(value) {
  return String(value).replace(/@everyone/gi, "@\u200beveryone").replace(/@here/gi, "@\u200bhere");
}

function pendingSummary(queue) {
  if (!queue.items.length) return "## Pending Ads\nThe queue is currently empty.";
  const lines = queue.items.slice(0, 20).map((item, index) =>
    "**" + (index + 1) + ". " + safeText(item.serverName) + "** — Type: **" +
    (item.type === "none" ? "No ping" : item.type === "here" ? "@here" : "@everyone") +
    "** — Submitted by <@" + item.createdBy + "> — ID: `AD-" + item.id + "`"
  );
  if (queue.items.length > 20) lines.push("\nShowing 20 of " + queue.items.length + " pending ads.");
  return "## Pending Ads (" + queue.items.length + ")\n" + lines.join("\n") +
    "\n\n**Next scheduled post:** " + (queue.nextPostAt ? centralLabel(queue.nextPostAt) : centralLabel(nextPostingTime()));
}

async function postNextAd(client) {
  if (posting) return;
  posting = true;
  try {
    const queue = readQueue();
    if (!queue.items.length) {
      queue.nextPostAt = nextPostingTime();
      writeQueue(queue);
      return;
    }

    const channel = await client.channels.fetch(ADS_CHANNEL_ID).catch(error => {
      console.error("[Ad Queue] Could not fetch ads channel:", error);
      return null;
    });
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      console.error("[Ad Queue] Ads channel is unavailable or is not a text channel.");
      return;
    }

    const ad = queue.items[0];
    const mention = ad.type === "here" ? "@here\n" : ad.type === "everyone" ? "@everyone\n" : "";
    const content = mention + ad.advertisement;
    await channel.send({
      content,
      allowedMentions: ad.type === "here"
        ? { parse: ["everyone"] }
        : ad.type === "everyone"
          ? { parse: ["everyone"] }
          : { parse: [] }
    });

    queue.items.shift();
    queue.nextPostAt = nextPostingTime(Date.now());
    writeQueue(queue);
    console.log("[Ad Queue] Posted AD-" + ad.id + ". Remaining: " + queue.items.length);
  } catch (error) {
    console.error("[Ad Queue] Posting failed; the ad remains queued:", error);
  } finally {
    posting = false;
  }
}

function setup(client) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Initialize the schedule on boot. If a scheduled time passed while offline,
  // one queued ad is sent after startup, then the daily schedule resumes.
  const initial = readQueue();
  if (!initial.nextPostAt) {
    initial.nextPostAt = nextPostingTime();
    writeQueue(initial);
  }

  const tick = async () => {
    const queue = readQueue();
    if (!queue.nextPostAt) {
      queue.nextPostAt = nextPostingTime();
      writeQueue(queue);
      return;
    }
    if (Date.now() >= queue.nextPostAt && queue.items.length) {
      await postNextAd(client);
    } else if (Date.now() >= queue.nextPostAt) {
      queue.nextPostAt = nextPostingTime();
      writeQueue(queue);
    }
  };

  setInterval(() => tick().catch(error => console.error("[Ad Queue] Scheduler error:", error)), CHECK_INTERVAL_MS);
  client.once("clientReady", () => {
    tick().catch(error => console.error("[Ad Queue] Startup scheduler error:", error));
    console.log("[Ad Queue] Daily posting scheduled for 5:00 PM America/Chicago.");
  });

  client.on("interactionCreate", async interaction => {
    try {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "ad") {
        if (!hasSeniorHR(interaction)) {
          await interaction.reply({ content: "Only Senior High Rank can schedule advertisements.", ephemeral: true });
          return;
        }

        const type = interaction.options.getString("type", true);
        const advertisement = interaction.options.getString("advertisement", true).trim();
        if (!advertisement) {
          await interaction.reply({ content: "Advertisement text cannot be empty.", ephemeral: true });
          return;
        }

        const queue = readQueue();
        const item = {
          id: queue.nextId++,
          type,
          advertisement,
          createdBy: interaction.user.id,
          createdAt: Date.now()
        };
        queue.items.push(item);
        if (!queue.nextPostAt) queue.nextPostAt = nextPostingTime();
        writeQueue(queue);

        await interaction.reply({
          content: "Advertisement **AD-" + item.id + "** for **" + safeText(serverName) +
            "** was added to the queue at position **" + queue.items.length + "**.\n" +
            "Posting window: daily at **5:00 PM Central**.\n" +
            "Ping type: **" + (type === "none" ? "No ping" : type === "here" ? "@here" : "@everyone") + "**.",
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "pending-ads") {
        if (!hasSeniorHR(interaction)) {
          await interaction.reply({ content: "Only Senior High Rank can view pending ads.", ephemeral: true });
          return;
        }

        const queue = readQueue();
        const container = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(pendingSummary(queue))
        );
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error("[Ad Queue] Interaction error:", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong with the advertisement queue. Please try again.", ephemeral: true }).catch(() => {});
      }
    }
  });
}

module.exports = { setup, commands: [adCommand, pendingCommand] };
