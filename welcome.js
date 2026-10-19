const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const ARRIVALS_CHANNEL_ID = "1527178537600286914";
function getWelcomeEmoji(guild) {
  const emoji = guild.emojis.cache.find(item => item.name === "Missouri");
  return emoji ? `<:${emoji.name}:${emoji.id}>` : "🇺🇸";
}

function ordinal(number) {
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" })[number % 10] || "th";
  return `${number}${suffix}`;
}

function buildWelcomeMessage(member) {
  const memberCount = member.guild.memberCount;
  const formattedCount = memberCount.toLocaleString("en-US");
  const welcomeEmoji = getWelcomeEmoji(member.guild);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${welcomeEmoji} `` - `` Welcome aboard, <@${member.id}>! Thanks for joining **Missouri State Roleplay** as our **${ordinal(memberCount)}** member!\n-# Please verify to access all channels and stop in-game private messages.`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Verify")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${member.guild.id}/1528566337394446456`),
        new ButtonBuilder().setLabel(formattedCount).setCustomId("msrp_welcome_member_count").setStyle(ButtonStyle.Secondary).setDisabled(true)
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
