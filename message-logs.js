const {
  AuditLogEvent,
  EmbedBuilder,
} = require("discord.js");

const MESSAGE_LOG_CHANNEL_ID = "1529868351663378433";
const RED = 0xED4245;
const YELLOW = 0xFEE75C;
const BLUE = 0x3498DB;
const MAX_FIELD = 1024;

function clip(value, max = MAX_FIELD) {
  const text = String(value ?? "").trim() || "[No message content]";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function timestamp(ms) {
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:F>\n<t:${unix}:R>`;
}

async function getLogChannel(guild) {
  const channel = await guild.channels.fetch(MESSAGE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) return null;
  return channel;
}

function authorInfo(message) {
  const user = message.author;
  return {
    name: user?.tag || user?.username || "Unknown User",
    avatar: user?.displayAvatarURL({ extension: "png", size: 256 }) || null,
    mention: user?.id ? `<@${user.id}>` : "Unknown User",
  };
}

async function sendDeletedLog(message, deleter) {
  if (!message.guild || message.author?.bot) return;

  const channel = await getLogChannel(message.guild);
  if (!channel) return;

  const author = authorInfo(message);
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle("Message Deleted")
    .setAuthor({ name: author.name, iconURL: author.avatar || undefined })
    .addFields(
      { name: "Message From", value: `${author.mention}\n${author.name}`, inline: false },
      { name: "Message Content", value: clip(message.content), inline: false },
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
      { name: "Deleted By", value: deleter || `<@${message.client.user.id}>`, inline: true },
      { name: "Message Date & Time", value: timestamp(message.createdTimestamp), inline: false },
    )
    .setTimestamp();

  const attachments = [...message.attachments.values()];
  if (attachments.length) {
    const urls = attachments.map(a => a.url).join("\n");
    embed.addFields({ name: "Attachments", value: clip(urls), inline: false });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function findHumanDeleter(message) {
  try {
    const logs = await message.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 10,
    });

    const now = Date.now();
    const entry = logs.entries.find(entry => {
      const age = now - entry.createdTimestamp;
      if (age < 0 || age > 10000) return false;
      if (entry.target?.id !== message.author?.id) return false;
      const channelId = entry.extra?.channel?.id || entry.extra?.channelId;
      return !channelId || channelId === message.channel.id;
    });

    if (!entry?.executor) return `<@${message.client.user.id}>`;
    return `<@${entry.executor.id}>`;
  } catch (error) {
    console.error("Message delete audit-log lookup failed:", error);
    return `<@${message.client.user.id}>`;
  }
}

async function sendEditedLog(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const channel = await getLogChannel(newMessage.guild);
  if (!channel) return;

  const author = authorInfo(newMessage);
  const embed = new EmbedBuilder()
    .setColor(YELLOW)
    .setTitle("Message Edited")
    .setAuthor({ name: author.name, iconURL: author.avatar || undefined })
    .addFields(
      { name: "Message From", value: `${author.mention}\n${author.name}`, inline: false },
      { name: "Before", value: clip(oldMessage.content), inline: false },
      { name: "After", value: clip(newMessage.content), inline: false },
      { name: "Channel", value: `<#${newMessage.channel.id}>`, inline: true },
      { name: "Message Date & Time", value: timestamp(newMessage.createdTimestamp), inline: false },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendPurgeLog(client, guild, purgeInfo) {
  const channel = await getLogChannel(guild);
  if (!channel) return;

  const executor = purgeInfo.executorId ? `<@${purgeInfo.executorId}>` : `<@${client.user.id}>`;
  const commandText = purgeInfo.amount ? `!purge ${purgeInfo.amount}` : "!purge";
  const messageCount = purgeInfo.deletedCount;

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle("Messages Purged")
    .setDescription(`${executor} purged multiple messages from this channel.`)
    .addFields(
      { name: "Purged By", value: executor, inline: true },
      { name: "Messages Deleted", value: `**${messageCount}**`, inline: true },
      { name: "Channel", value: `<#${purgeInfo.channelId}>`, inline: true },
      { name: "Command", value: `\`${commandText}\``, inline: true },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

function setupMessageLogs(client) {
  // Message IDs deleted by the purge system. These are intentionally suppressed
  // from the normal red "Message Deleted" logs so one purge creates one blue log.
  client.messageLogPurgeDeletes = new Set();

  client.on("messageDelete", async message => {
    try {
      if (!message.guild || message.author?.bot) return;

      if (client.messageLogPurgeDeletes.has(message.id)) {
        client.messageLogPurgeDeletes.delete(message.id);
        return;
      }

      const deleter = await findHumanDeleter(message);
      await sendDeletedLog(message, deleter);
    } catch (error) {
      console.error("Message deletion logging error:", error);
    }
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    try {
      if (oldMessage.partial) await oldMessage.fetch().catch(() => {});
      if (newMessage.partial) await newMessage.fetch().catch(() => {});
      await sendEditedLog(oldMessage, newMessage);
    } catch (error) {
      console.error("Message edit logging error:", error);
    }
  });

  client.sendPurgeLog = (guild, purgeInfo) => sendPurgeLog(client, guild, purgeInfo);
}

module.exports = {
  setup: setupMessageLogs,
  MESSAGE_LOG_CHANNEL_ID,
};
