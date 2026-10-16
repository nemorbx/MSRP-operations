const fs = require("fs");
const path = require("path");
const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require("discord.js");

const BOOSTER_IMAGE_PATH = path.join(__dirname, "booster.png");
const BOOSTER_IMAGE_NAME = "booster.png";
const BOOSTER_BANNER_PATH = path.join(__dirname, "booster-banner.png");
const BOOSTER_BANNER_NAME = "booster-banner.png";
const BOOSTER_CHANNEL_ID = "1527194109494693938";
const PERKS_CHANNEL_ID = "1560123150635630672";

function banner(name) {
  const url = name === BOOSTER_IMAGE_NAME
    ? "https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/booster.png"
    : `attachment://${name}`;
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(url)
  );
}

async function getBoostCount(guild) {
  try {
    const boosts = await guild.fetch();
    return boosts.premiumSubscriptionCount ?? guild.premiumSubscriptionCount ?? 0;
  } catch {
    return guild.premiumSubscriptionCount ?? 0;
  }
}

function buildBoosterMessage(member, boostCount) {
  const displayName = member.displayName || member.user.username;
  const mention = `<@${member.id}>`;
  const perks = [
    "> Access to Booster Vehicles",
    "> Unlocks: Falcon Heritage Track, Surrey 650S, Falcon Heritage, Takeo Experience, Chevlon Corbeta 8, Averon LM/LR, Chevlon Corbeta RZR, and Chevlon Corbeta X08.",
    "> Access to Booster Weapons",
    "> Unlocks: PPSH 41, M14, Remington 870, and Colt Python.",
    "> Permission to stream in all voice-perks channels.",
    "> 75,000 in-game economy cash.",
  ].join("\n");

  const container = new ContainerBuilder()
    .addMediaGalleryComponents(banner(BOOSTER_IMAGE_NAME))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Server Boost\n${mention}`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Thank you for taking us to the next level! We now have **${boostCount} server boost${boostCount === 1 ? "" : "s"}**, and here are some benefits you unlock by supporting Missouri State Roleplay:\n\n${perks}\n\nYou can view more perks in <#${PERKS_CHANNEL_ID}>.\n\nThank you, **${displayName}**, for supporting MSRP!`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addMediaGalleryComponents(banner(BOOSTER_BANNER_NAME));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files: [
      new AttachmentBuilder(BOOSTER_BANNER_PATH, { name: BOOSTER_BANNER_NAME }),
    ],
    allowedMentions: { users: [member.id] },
  };
}

async function sendBoosterMessage(client, member) {
  if (!fs.existsSync(BOOSTER_IMAGE_PATH) || !fs.existsSync(BOOSTER_BANNER_PATH)) {
    return { ok: false, reason: "NO_IMAGE" };
  }

  const channel = await member.guild.channels.fetch(BOOSTER_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    return { ok: false, reason: "INVALID_CHANNEL" };
  }

  const boostCount = await getBoostCount(member.guild);
  await channel.send(buildBoosterMessage(member, boostCount));
  return { ok: true };
}

function setupBooster(client) {
  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || !/^!boost(?:\s|$)/i.test(message.content.trim())) return;

    if (message.guild.ownerId !== message.author.id) {
      await message.reply("Only the server owner can use `!boost`.").catch(() => {});
      return;
    }

    const parts = message.content.trim().split(/\s+/);
    const target = message.mentions.members.first();
    if (!target || parts.length !== 2) {
      await message.reply("Usage: `!boost @user`").catch(() => {});
      return;
    }

    try {
      const result = await sendBoosterMessage(client, target);
      if (!result.ok) {
        const reason = result.reason === "NO_IMAGE"
          ? "I couldn't find `booster.png` or `booster-banner.png` in the bot folder. Make sure both files are uploaded to the repository and deployed to the bot host."
          : "I couldn't send the boost message. Check the supporters channel and the bot's permissions to send messages and attach files.";
        await message.reply(reason).catch(() => {});
        return;
      }
      const confirmation = await message.reply(`Test boost message sent for ${target}.`).catch(() => null);
      if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), 4000);
    } catch (error) {
      console.error("!boost command error:", error);
      await message.reply("The boost test failed. Check the bot logs for details.").catch(() => {});
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      if (oldMember.premiumSince || !newMember.premiumSince) return;
      const result = await sendBoosterMessage(client, newMember);
      if (!result.ok) console.error("Automatic booster message could not be sent:", result.reason);
    } catch (error) {
      console.error("Booster message error:", error);
    }
  });
}

module.exports = { setup: setupBooster, sendBoosterMessage };
