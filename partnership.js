const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const PARTNERSHIP_ROLE_ID = "1527387038716924074";
const PARTNERSHIP_CHANNEL_ID = "1561219662153261096";
const DATA_FILE = path.join(__dirname, "partnerships.json");

const partnershipCommand = new SlashCommandBuilder()
  .setName("partnership")
  .setDescription("Publish a partnership advertisement. Senior High Rank only.")
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName("ad")
    .setDescription("Post a partnership ad and assign its representative.")
    .addStringOption(option => option
      .setName("server_name")
      .setDescription("Name of the partner server.")
      .setRequired(true)
      .setMaxLength(100))
    .addStringOption(option => option
      .setName("advertisement")
      .setDescription("Full partnership advertisement text.")
      .setRequired(true)
      .setMaxLength(1800))
    .addUserOption(option => option
      .setName("representative")
      .setDescription("Member representing this partnership.")
      .setRequired(true))
  );

function readPartnerships() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("[Partnership] Failed to read stored partnerships:", error);
    return {};
  }
}

function writePartnerships(data) {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function hasSeniorHR(interaction) {
  return Boolean(interaction.member?.roles?.cache?.has(SENIOR_HR_ROLE_ID));
}

function safeName(value) {
  return String(value)
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere");
}

function partnershipMessage(serverName, advertisement, representativeId) {
  return "**" + safeName(serverName) + "**\n" +
    advertisement + "\n\n" +
    "**Representative:** <@" + representativeId + ">";
}

async function deleteRepresentativeAds(client, guild, userId) {
  const stored = readPartnerships();
  const records = Object.entries(stored).filter(([, record]) =>
    record.guildId === guild.id && record.representativeId === userId
  );

  if (!records.length) return 0;

  const channel = await client.channels.fetch(PARTNERSHIP_CHANNEL_ID).catch(error => {
    console.error("[Partnership] Could not fetch partnership channel during member-leave cleanup:", error);
    return null;
  });
  if (!channel || !channel.isTextBased() || typeof channel.messages?.fetch !== "function") {
    console.error("[Partnership] Partnership channel unavailable; cannot delete ads for departing representative.");
    return 0;
  }

  let deleted = 0;
  let recordsChanged = false;
  for (const [key, record] of records) {
    const message = await channel.messages.fetch(record.messageId).catch(error => {
      // Discord error code 10008 means the message is already gone.
      if (error?.code === 10008) {
        delete stored[key];
        recordsChanged = true;
      } else {
        console.error("[Partnership] Failed to fetch message " + record.messageId + ":", error);
      }
      return null;
    });

    if (message) {
      const ok = await message.delete().then(() => true).catch(error => {
        console.error("[Partnership] Failed to delete message " + record.messageId + ":", error);
        return false;
      });
      if (ok) {
        deleted++;
        delete stored[key];
        recordsChanged = true;
      }
    }
  }

  if (recordsChanged) writePartnerships(stored);
  console.log("[Partnership] Removed " + deleted + " ads for departing representative " + userId + ".");

  // Do not DM representatives when they leave; only remove their partnership ads.

  return deleted;
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "partnership") return;

    try {
      if (!hasSeniorHR(interaction)) {
        await interaction.reply({
          content: "Only Senior High Rank can publish partnership advertisements.",
          ephemeral: true
        });
        return;
      }

      if (interaction.options.getSubcommand() !== "ad") return;

      const serverName = interaction.options.getString("server_name", true).trim();
      const advertisement = interaction.options.getString("advertisement", true).trim();
      const representativeUser = interaction.options.getUser("representative", true);

      if (!serverName || !advertisement) {
        await interaction.reply({
          content: "Server name and advertisement text cannot be empty.",
          ephemeral: true
        });
        return;
      }
      if (advertisement.length > 1800) {
        await interaction.reply({
          content: "The advertisement is too long. Please keep it under 1,800 characters.",
          ephemeral: true
        });
        return;
      }

      const guild = interaction.guild;
      const representative = await guild.members.fetch(representativeUser.id).catch(() => null);
      if (!representative) {
        await interaction.reply({
          content: "The representative must be a current member of this server.",
          ephemeral: true
        });
        return;
      }

      const channel = await client.channels.fetch(PARTNERSHIP_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
        await interaction.reply({
          content: "I could not access the configured partnership channel. Check the channel ID and bot permissions.",
          ephemeral: true
        });
        return;
      }

      const role = guild.roles.cache.get(PARTNERSHIP_ROLE_ID);
      if (!role) {
        await interaction.reply({
          content: "I could not find the Partnership role. Check the configured role ID.",
          ephemeral: true
        });
        return;
      }
      if (role.position >= guild.members.me.roles.highest.position) {
        await interaction.reply({
          content: "The Partnership role must be below the bot's highest role.",
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const recordId = guild.id + ":" + representative.id + ":" + Date.now();
      const message = await channel.send({
        content: partnershipMessage(serverName, advertisement, representative.id),
        allowedMentions: { parse: [], users: [representative.id] }
      });

      const stored = readPartnerships();
      stored[recordId] = {
        guildId: guild.id,
        messageId: message.id,
        representativeId: representative.id,
        serverName,
        createdBy: interaction.user.id,
        createdAt: Date.now()
      };
      writePartnerships(stored);

      try {
        if (!representative.roles.cache.has(PARTNERSHIP_ROLE_ID)) {
          await representative.roles.add(role, "Assigned as a partnership advertisement representative");
        }
      } catch (error) {
        console.error("[Partnership] Ad posted but role assignment failed:", error);
        await interaction.editReply({
          content: "The partnership ad was posted, but I could not assign the Partnership role. Check my role hierarchy and Manage Roles permission."
        });
        return;
      }

      await interaction.editReply({
        content: "Partnership advertisement posted in <#" + PARTNERSHIP_CHANNEL_ID + "> for **" +
          safeName(serverName) + "**. <@" + representative.id + "> was assigned the Partnership role."
      });
    } catch (error) {
      console.error("[Partnership] Command failed:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "Something went wrong while publishing the partnership advertisement." }).catch(() => {});
      } else {
        await interaction.reply({
          content: "Something went wrong while publishing the partnership advertisement.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  });

  client.on("guildMemberRemove", async member => {
    try {
      await deleteRepresentativeAds(client, member.guild, member.id);
    } catch (error) {
      console.error("[Partnership] Member-leave cleanup failed:", error);
    }
  });
}

module.exports = { setup, commands: [partnershipCommand] };
