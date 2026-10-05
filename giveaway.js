const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const DATA_FILE = path.join(__dirname, "giveaways.json");
let clearingGiveaways = false;

const giveawayCommand = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Manage giveaways. Senior High Rank only.")
  .setDMPermission(false)
  .addSubcommand(subcommand =>
    subcommand
      .setName("start")
      .setDescription("Start a giveaway.")
      .addStringOption(option =>
        option.setName("prize")
          .setDescription("What is being given away?")
          .setRequired(true)
          .setMaxLength(200)
      )
      .addStringOption(option =>
        option.setName("duration")
          .setDescription("Examples: 30m, 2h, 1d")
          .setRequired(true)
          .setMaxLength(20)
      )
      .addIntegerOption(option =>
        option.setName("winners")
          .setDescription("Number of winners")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("clear")
      .setDescription("Clear all active and stored giveaways.")
  );

function readGiveaways() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Failed to read giveaways:", error);
    return {};
  }
}

function writeGiveaways(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseDuration(input) {
  const match = String(input).trim().toLowerCase().match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return null;

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  const milliseconds = Number(match[1]) * multipliers[match[2]];
  if (!Number.isFinite(milliseconds) || milliseconds < 10000 || milliseconds > 30 * 86400000) {
    return null;
  }

  return milliseconds;
}

function customEmoji(client, name) {
  const emoji = client.emojis.cache.find(item => item.name === name);
  return emoji ? "<:" + emoji.name + ":" + emoji.id + ">" : "";
}

function giveawayContainer(client, giveaway, ended = false, winners = []) {
  const container = new ContainerBuilder();
  const gift = customEmoji(client, "gift");
  const trophy = customEmoji(client, "trophy");
  const people = customEmoji(client, "people");
  const bulletin = customEmoji(client, "bulletin");

  if (ended) {
    const winnerText = winners.length
      ? winners.map(id => "<@" + id + ">").join(", ")
      : "No eligible winners.";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## Giveaway Ended\n" +
        "**" + gift + " Prize:** " + giveaway.prize + "\n" +
        "**" + trophy + " Winner(s):** " + winnerText + "\n" +
        "**" + people + " Entries:** " + giveaway.entries.length
      )
    );

    return container;
  }

  const endUnix = Math.floor(giveaway.endsAt / 1000);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "## Giveaway\n" +
      "**" + gift + " Prize:** " + giveaway.prize + "\n" +
      "**" + bulletin + " Ends:** <t:" + endUnix + ":F> (<t:" + endUnix + ":R>)\n" +
      "**" + trophy + " Winners:** " + giveaway.winners + "\n" +
      "**" + people + " Entries:** " + giveaway.entries.length
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("giveaway_enter:" + giveaway.id)
        .setLabel("Enter Giveaway")
        .setStyle(ButtonStyle.Primary)
    )
  );

  return container;
}

async function endGiveaway(client, giveawayId) {
  const giveaways = readGiveaways();
  const giveaway = giveaways[giveawayId];

  if (!giveaway || giveaway.ended) return;

  giveaway.ended = true;

  const entries = Array.isArray(giveaway.entries)
    ? [...new Set(giveaway.entries)]
    : [];

  const winners = [];
  const available = [...entries];

  while (winners.length < Math.min(giveaway.winners, available.length)) {
    const index = Math.floor(Math.random() * available.length);
    winners.push(available.splice(index, 1)[0]);
  }

  giveaway.winnerIds = winners;
  writeGiveaways(giveaways);

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);

  if (message) {
    await message.edit({
      components: [giveawayContainer(client, giveaway, true, winners)],
      flags: MessageFlags.IsComponentsV2
    }).catch(() => {});
  }

  const winnerText = winners.length
    ? winners.map(id => "<@" + id + ">").join(", ")
    : "No eligible winners.";

  await channel.send({
    content: winners.length
      ? "Congratulations " + winnerText + "! You won **" + giveaway.prize + "**!"
      : "The giveaway for **" + giveaway.prize + "** ended with no eligible winners.",
    allowedMentions: { users: winners }
  }).catch(() => {});
}

