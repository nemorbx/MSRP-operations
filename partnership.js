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
    .setDescription("Post a partnership ad and assign up to three representatives.")
    .addStringOption(option => option
      .setName("advertisement")
      .setDescription("Full partnership advertisement text.")
      .setRequired(true)
      .setMaxLength(1800))
    .addUserOption(option => option
      .setName("representative")
      .setDescription("First partnership representative.")
      .setRequired(true))
    .addUserOption(option => option
      .setName("representative2")
      .setDescription("Second representative (optional).")
      .setRequired(false))
    .addUserOption(option => option
      .setName("representative3")
      .setDescription("Third representative (optional).")
      .setRequired(false))
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

function partnershipMessage(advertisement, representativeId) {
  return safeName(advertisement) + "\n\n" +
    "**Representative:** <@" + representativeId + ">";
}

async function deleteRepresentativeAds(client, guild, userId) {
  const stored = readPartnerships();
  const records = Object.entries(stored).filter(([, record]) =>
    record.guildId === guild.id && (record.representativeId === userId || record.representativeIds?.includes(userId))
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

      const advertisement = interaction.options.getString("advertisement", true).trim();
      const representativeUsers = [
        interaction.options.getUser("representative", true),
        interaction.options.getUser("representative2"),
        interaction.options.getUser("representative3"),
      ].filter(Boolean);
      const representativeIds = [...new Set(representativeUsers.map(user => user.id))];
      if (representativeIds.length !== representativeUsers.length) {
        await interaction.reply({ content: "Choose a different member for each representative slot.", ephemeral: true });
        return;
      }

      if (!advertisement) {
        await interaction.reply({
          content: "Advertisement text cannot be empty.",
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
      const representatives = [];
      for (const representativeId of representativeIds) {
        const representative = await guild.members.fetch(representativeId).catch(() => null);
        if (!representative) {
          await interaction.reply({ content: "All representatives must be current members of this server.", ephemeral: true });
          return;
        }
        representatives.push(representative);
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

      const recordId = guild.id + ":" + representativeIds.join("-") + ":" + Date.now();
      const message = await channel.send({
        content: partnershipMessage(advertisement, representativeIds),
        allowedMentions: { parse: [], users: representativeIds }
      });

      const stored = readPartnerships();
      stored[recordId] = {
        guildId: guild.id,
        messageId: message.id,
        representativeId: representativeIds[0],
        representativeIds,
        createdBy: interaction.user.id,
        createdAt: Date.now()
      };
      writePartnerships(stored);

      try {
        for (const representative of representatives) {
          if (!representative.roles.cache.has(PARTNERSHIP_ROLE_ID)) {
            await representative.roles.add(role, "Assigned as a partnership advertisement representative");
          }
        }
      } catch (error) {
        console.error("[Partnership] Ad posted but role assignment failed:", error);
        await interaction.editReply({ content: "The partnership ad was posted, but I could not assign the Partnership role to everyone. Check my role hierarchy and Manage Roles permission." });
        return;
      }

      await interaction.editReply({
        content: "Partnership advertisement posted in <#" + PARTNERSHIP_CHANNEL_ID + ">. Assigned the Partnership role to: " + representativeIds.map(id => "<@" + id + ">").join(", ") + "."
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
