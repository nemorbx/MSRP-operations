const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");

const REQUEST_CHANNEL_ID = "1563294757994635275";
const ON_DUTY_ROLE_ID = "1529159979674636450";
const STAFF_TEAM_ROLE_ID = "1528242210871447672";
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "roleplay-requests.json");
const BANNER_URL = "https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/banner.png";
const ERLC_API_URL = "https://api.erlc.gg/v2/server?Players=true&Queue=true&Staff=true";

function readData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ cooldowns: {}, requests: {} }, null, 2));
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { cooldowns: data.cooldowns || {}, requests: data.requests || {} };
  } catch (error) {
    console.error("[Roleplay Requests] Could not read data:", error);
    return { cooldowns: {}, requests: {} };
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isVerified(member) {
  return member.roles.cache.some(role => /^(verified|verified member)$/i.test(role.name.trim()));
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function buildRequestPanel(record, status = "pending") {
  const statusLine = status === "accepted"
    ? "\n\n-# Accepted by <@" + record.acceptedBy + ">"
    : status === "denied"
      ? "\n\n-# Denied by <@" + record.reviewedBy + ">"
      : "";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "## Roleplay Requested\n" +
      "**Requested By:** ``" + record.requesterName + ":" + record.requesterId + "``\n" +
      "**Participants:** ``" + record.usernames + "``\n" +
      "**Location:** ``" + record.location + "``\n" +
      "**Type:** ``" + record.type + "``\n" +
      "**End Time:** ``" + record.endtime + "``" +
      statusLine
    ))
    .addSeparatorComponents(divider());

  if (status === "pending") {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("roleplay:accept:" + record.id).setLabel("Accept Request").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("roleplay:deny:" + record.id).setLabel("Deny Request").setStyle(ButtonStyle.Secondary)
    ));
    container.addSeparatorComponents(divider());
  } else {
    container.addSeparatorComponents(divider());
  }

  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(BANNER_URL)
  ));
  return container;
}

async function isGameServerActive() {
  const key = process.env.ERLC_SERVER_KEY || process.env.ERLC_API_KEY;
  if (!key) return { active: false, reason: "The ER:LC server status cannot be verified because the server API key is not configured." };
  try {
    const response = await fetch(ERLC_API_URL, {
      headers: { "server-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = (await response.text()).toLowerCase();
      if (body.includes("server offline") || body.includes("server is offline") || body.includes("3002")) {
        return { active: false, reason: "The ER:LC server is currently offline. Role-play requests can only be submitted while the server is active." };
      }
      return { active: false, reason: "I couldn't verify that the ER:LC server is active. Please try again shortly." };
    }
    return { active: true };
  } catch (error) {
    console.error("[Roleplay Requests] ER:LC status check failed:", error.message);
    return { active: false, reason: "I couldn't verify that the ER:LC server is active. Please try again shortly." };
  }
}

const roleplayRequestCommand = new SlashCommandBuilder()
  .setName("roleplay")
  .setDescription("Submit a role-play request")
  .addSubcommand(subcommand => subcommand
    .setName("request")
    .setDescription("Request a role-play scenario")
    .addStringOption(option => option.setName("usernames").setDescription("Participant usernames; separate multiple usernames with commas").setRequired(true).setMaxLength(500))
    .addStringOption(option => option.setName("location").setDescription("Where the role-play will happen").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("type").setDescription("Role-play scenario type").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("endtime").setDescription("Expected end time or duration (e.g. 2 hours, 5:00 PM CDT)").setRequired(true).setMaxLength(100)));

function setupRoleplayRequests(client) {
  client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === "roleplay" && interaction.options.getSubcommand() === "request") {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: "Role-play requests can only be submitted in the MSRP server.", flags: MessageFlags.Ephemeral });
        return;
      }

      const requester = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!requester || !isVerified(requester)) {
        await interaction.reply({
          content: "You must have the Verified role to submit a role-play request.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const now = Date.now();
      const data = readData();
      const cooldownUntil = Number(data.cooldowns[interaction.user.id] || 0);
      if (cooldownUntil > now) {
        await interaction.reply({
          content: "You can submit one role-play request every 6 hours. You may submit another " + "<t:" + Math.floor(cooldownUntil / 1000) + ":R>.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const serverStatus = await isGameServerActive();
      if (!serverStatus.active) {
        await interaction.reply({ content: serverStatus.reason, flags: MessageFlags.Ephemeral });
        return;
      }

      const channel = await client.channels.fetch(REQUEST_CHANNEL_ID).catch(() => null);
      if (!channel?.isTextBased() || typeof channel.send !== "function") {
        await interaction.reply({ content: "The role-play request channel is unavailable. Please contact server management.", flags: MessageFlags.Ephemeral });
        return;
      }

      const record = {
        id: interaction.id,
        requesterId: interaction.user.id,
        requesterName: interaction.user.username,
        usernames: interaction.options.getString("usernames", true).trim(),
        location: interaction.options.getString("location", true).trim(),
        type: interaction.options.getString("type", true).trim(),
        endtime: interaction.options.getString("endtime", true).trim(),
        createdAt: now,
        status: "pending",
        acceptedBy: null,
        reviewedBy: null,
      };

      if (!record.usernames || !record.location || !record.type || !record.endtime) {
        await interaction.reply({ content: "Please fill in every role-play request field.", flags: MessageFlags.Ephemeral });
        return;
      }

      try {
        const message = await channel.send({
          components: [
            new ContainerBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent("<@&" + ON_DUTY_ROLE_ID + ">"))
              .addSeparatorComponents(divider()),
            buildRequestPanel(record),
          ],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { roles: [ON_DUTY_ROLE_ID] },
        });
        record.messageId = message.id;
        data.requests[record.id] = record;
        data.cooldowns[interaction.user.id] = now + COOLDOWN_MS;
        saveData(data);
        await interaction.reply({ content: "Your role-play request has been submitted and the on-duty staff have been notified.", flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error("[Roleplay Requests] Could not post request:", error);
        await interaction.reply({ content: "I couldn't submit your role-play request. Please try again or contact staff.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }

    if (!interaction.isButton() || !interaction.customId.startsWith("roleplay:")) return;
    const [, action, requestId] = interaction.customId.split(":");
    const data = readData();
    const record = data.requests[requestId];
    if (!record || record.status !== "pending") {
      await interaction.reply({ content: "This role-play request has already been reviewed or is no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles?.cache?.has(STAFF_TEAM_ROLE_ID)) {
      await interaction.reply({ content: "Only members of the Staff Team can accept or deny role-play requests.", flags: MessageFlags.Ephemeral });
      return;
    }

    record.status = action === "accept" ? "accepted" : "denied";
    record.acceptedBy = action === "accept" ? interaction.user.id : null;
    record.reviewedBy = interaction.user.id;
    record.reviewedAt = Date.now();
    data.requests[requestId] = record;
    saveData(data);

    try {
      await interaction.update({
        components: [buildRequestPanel(record, record.status)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error("[Roleplay Requests] Could not update request panel:", error);
      await interaction.followUp({ content: "The request status was saved, but I couldn't update the message.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { setup: setupRoleplayRequests, commands: [roleplayRequestCommand] };