function scheduleGiveawayEnd(client, giveaway) {
  const delay = Math.max(0, giveaway.endsAt - Date.now());

  if (delay > 2147483647) {
    setTimeout(() => scheduleGiveawayEnd(client, giveaway), 2147483647);
    return;
  }

  setTimeout(() => endGiveaway(client, giveaway.id), delay);
}

async function clearAllGiveaways(client) {
  const giveaways = readGiveaways();
  clearingGiveaways = true;

  for (const giveaway of Object.values(giveaways)) {
    if (!giveaway.channelId || !giveaway.messageId) continue;

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) continue;

    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) await message.delete().catch(() => {});
  }

  writeGiveaways({});
  clearingGiveaways = false;
  console.log("All giveaways cleared.");
}

function setup(client) {
  const giveaways = readGiveaways();

  client.on("messageDelete", async message => {
    try {
      const stored = readGiveaways();
      const giveaway = Object.values(stored).find(item => item.messageId === message.id);

      if (clearingGiveaways || !giveaway || giveaway.ended) return;

      console.log("Giveaway message deleted; ending giveaway " + giveaway.id);
      await endGiveaway(client, giveaway.id);
    } catch (error) {
      console.error("Giveaway message deletion handler error:", error);
    }
  });

  for (const giveaway of Object.values(giveaways)) {
    if (!giveaway.ended) scheduleGiveawayEnd(client, giveaway);
  }

  client.on("interactionCreate", async interaction => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "giveaway") {
        if (!interaction.member.roles.cache.has(SENIOR_HR_ROLE_ID)) {
          await interaction.reply({
            content: "Only Senior HR can use the giveaway command.",
            ephemeral: true
          });
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "clear") {
          await clearAllGiveaways(client);
          await interaction.reply({
            content: "All giveaways have been cleared.",
            ephemeral: true
          });
          return;
        }

        const prize = interaction.options.getString("prize", true);
        const durationText = interaction.options.getString("duration", true);
        const winners = interaction.options.getInteger("winners", true);
        const duration = parseDuration(durationText);

        if (!duration) {
          await interaction.reply({
            content: "Invalid duration. Use 30m, 2h, 1d, or 1w. Duration must be between 10 seconds and 30 days.",
            ephemeral: true
          });
          return;
        }

        const id = "GW-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

        const giveaway = {
          id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: null,
          prize,
          winners,
          entries: [],
          createdBy: interaction.user.id,
          createdAt: Date.now(),
          endsAt: Date.now() + duration,
          ended: false
        };

        const stored = readGiveaways();
        stored[id] = giveaway;
        writeGiveaways(stored);

        await interaction.reply({
          content: "<@&1527904721669460100>",
          components: [giveawayContainer(client, giveaway)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { roles: ["1527904721669460100"] }
        });

        const message = await interaction.fetchReply();
        giveaway.messageId = message.id;

        const updated = readGiveaways();
        updated[id] = giveaway;
        writeGiveaways(updated);

        scheduleGiveawayEnd(client, giveaway);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("giveaway_enter:")) {
        const id = interaction.customId.slice("giveaway_enter:".length);
        const giveaways = readGiveaways();
        const giveaway = giveaways[id];

        if (!giveaway || giveaway.ended || Date.now() >= giveaway.endsAt) {
          await interaction.reply({
            content: "This giveaway has already ended.",
            ephemeral: true
          });
          return;
        }

        if (!Array.isArray(giveaway.entries)) giveaway.entries = [];

        if (giveaway.entries.includes(interaction.user.id)) {
          await interaction.reply({
            content: "You are already entered in this giveaway.",
            ephemeral: true
          });
          return;
        }

        giveaway.entries.push(interaction.user.id);
        writeGiveaways(giveaways);

        await interaction.reply({
          content: "You have entered the giveaway!",
          ephemeral: true
        });

        await interaction.message.edit({
          components: [giveawayContainer(client, giveaway)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    } catch (error) {
      console.error("Giveaway interaction error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Something went wrong while processing the giveaway.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  });
}

module.exports = {
  setup,
  giveawayCommand
};
