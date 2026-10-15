const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MessageFlags,
} = require("discord.js");

const SESSION_CHANNEL_ID = "1527179992398692353";
const SESSION_NOTIFICATION_ROLE_ID = "1527904654212726844";
const ON_DUTY_ROLE_ID = "1529159979674636450";
const PANEL_MARKER = "msrp-session-panel";
const BANNER_URL = "https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/session-info.png";
const FOOTER_BANNER_URL = "https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/banner.png";
const ERLC_API_URL = "https://api.erlc.gg/v2/server?Players=true&Queue=true&Staff=true";
let liveStats = {
  name: process.env.ERLC_SERVER_NAME || "Missouri State Roleplay",
  owner: process.env.ERLC_SERVER_OWNER || "Unknown",
  ownerId: null,
  code: process.env.ERLC_SERVER_CODE || "Unknown",
  players: process.env.ERLC_PLAYER_COUNT || "Unknown",
  moderating: process.env.ERLC_MODERATING_COUNT || "Unknown",
  queue: process.env.ERLC_QUEUE_COUNT || "Unknown",
  online: null,
};

async function resolveRobloxUsername(userId) {
  try {
    const response = await fetch("https://users.roblox.com/v1/users/" + encodeURIComponent(userId), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return "Unknown";
    const user = await response.json();
    return user.name || user.displayName || "Unknown";
  } catch {
    return "Unknown";
  }
}

async function refreshLiveStats() {
  const key = process.env.ERLC_SERVER_KEY || process.env.ERLC_API_KEY;
  if (!key) {
    console.warn("[Sessions] ERLC_SERVER_KEY is not configured; live ER:LC stats cannot be fetched.");
    return;
  }
  try {
    const response = await fetch(ERLC_API_URL, {
      headers: { "server-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error("[Sessions] ER:LC API failed with HTTP " + response.status + ": " + body.slice(0, 250));
      return;
    }
    const data = JSON.parse(body);
    liveStats.name = data.Name || data.ServerName || liveStats.name;
    liveStats.ownerId = data.OwnerId ?? liveStats.ownerId;
    liveStats.owner = data.Owner || data.ServerOwner || (data.OwnerId ? await resolveRobloxUsername(data.OwnerId) : liveStats.owner);
    liveStats.code = data.JoinKey || data.ServerCode || data.Code || liveStats.code;
    const current = data.CurrentPlayers ?? data.CurrentPlayerCount;
    const max = data.MaxPlayers ?? data.MaxPlayerCount;
    if (current !== undefined) liveStats.players = max !== undefined ? current + "/" + max : String(current);
    const queue = data.Queue ?? data.QueueCount ?? data.InQueue;
    if (Array.isArray(queue)) liveStats.queue = String(queue.length);
    else if (queue !== undefined) liveStats.queue = String(queue);
    const staff = data.Staff ?? data.Moderators ?? data.CurrentlyModerating;
    if (Array.isArray(staff)) liveStats.moderating = String(staff.length);
    else if (staff && typeof staff === "object") {
      const members = Array.isArray(staff) ? staff : Object.values(staff).flatMap(value => Array.isArray(value) ? value : [value]);
      liveStats.moderating = String(members.length);
    } else if (staff !== undefined) liveStats.moderating = String(staff);
    liveStats.online = null;
    console.log("[Sessions] ER:LC live stats refreshed; session status remains unknown until a documented status field is verified.");
  } catch (error) {
    liveStats.online = null;
    console.error("[Sessions] ER:LC stats refresh failed:", error.message);
  }
}

function spacedDivider() { return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large); }

function buildSessionPanel() {
  const safe = value => String(value ?? "Unknown").replace(/[`]/g, "");
  const container = new ContainerBuilder()
    .setAccentColor(0x35a8e0)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item => item.setURL(BANNER_URL)))
    .addSeparatorComponents(spacedDivider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "Our sessions are managed by our **Session Managers**. We do not have an available schedule for sessions, meaning they will commence when our team is available.\n" +
        "**Last Updated:** <t:" + Math.floor(Date.now() / 1000) + ":R>"
      )
    )
    .addSeparatorComponents(spacedDivider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "**Server Name:** ``" + safe(liveStats.name) + "``\n" +
        "**Server Owner:** ``" + safe(liveStats.owner) + "``\n" +
        "**Server Code:** ``" + safe(liveStats.code) + "``"
      )
    )
    .addSeparatorComponents(spacedDivider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "**In-game Players:** ``" + safe(liveStats.players) + "``\n" +
        "**Currently Moderating:** ``" + safe(liveStats.moderating) + "``\n" +
        "**In-Queue Players:** ``" + safe(liveStats.queue) + "``"
      )
    )
    .addSeparatorComponents(spacedDivider())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("session:notification").setLabel("Session Notification").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("session:status").setLabel("Session Status: Unknown").setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    )
    .addSeparatorComponents(spacedDivider())
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item => item.setURL(FOOTER_BANNER_URL)));
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function ensureSessionPanel(client) {
  await refreshLiveStats();
  const guild = client.guilds.cache.first();
  if (guild) {
    try {
      await guild.members.fetch();
      const role = await guild.roles.fetch(ON_DUTY_ROLE_ID);
      if (role) liveStats.moderating = String(role.members.size);
    } catch (error) {
      console.error("[Sessions] Could not count on-duty role members:", error.message);
    }
  }
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
  const matches = recent.filter(message => message.author.id === client.user.id && (JSON.stringify(message.components || []).includes(PANEL_MARKER) || (JSON.stringify(message.components || []).includes("SESSION INFORMATION") && (JSON.stringify(message.components || []).includes(BANNER_URL) || JSON.stringify(message.components || []).includes(FOOTER_BANNER_URL))))).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const existing = matches.first();
  for (const duplicate of matches.toJSON().slice(1)) await duplicate.delete().catch(error => console.error("[Sessions] Could not remove duplicate panel:", error.message));
  if (existing) {
    await existing.edit(buildSessionPanel());
    console.log("[Sessions] Existing Components V2 panel refreshed.");
  } else {
    await channel.send(buildSessionPanel());
    console.log("[Sessions] Components V2 panel posted to channel " + SESSION_CHANNEL_ID + ".");
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

function startSessionRefresh(client) {
  setInterval(async () => {
    await ensureSessionPanel(client).catch(error => console.error("[Sessions] Panel refresh failed:", error));
  }, 60 * 1000);
}

module.exports = { setup: setupSessions, ensureSessionPanel, startSessionRefresh };
