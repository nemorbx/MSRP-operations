const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const ARRIVALS_CHANNEL_ID = "1527178537600286914";
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

function setupWelcome(client) {
  client.on("guildMemberAdd", async member => {
    try {
      const channel = await member.guild.channels.fetch(ARRIVALS_CHANNEL_ID).catch(error => {
        console.error("[Welcome] Could not fetch welcome channel " + ARRIVALS_CHANNEL_ID + ":", error);
        return null;
      });

      if (!channel) {
        console.error("[Welcome] Welcome channel " + ARRIVALS_CHANNEL_ID + " was not found or is inaccessible.");
        return;
      }
      if (!channel.isTextBased() || typeof channel.send !== "function") {
        console.error("[Welcome] Configured welcome channel " + ARRIVALS_CHANNEL_ID + " is not a sendable text channel.");
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
