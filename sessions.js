const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const SESSION_CHANNEL_ID = "1527179992398692353";
const SESSION_NOTIFICATION_ROLE_ID = "1527904654212726844";
const PANEL_MARKER = "msrp-session-panel";

function buildSessionPanel() {
  const online = process.env.ERLC_SESSION_ONLINE === "true";
  const inlineCode = value => "``" + String(value ?? "Not connected").replace(/`/g, "") + "``";
  const embed = new EmbedBuilder()
    .setColor(online ? 0x35b56a : 0xe04444)
    .setDescription(
      "> Our sessions are managed by our **Session Managers**. We do not have an available schedule for sessions, meaning they will commence when our team is available.\n" +
      "> **Last Updated:** <t:" + Math.floor(Date.now() / 1000) + ":R>\n\n" +
      "> **Server Name:** " + inlineCode(process.env.ERLC_SERVER_NAME || "Missouri State Roleplay") + "\n" +
      "> **Server Owner:** " + inlineCode(process.env.ERLC_SERVER_OWNER || "Not connected") + "\n" +
      "> **Server Code:** " + inlineCode(process.env.ERLC_SERVER_CODE || "Not connected") + "\n\n" +
      "> **In-game Players:** " + inlineCode(process.env.ERLC_PLAYER_COUNT || "Not connected") + "\n" +
      "> **Currently Moderating:** " + inlineCode(process.env.ERLC_MODERATING_COUNT || "Not connected") + "\n" +
      "> **In-Queue Players:** " + inlineCode(process.env.ERLC_QUEUE_COUNT || "Not connected")
    )
    .setFooter({ text: PANEL_MARKER });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("session:notification").setLabel("Session Notification").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("session:status").setLabel(online ? "Session Online" : "Session Offline").setStyle(online ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(true)
      )
    ]
  };
}

async function ensureSessionPanel(client) {
  const channel = await client.channels.fetch(SESSION_CHANNEL_ID).catch(error => {
    console.error("[Sessions] Could not fetch sessions channel:", error.message);
    return null;
  });
  if (!channel?.isTextBased() || !channel.messages) {
    console.error("[Sessions] Sessions channel is unavailable or is not a text channel.");
    return;
  }
  const recent = await channel.messages.fetch({ limit: 50 }).catch(error => {
    console.error("[Sessions] Could not inspect existing messages:", error.message);
    return null;
  });
  if (!recent) return;
  const existing = recent.find(message => message.author.id === client.user.id && message.embeds.some(embed => embed.footer?.text === PANEL_MARKER));
  if (existing) {
    await existing.edit(buildSessionPanel());
    console.log("[Sessions] Existing panel refreshed.");
  } else {
    await channel.send(buildSessionPanel());
    console.log("[Sessions] Panel posted to channel " + SESSION_CHANNEL_ID + ".");
  }
}

function setupSessions(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || interaction.customId !== "session:notification") return;
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const role = interaction.guild.roles.cache.get(SESSION_NOTIFICATION_ROLE_ID);
      if (!role) {
        await interaction.reply({ content: "The session notification role could not be found.", ephemeral: true });
        return;
      }
      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        await interaction.reply({ content: "Move the notification role below the bot's highest role so I can manage it.", ephemeral: true });
        return;
      }
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "Session notification opt-out");
        await interaction.reply({ content: "Session notifications disabled; your role was removed.", ephemeral: true });
      } else {
        await member.roles.add(role, "Session notification opt-in");
        await interaction.reply({ content: "Session notifications enabled; the role was added.", ephemeral: true });
      }
    } catch (error) {
      console.error("[Sessions] Role toggle failed:", error);
      const response = { content: "I couldn't update your role. Check my Manage Roles permission and role hierarchy.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
  });
}

module.exports = { setup: setupSessions, ensureSessionPanel };
