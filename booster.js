const fs = require("fs");
const path = require("path");
const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const BOOSTER_IMAGE_PATH = path.join(__dirname, "booster.png");
const BOOSTER_IMAGE_NAME = "booster.png";
const BOOSTER_BANNER_PATH = path.join(__dirname, "booster-banner.png");
const BOOSTER_BANNER_NAME = "booster-banner.png";
const BOOSTER_CHANNEL_ID = "1527194109494693938";

function buildBoosterMessage(member) {
  const displayName = member.displayName || member.user.username;
  const mention = `<@${member.id}>`;

  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${BOOSTER_IMAGE_NAME}`)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Thank You for Boosting!\n${mention}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Thank you for taking us to the next level!\n\nWe now have **current boosts**, and you also get some **server benefits** for supporting Missouri State Roleplay.\n\nThank you, **${displayName}**, for supporting MSRP!`
      )
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${BOOSTER_BANNER_NAME}`)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files: [
      new AttachmentBuilder(BOOSTER_IMAGE_PATH, { name: BOOSTER_IMAGE_NAME }),
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

  await channel.send(buildBoosterMessage(member));
  return { ok: true };
}

async function isBotOwner(client, userId) {
  try {
    await client.application.fetch();
    const owner = client.application.owner;
    if (!owner) return false;
    if (owner.members) return owner.members.has(userId);
    return owner.id === userId;
  } catch (error) {
    console.error("Unable to verify bot owner for !boost:", error);
    return false;
  }
}

function setupBooster(client) {
  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || !/^!boost(?:\s|$)/i.test(message.content.trim())) return;

    if (!(await isBotOwner(client, message.author.id))) {
      await message.reply("Only the bot owner can use `!boost`.").catch(() => {});
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
          ? "I couldn't find `booster.png` or `booster-banner.png` in the bot folder."
          : "I couldn't send the simulated boost message. Check that the supporters channel exists and I have permission to send messages and attach files.";
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
