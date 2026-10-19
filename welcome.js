const fs = require("fs");
const path = require("path");
const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const ARRIVALS_CHANNEL_ID = "1527178537600286914";
const VERIFY_URL = "https://blox.link/dashboard/user/verifications/verify";
const WELCOME_EMOJI = "<:image_20260331_002936379:1488319316247183434>";

const WELCOME_MESSAGES = [
  "Welcome to **Missouri State Roleplay**, <@{member}>! You’re our **{count}th** member. We’re glad you’re here!",
  "Hey <@{member}>, welcome to **Missouri State Roleplay**! You’re member **#{count}**. Have a great time with us!",
  "A new member has arrived! Welcome, <@{member}>, to **Missouri State Roleplay** — member **#{count}**!",
  "Welcome aboard, <@{member}>! Thanks for joining **Missouri State Roleplay** as our **{count}th** member!",
  "Everyone give a warm welcome to <@{member}>! You’re now part of **Missouri State Roleplay**, member **#{count}**!"
];

function buildWelcomeMessage(member) {
  const memberCount = member.guild.memberCount.toLocaleString("en-US");
  const selected = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
    .replaceAll("{member}", member.id)
    .replaceAll("{count}", memberCount);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        WELCOME_EMOJI + " `` - `` " + selected + "\n-# Please verify to access all channels and stop in-game private messages."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("msrp_welcome_verify_unavailable").setLabel("Verify").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("msrp_welcome_member_count").setLabel(memberCount).setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [member.id] } };
}
function buildWelcomeMessage(member) {
  const memberCount = member.guild.memberCount.toLocaleString("en-US");
  const selected = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
    .replaceAll("{member}", member.id)
    .replaceAll("{count}", memberCount);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        WELCOME_EMOJI + " `` - `` " + selected + "\n-# Please verify to access all channels and stop in-game private messages."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("msrp_welcome_verify_unavailable").setLabel("Verify").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("msrp_welcome_member_count").setLabel(memberCount).setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [member.id] } };
}
function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ autoNicknameEnabled: false }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { autoNicknameEnabled: data.autoNicknameEnabled === true };
  } catch {
    return { autoNicknameEnabled: false };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ autoNicknameEnabled: data.autoNicknameEnabled === true }, null, 2), "utf8");
}

async function isBotOwner(interaction) {
  try {
    const application = await interaction.client.application.fetch();
    const owner = application.owner;

    if (!owner) return false;

    if (owner.members) {
      return owner.members.has(interaction.user.id);
    }

    return owner.id === interaction.user.id;
  } catch (error) {
    console.error("Unable to verify bot owner:", error);
    return false;
  }
}


const autoNicknameCommand = new SlashCommandBuilder()
  .setName("autonickname")
  .setDescription("Enable or disable automatic random nicknames for new members.")
  .addStringOption(option =>
    option
      .setName("action")
      .setDescription("Choose whether automatic random nicknames are enabled or disabled.")
      .setRequired(true)
      .addChoices(
        { name: "Enable", value: "enable" },
        { name: "Disable", value: "disable" }
      )
  );

function setupWelcome(client) {
  client.on("guildMemberAdd", async member => {
    try {
      const channelId = ARRIVALS_CHANNEL_ID;
      const channel = await member.guild.channels.fetch(channelId).catch(error => {
        console.error("[Welcome] Could not fetch welcome channel " + channelId + ":", error);
        return null;
      });

      if (!channel) {
        console.error("[Welcome] Welcome channel " + channelId + " was not found or is inaccessible.");
        return;
      }
      if (!channel.isTextBased() || !channel.send) {
        console.error("[Welcome] Configured welcome channel " + channelId + " is not a sendable text channel.");
        return;
      }

      const botMember = member.guild.members.me;
      const permissions = botMember ? channel.permissionsFor(botMember) : null;
      if (!permissions?.has(["ViewChannel", "SendMessages"])) {
        console.error("[Welcome] Missing View Channel or Send Messages permission in #" + channel.name + " (" + channel.id + ").");
        return;
      }

      await channel.send(buildWelcomeMessage(member));
      console.log("[Welcome] Sent welcome message for " + member.user.tag + " in #" + channel.name + ".");
    } catch (error) {
      console.error("Welcome message error:", error);
    }
  });
}

module.exports = {
  setup: setupWelcome,
  commands: [],
};
