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

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "booster.json");
const BOOSTER_IMAGE_PATH = path.join(__dirname, "booster.png");
const BOOSTER_IMAGE_NAME = "booster.png";

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channelId: null }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { channelId: data.channelId ?? null };
  } catch {
    return { channelId: null };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function buildBoosterMessage(member) {
  const displayName = member.displayName || member.user.username;
  const mention = `<@${member.id}>`;

  const container = new ContainerBuilder()
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
        new MediaGalleryItemBuilder().setURL(`attachment://${BOOSTER_IMAGE_NAME}`)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files: [new AttachmentBuilder(BOOSTER_IMAGE_PATH, { name: BOOSTER_IMAGE_NAME })],
    allowedMentions: { users: [member.id] },
  };
}

async function sendBoosterMessage(client, member) {
  if (!client.boosterData?.channelId) {
    return { ok: false, reason: "NO_CHANNEL" };
  }

  if (!fs.existsSync(BOOSTER_IMAGE_PATH)) {
    return { ok: false, reason: "NO_IMAGE" };
  }

  const channel = await member.guild.channels.fetch(client.boosterData.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    return { ok: false, reason: "INVALID_CHANNEL" };
  }

  await channel.send(buildBoosterMessage(member));
  return { ok: true };
}

function setupBooster(client) {
  client.boosterData = loadData();

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      if (oldMember.premiumSince || !newMember.premiumSince) return;

      const result = await sendBoosterMessage(client, newMember);
      if (!result.ok) {
        if (result.reason === "NO_IMAGE") {
          console.error("Booster message could not be sent: booster.png is missing.");
        }
        return;
      }
    } catch (error) {
      console.error("Booster message error:", error);
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
  if (!isOwner || args[0]?.toLowerCase() !== "booster") return false;

  const action = args[1]?.toLowerCase();

  if (!action) {
    await message.reply("Usage: `!booster #channel` or `!booster test`").catch(() => {});
    return true;
  }

  if (action === "test") {
    if (!client.boosterData?.channelId) {
      await message.reply("You must set a Booster Message channel first with `!booster #channel`.").catch(() => {});
      return true;
    }

    if (!fs.existsSync(BOOSTER_IMAGE_PATH)) {
      await message.reply("I can't run the booster test because `booster.png` is missing from the bot folder.").catch(() => {});
      return true;
    }

    const result = await sendBoosterMessage(client, message.member);
    if (!result.ok) {
      await message.reply("I couldn't send the booster test to the configured channel. Make sure the channel still exists and I can send messages and attach files there.").catch(() => {});
      return true;
    }

    await sendOwnerConfirmation(message, "Booster command executed successfully. Booster test sent.");
    return true;
  }

  if (action === "remove") {
    client.boosterData.channelId = null;
    saveData(client.boosterData);
    await sendOwnerConfirmation(message, "Booster command executed successfully. The Booster Message channel has been removed.");
    return true;
  }

  const channelId = action.match(/^<#(\d+)>$/)?.[1] || action;
  if (!/^\d{15,25}$/.test(channelId)) {
    await message.reply("Usage: `!booster #channel` or `!booster test`").catch(() => {});
    return true;
  }

  const channel = await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    await message.reply("That is not a valid text channel.").catch(() => {});
    return true;
  }

  client.boosterData.channelId = channel.id;
  saveData(client.boosterData);
  await sendOwnerConfirmation(message, `Booster command executed successfully. Booster Message channel set to <#${channel.id}>.`);
  return true;
}

module.exports = { setup: setupBooster, handlePrefixCommand, sendBoosterMessage };
