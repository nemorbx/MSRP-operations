const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "afk.json");
const SENIOR_HR_ROLE_ID = "1551704056991318191";

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}", "utf8");
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isSeniorHR(member) {
  return Boolean(member?.roles?.cache?.has(SENIOR_HR_ROLE_ID));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length || seconds) parts.push(`${seconds}s`);
  return parts.join(" ");
}

const commands = [
  new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Manage your MSRP AFK status.")
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Set your AFK reason.")
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Why you are AFK.")
            .setRequired(true)
            .setMaxLength(500)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("edit")
        .setDescription("Edit your AFK reason.")
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Your new AFK reason.")
            .setRequired(true)
            .setMaxLength(500)
        )
    )
    .toJSON(),
];

function setupAFK(client) {
  client.afkData = loadData();

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "afk") return;

    try {
      const subcommand = interaction.options.getSubcommand();
      const data = client.afkData;

      if (subcommand === "set") {
        const reason = interaction.options.getString("reason", true).trim();
        if (!reason) {
          await interaction.reply({ content: "Your AFK reason cannot be empty.", flags: MessageFlags.Ephemeral });
          return;
        }

        const existing = data[interaction.user.id];
        if (existing) {
          await interaction.reply({
            content: `You are already AFK. Your current reason is: **${existing.reason}**\nUse /afk edit to change it.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        data[interaction.user.id] = {
          reason,
          startedAt: Date.now(),
          guildId: interaction.guildId,
        };
        saveData(data);

        await interaction.reply({
          content: `You are now AFK: **${reason}**`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === "edit") {
        const reason = interaction.options.getString("reason", true).trim();
        const existing = data[interaction.user.id];
        if (!existing) {
          await interaction.reply({ content: "You are not currently AFK.", flags: MessageFlags.Ephemeral });
          return;
        }

        existing.reason = reason;
        saveData(data);

        await interaction.reply({
          content: `Your AFK reason has been updated to: **${reason}**`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

    } catch (error) {
      console.error("AFK interaction error:", error);
      const response = { content: "Something went wrong while handling AFK status.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
  });

  client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;

    const data = client.afkData;
    const ownAfk = data[message.author.id];

    if (ownAfk) {
      const elapsed = formatDuration(Date.now() - ownAfk.startedAt);
      delete data[message.author.id];
      saveData(data);
      await message.reply({
        content: `Welcome back, <@${message.author.id}>! You were AFK for **${elapsed}**.`,
        allowedMentions: { users: [message.author.id] },
      }).catch(() => {});
    }

    const mentionedIds = [...message.mentions.users.keys()];
    const notices = [];
    const seen = new Set();

    for (const userId of mentionedIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      const afk = data[userId];
      if (!afk) continue;

      const elapsed = formatDuration(Date.now() - afk.startedAt);
      notices.push(`<@${userId}> is AFK: **${afk.reason}**\nAFK for **${elapsed}**.`);
    }

    if (notices.length) {
      await message.reply({
        content: notices.join("\n\n"),
        allowedMentions: { users: mentionedIds.filter(id => data[id]) },
      }).catch(() => {});
    }
  });
}

async function sendOwnerConfirmation(message, content) {
  try {
    const confirmation = await message.channel.send({ content, allowedMentions: { users: [message.author.id] } });
    setTimeout(() => confirmation.delete().catch(() => {}), 4000);
  } catch {}
}

async function handlePrefixCommand(client, message, args, isOwner) {
  if (!isOwner || args[0]?.toLowerCase() !== "afk") return false;
  if (args[1]?.toLowerCase() !== "remove") return false;

  const target = message.mentions.users.first();
  if (!target) {
    await message.reply("Usage: `!afk remove @member`").catch(() => {});
    return true;
  }

  if (target.id === message.author.id) {
    await message.reply("You cannot use `!afk remove` on yourself. Send a normal message to remove your own AFK status.").catch(() => {});
    return true;
  }

  const data = client.afkData;
  if (!data[target.id]) {
    await message.reply("That member is not currently AFK.").catch(() => {});
    return true;
  }

  delete data[target.id];
  saveData(data);
  await sendOwnerConfirmation(message, `AFK command executed successfully. Removed AFK status from <@${target.id}>.`);
  return true;
}

module.exports = { setup: setupAFK, commands, handlePrefixCommand };
