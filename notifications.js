const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require("discord.js");

const NOTIFICATION_CHANNEL_ID = "1560172255839780976";
const TOP_BANNER = "notification.png";
const FOOTER_BANNER = "banner.png";
const PANEL_VERSION = 2;
const PANEL_MARKER = "\u200B".repeat(PANEL_VERSION);
const EMOJIS = {
  announcement: { name: "megaphone", id: "1563317451851178034" },
  giveaway: { name: "Gift", id: "1563315876634300426" },
  chat: { name: "Chat", id: "1563315621725216920" },
  session: { name: "Controller", id: "1563315205923147806" },
};
const NOTIFICATIONS = {
  announcement: {
    label: "Announcement Notification",
    roleId: "1527904608595349655",
    emoji: EMOJIS.announcement,
  },
  giveaway: {
    label: "Giveaway Notification",
    roleId: "1527904721669460100",
    emoji: EMOJIS.giveaway,
  },
  chat: {
    label: "Active Chat Notification",
    roleId: "1563319982895403019",
    emoji: EMOJIS.chat,
  },
  session: {
    label: "Session Notification",
    roleId: "1527904654212726844",
    emoji: EMOJIS.session,
  },
};
let refreshPromise = null;

function separator() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function addBanner(container, filename) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://" + filename)
    )
  );
}

function buildPanel() {
  const container = new ContainerBuilder();
  addBanner(container, TOP_BANNER);
  container.addSeparatorComponents(separator());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> Select a role below to get notified whenever something happens on our Discord. You can manage the pings you receive for sessions, announcements and more at any time." + PANEL_MARKER
    )
  );
  container.addSeparatorComponents(separator());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> <:megaphone:1563317451851178034> **Announcement Notification**\n" +
      "> <:Gift:1563315876634300426> **Giveaway Notification**\n" +
      "> <:Chat:1563315621725216920> **Active Chat Notification**\n" +
      "> <:Controller:1563315205923147806> **Session Notification**"
    )
  );
  container.addSeparatorComponents(separator());
  const buttons = Object.entries(NOTIFICATIONS).map(([key, item]) =>
    new ButtonBuilder()
      .setCustomId("notifications:" + key)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: item.emoji.id, name: item.emoji.name })
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  container.addSeparatorComponents(separator());
  addBanner(container, FOOTER_BANNER);
  return container;
}

function isNotificationPanel(message) {
  const components = JSON.stringify(message.components || []);
  return (
    components.includes("Announcement Notification") ||
    components.includes(PANEL_MARKER) ||
    message.attachments?.some(attachment => attachment.name === TOP_BANNER)
  );
}

async function ensureNotificationPanel(client) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refresh(client);
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refresh(client) {
  const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.messages || !channel.send) {
    console.error("[Notifications] Channel " + NOTIFICATION_CHANNEL_ID + " is missing or not text-based.");
    return;
  }

  const topPath = path.join(__dirname, TOP_BANNER);
  const footerPath = path.join(__dirname, FOOTER_BANNER);
  if (!fs.existsSync(topPath) || !fs.existsSync(footerPath)) {
    console.error("[Notifications] Required images missing: " + [
      !fs.existsSync(topPath) ? TOP_BANNER : null,
      !fs.existsSync(footerPath) ? FOOTER_BANNER : null,
    ].filter(Boolean).join(", "));
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(error => {
    console.error("[Notifications] Could not inspect existing panel messages:", error);
    return null;
  });
  if (!messages) return;

  const oldPanels = [...messages.values()].filter(message =>
    message.author?.id === client.user.id && isNotificationPanel(message)
  );
  const current = oldPanels.find(message =>
    JSON.stringify(message.components || []).includes(PANEL_MARKER)
  );

  if (current) {
    for (const duplicate of oldPanels) {
      if (duplicate.id !== current.id) {
        await duplicate.delete().catch(error => console.error("[Notifications] Could not delete duplicate panel:", error));
      }
    }
    console.log("[Notifications] Panel is already current.");
    return;
  }

  // Replace the prior bot-owned notification panel(s) in the configured channel.
  for (const oldPanel of oldPanels) {
    await oldPanel.delete().catch(error => console.error("[Notifications] Could not delete old panel:", error));
  }

  await channel.send({
    components: [buildPanel()],
    files: [
      { attachment: topPath, name: TOP_BANNER },
      { attachment: footerPath, name: FOOTER_BANNER },
    ],
    attachments: [],
    flags: MessageFlags.IsComponentsV2,
  });
  console.log("[Notifications] Reaction-role panel posted or refreshed.");
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("notifications:")) return;
    const key = interaction.customId.slice("notifications:".length);
    const config = NOTIFICATIONS[key];
    if (!config) return;

    if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
      await interaction.reply({ content: "These notification buttons can only be used in the MSRP server.", ephemeral: true }).catch(() => {});
      return;
    }

    const role = await interaction.guild.roles.fetch(config.roleId).catch(() => null);
    if (!role) {
      await interaction.reply({ content: "I couldn't find the " + config.label + " role. Please notify server management.", ephemeral: true }).catch(() => {});
      console.error("[Notifications] Configured role not found: " + config.roleId + " (" + config.label + ")");
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const botMember = interaction.guild.members.me;
    if (!member || !botMember || role.managed || role.position >= botMember.roles.highest.position) {
      await interaction.reply({ content: "I can't manage that notification role. Please contact server management.", ephemeral: true }).catch(() => {});
      console.error("[Notifications] Role hierarchy or member check failed for role " + config.roleId);
      return;
    }

    try {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "Member opted out of " + config.label);
        await interaction.reply({
          content: "The **" + config.label + "** role has been removed.",
          ephemeral: true,
        });
      } else {
        await member.roles.add(role, "Member opted into " + config.label);
        await interaction.reply({
          content: "You've been given the <@&" + role.id + "> role.",
          allowedMentions: { roles: [] },
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[Notifications] Failed to toggle role " + config.roleId + " for " + interaction.user.id + ":", error);
      const response = {
        content: "I couldn't update that notification role. Please check the bot's Manage Roles permission and role hierarchy.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(() => {});
      } else {
        await interaction.reply(response).catch(() => {});
      }
    }
  });
}

module.exports = { setup, ensureNotificationPanel };
