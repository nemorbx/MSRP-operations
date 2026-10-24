const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ContainerBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const SUPPORT_CHANNEL_ID = "1527396975295856810";
const SUPPORT_TEAM_ROLE_ID = "1551966555212877834";
const INTERNAL_AFFAIRS_TEAM_ROLE_ID = "1527381477975789668";
const MANAGEMENT_TEAM_ROLE_ID = "1528426569012609106";
const SENIOR_HR_ROLE_ID = "1551704056991318191";
const HIGH_RANK_ROLE_ID = "1551704115350999143";
const SUPPORT_LOGS_CHANNEL_ID = "1552509962910171176";
const SUPPORT_PANEL_VERSION = 9;
const SUPPORT_PANEL_MARKER = "\u200B".repeat(SUPPORT_PANEL_VERSION);
let supportPanelRefreshPromise = null;
const closureRequestTimers = new Map();
const CLOSURE_RESPONSE_TIMEOUT_MS = 60 * 60 * 1000;

const DATA_DIR = path.join(__dirname, "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const ASSET_DIR = path.join(__dirname, "assets");
const ROOT_SUPPORT_BANNER = path.join(__dirname, "assistance.png");
const ROOT_FOOTER = path.join(__dirname, "banner.png");
const ASSET_SUPPORT_BANNER = path.join(ASSET_DIR, "assistance.png");
const ASSET_FOOTER = path.join(ASSET_DIR, "banner.png");

const TYPES = {
  general: {
    label: "General Support",
    description: "Get help with general questions or server issues.",
    roleId: SUPPORT_TEAM_ROLE_ID,
  },
  ia: {
    label: "Internal Affairs Support",
    description: "Contact Internal Affairs for IA-related assistance.",
    roleId: INTERNAL_AFFAIRS_TEAM_ROLE_ID,
  },
  management: {
    label: "Management Support",
    description: "Contact Management for management-level assistance.",
    roleId: MANAGEMENT_TEAM_ROLE_ID,
  },
};


async function getSupportChannel(guild) {
  const configured = await guild.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
  if (configured && configured.isTextBased()) return configured;

  return guild.channels.cache.find(
    channel =>
      channel.isTextBased() &&
      ["assistance", "support"].includes(channel.name.toLowerCase())
  ) || null;
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TICKETS_FILE)) fs.writeFileSync(TICKETS_FILE, "{}", "utf8");
}

function readTickets() {
  ensureData();
  try {
    return JSON.parse(fs.readFileSync(TICKETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveTickets(data) {
  ensureData();
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function assetPath(names) {
  for (const name of names) {
    if (fs.existsSync(name)) return name;
  }
  return null;
}

function addMedia(container, filePath) {
  if (!filePath) return;
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${path.basename(filePath)}`)
    )
  );
}

function separator() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function bannerSeparator() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function customEmoji(guild, name) {
  const found = guild?.emojis.cache.find(e => e.name === name);
  return found ? `<:${found.name}:${found.id}>` : "";
}

function buildSupportPanel(guild) {
  const container = new ContainerBuilder();
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);

  addMedia(container, banner);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> Welcome to Missouri State Roleplay Assistance. Choose the ticket option that best matches your issue and our team will be notified automatically. Please do not ping staff repeatedly; they are notified when your ticket is created."
    )
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> **Average Response Time:** `12-20 minutes`." + SUPPORT_PANEL_MARKER
    )
  );
  container.addSeparatorComponents(separator());

  const menu = new StringSelectMenuBuilder()
    .setCustomId("support:create")
    .setPlaceholder("Select a ticket type...")
    .addOptions(
      Object.entries(TYPES).map(([value, type]) => ({
        label: type.label,
        description: type.description,
        value,
      }))
    );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  container.addSeparatorComponents(separator());
  addMedia(container, footer);
  return container;
}

function ticketPanelComponents(ticket) {
  const description = ticket.description?.trim() || "No report description was provided.";
  const createdAt = Math.floor(new Date(ticket.accountCreatedAt || ticket.createdAt).getTime() / 1000);
  const robloxId = ticket.robloxId || null;
  const robloxName = ticket.robloxUsername || "Not linked with Bloxlink";
  const robloxUrl = robloxId ? `https://www.roblox.com/users/${robloxId}/profile` : "Not available";
  const container = new ContainerBuilder();
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);

  addMedia(container, banner);
  // The only top divider sits directly beneath the banner.
  container.addSeparatorComponents(separator());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> Thank you for contacting our support team. They have been notified, so please do not ping them again unless there has been no response for multiple hours. Failure to follow this may result in moderation and your ticket being closed."
    )
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`> **Ticket Reason:** ${description.slice(0, 3500)}`)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Discord User:** <@${ticket.userId}>\n> **Account Age:** <t:${createdAt}:D>`
    )
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Roblox User:** ${robloxName}\n> **Roblox URL:** ${robloxUrl}`
    )
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Ping:** <@&${ticket.teamRoleId}> | <@${ticket.userId}>` +
      (ticket.claimedBy ? `\n> **Claimed By:** <@${ticket.claimedBy}>` : "")
    )
  );
  // Keep just the two dividers around the action buttons.
  container.addSeparatorComponents(separator());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support:claim")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(ticket.claimedBy)),
      new ButtonBuilder()
        .setCustomId("support:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    )
  );
  container.addSeparatorComponents(separator());
  addMedia(container, footer);
  return [container];
}
function ticketPanelFiles() {
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);
  return [banner, footer].filter(Boolean);
}

function closeRequestComponents() {
  // This is a standard Discord message, so the controls must be an Action Row.
  // A Components V2 Container here causes Discord error 50035 when sent without
  // the IsComponentsV2 flag.
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support:confirm-close")
        .setLabel("Confirm Closure")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("support:cancel-close")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function isHighRank(member) {
  return Boolean(member?.roles?.cache?.has(SENIOR_HR_ROLE_ID) || member?.roles?.cache?.has(HIGH_RANK_ROLE_ID));
}

function canUseTeam(member, roleId) {
  return Boolean(member?.roles?.cache?.has(roleId));
}

function canClaim(member, ticket) {
  // Senior High Rank may claim any ticket type: General, Internal Affairs,
  // or Management. The assigned support team retains its normal claim access.
  if (isHighRank(member)) return true;
  return Boolean(member?.roles?.cache?.has(ticket.teamRoleId));
}

function canRequestClosure(member, ticket) {
  return (
    isHighRank(member) ||
    ticket.claimedBy === member?.id ||
    canUseTeam(member, ticket.teamRoleId)
  );
}

function formatTranscriptTimestamp(date) {
  return new Date(date).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

async function collectTicketTranscript(thread) {
  const messages = [];
  let before;

  for (let page = 0; page < 10; page += 1) {
    const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || !batch.size) {
      // Deleted channels can no longer be fetched through the API; preserve any
      // messages still cached by discord.js so the deletion log includes a transcript.
      if (page === 0 && thread.messages?.cache?.size) messages.push(...thread.messages.cache.values());
      break;
    }

    messages.push(...batch.values());
    const oldest = batch.last();
    if (!oldest || batch.size < 100) break;
    before = oldest.id;
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  return messages
    .map((message) => {
      const author = message.author ? `${message.author.tag} (${message.author.id})` : "Unknown User";
      const content = message.content?.trim() || "[No text content]";
      const attachments = message.attachments?.size
        ? `\nAttachments: ${[...message.attachments.values()].map((a) => a.url).join(" | ")}`
        : "";
      return `[${formatTranscriptTimestamp(message.createdAt)}] ${author}: ${content}${attachments}`;
    })
    .join("\n\n") || "No messages were available for this ticket.";
}

async function sendTicketLog(client, ticket, thread, reason, closedById = null) {
  const logsChannel = await client.channels.fetch(SUPPORT_LOGS_CHANNEL_ID).catch(() => null);
  if (!logsChannel || !logsChannel.isTextBased()) {
    console.error("Support Logs channel could not be found or is not text-based.");
    return;
  }

  const transcript = await collectTicketTranscript(thread).catch(() => "Unable to collect the ticket transcript.");
  const type = TYPES[ticket.type]?.label || ticket.type || "Unknown";
  const status = reason === "manual deletion" ? "Deleted Manually" : "Closed";
  const closedBy = closedById ? `<@${closedById}>` : "Not available";

  const embed = new EmbedBuilder()
    .setTitle("Support Ticket Log")
    .setDescription(`**${type}**\nTicket: <#${ticket.threadId}>`)
    .addFields(
      { name: "Status", value: status, inline: true },
      { name: "Created By", value: `<@${ticket.userId}>`, inline: true },
      { name: "Claimed By", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed", inline: true },
      { name: "Closed By", value: closedBy, inline: true },
      { name: "Report Description", value: String(ticket.description || "No description provided.").slice(0, 1024) }
    )
    .setTimestamp();

  const transcriptFile = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: `ticket-${ticket.threadId}-transcript.txt`,
  });

  await logsChannel.send({ embeds: [embed], files: [transcriptFile] }).catch((error) => {
    console.error("Failed to send support ticket log:", error);
  });
}

async function supportPanelPayload(channel) {
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);
  return {
    components: [buildSupportPanel(channel.guild)],
    files: [banner, footer].filter(Boolean),
    attachments: [],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function ensureSupportPanel(client) {
  if (supportPanelRefreshPromise) return supportPanelRefreshPromise;
  supportPanelRefreshPromise = refreshSupportPanel(client);
  try { return await supportPanelRefreshPromise; }
  finally { supportPanelRefreshPromise = null; }
}

async function refreshSupportPanel(client) {
  const guild = client.guilds.cache.first();
  const channel = guild ? await getSupportChannel(guild) : null;
  if (!channel || !channel.isTextBased()) {
    console.error("Support channel could not be found or is not text-based.");
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the support channel to check the panel.");
    return;
  }

  const botMessages = messages.filter(message => message.author?.id === client.user.id);
  const isAssistancePanel = message => {
    const components = JSON.stringify(message.components || []);
    return components.includes("support:create") ||
      components.includes(SUPPORT_PANEL_MARKER) ||
      (message.attachments?.some(a => ["assistance.png", "support.png"].includes(a.name)) &&
       message.components?.length > 0);
  };
  const panels = [...botMessages.values()].filter(isAssistancePanel);
  const currentPanel = panels[0] || null;

  if (currentPanel) {
    // Update the one persistent panel in place, then remove only duplicate assistance panels.
    await currentPanel.edit(await supportPanelPayload(channel));
    for (const duplicate of panels.slice(1)) {
      await duplicate.delete().catch(error => console.error("Failed to remove duplicate Assistance panel:", error));
    }
    console.log("Assistance panel edited in place; duplicate panels cleaned up.");
    return;
  }

  await channel.send(await supportPanelPayload(channel));
  console.log("Assistance panel posted because none was detected.");
}

async function addRoleMembersToPrivateThread(thread, guild, roleId) {
  const role =
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return;

  for (const member of role.members.values()) {
    await thread.members.add(member.id).catch(() => {});
  }
}

async function restrictAfterClaim(thread, guild, ownerId, claimantId) {
  for (const member of thread.members.cache.values()) {
    if (member.id === ownerId || member.id === claimantId) continue;
    const guildMember =
      guild.members.cache.get(member.id) ||
      (await guild.members.fetch(member.id).catch(() => null));
    if (guildMember && isHighRank(guildMember)) continue;
    await thread.members.remove(member.id).catch(() => {});
  }
}

async function addHighRankMembers(thread, guild) {
  const role =
    guild.roles.cache.get(SENIOR_HR_ROLE_ID) ||
    (await guild.roles.fetch(SENIOR_HR_ROLE_ID).catch(() => null));
  if (!role) return;
  for (const member of role.members.values()) {
    await thread.members.add(member.id).catch(() => {});
  }
}

function buildDescriptionModal(typeKey) {
  return new ModalBuilder()
    .setCustomId(`support:description:${typeKey}`)
    .setTitle("Support Ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("report_description")
          .setLabel("What do you need help with?")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Describe the issue or report in detail.")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4000)
      )
    );
}

async function createTicket(interaction, typeKey) {
  const type = TYPES[typeKey];
  if (!type || !interaction.guild) return;

  const tickets = readTickets();
  const active = Object.values(tickets).find(
    (t) =>
      t.guildId === interaction.guild.id &&
      t.userId === interaction.user.id &&
      !t.closed
  );
  if (active) {
    await interaction.reply({
      content: `You already have an open support ticket: <#${active.threadId}>`,
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(buildDescriptionModal(typeKey));
}

async function openSupportTicketForMember(guild, targetMember, openedBy) {
  const tickets = readTickets();
  const active = Object.values(tickets).find(t =>
    t.guildId === guild.id && t.userId === targetMember.id && !t.closed
  );
  if (active) return { error: "That member already has an open support ticket: <#" + active.threadId + ">." };

  const parent = await getSupportChannel(guild);
  if (!parent || !parent.isTextBased()) return { error: "The configured support channel could not be found." };

  const type = TYPES.general;
  // Use the member's server display name (nickname if set), not their Discord username.
  const safeName = (targetMember.displayName || targetMember.user.globalName || targetMember.user.username).toLowerCase()
    .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || targetMember.id;
  const channel = await guild.channels.create({
    name: ("general-support-" + safeName).slice(0, 100),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: targetMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: type.roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: SENIOR_HR_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: HIGH_RANK_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
    ],
    position: 0,
    reason: "General support ticket opened for " + targetMember.user.tag + " by " + openedBy.tag
  }).catch(error => {
    console.error("[Support] Staff-opened ticket channel creation failed:", error);
    return null;
  });
  if (!channel) return { error: "I couldn't create the ticket. Check the bot's Manage Channels permission and role hierarchy." };

  const account = await lookupRobloxAccount(guild.id, targetMember.id);
  const ticket = {
    threadId: channel.id,
    isChannelTicket: true,
    guildId: guild.id,
    userId: targetMember.id,
    type: "general",
    teamRoleId: type.roleId,
    description: "General support ticket opened on behalf of " + targetMember.user.tag + " by " + openedBy.tag + ".",
    openedById: openedBy.id,
    accountCreatedAt: targetMember.user.createdAt.toISOString(),
    robloxId: account.robloxId,
    robloxUsername: account.robloxUsername,
    claimedBy: null,
    closed: false,
    closeRequestMessageId: null,
    closeRequestedAt: null,
    createdAt: new Date().toISOString()
  };

  const ping = await channel.send({
    content: "<@" + type.roleId + "> <@" + targetMember.id + ">",
    allowedMentions: { roles: [type.roleId], users: [targetMember.id] }
  }).catch(error => {
    console.error("[Support] Failed to notify staff-opened ticket:", error);
    return null;
  });
  if (ping) setTimeout(() => ping.delete().catch(() => {}), 1500);

  const panelMessage = await channel.send({
    components: ticketPanelComponents(ticket),
    files: ticketPanelFiles(),
    flags: MessageFlags.IsComponentsV2
  });
  ticket.panelMessageId = panelMessage.id;
  tickets[channel.id] = ticket;
  saveTickets(tickets);
  return { channel };
}

async function lookupRobloxAccount(guildId, discordUserId) {
  const apiKey = process.env.BLOXLINK_API_KEY;
  if (!apiKey) {
    console.warn("BLOXLINK_API_KEY is not configured; skipping Roblox account lookup.");
    return { robloxId: null, robloxUsername: null };
  }

  try {
    const response = await fetch(
      `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordUserId}`,
      { headers: { Authorization: apiKey } }
    );
    if (!response.ok) return { robloxId: null, robloxUsername: null };
    const data = await response.json();
    const robloxId = data.robloxID ? String(data.robloxID) : null;
    if (!robloxId) return { robloxId: null, robloxUsername: null };

    const profileResponse = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
    if (!profileResponse.ok) return { robloxId, robloxUsername: null };
    const profile = await profileResponse.json();
    return { robloxId, robloxUsername: profile.name || profile.displayName || null };
  } catch (error) {
    console.error("Bloxlink Roblox account lookup failed:", error);
    return { robloxId: null, robloxUsername: null };
  }
}

async function submitTicket(interaction, typeKey) {
  const type = TYPES[typeKey];
  if (!type || !interaction.guild) return;

  const description = interaction.fields
    .getTextInputValue("report_description")
    .trim();

  const tickets = readTickets();
  const active = Object.values(tickets).find(
    (t) =>
      t.guildId === interaction.guild.id &&
      t.userId === interaction.user.id &&
      !t.closed
  );
  if (active) {
    await interaction.reply({
      content: `You already have an open support ticket: <#${active.threadId}>`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const parent = await getSupportChannel(interaction.guild);
  if (!parent || !parent.isTextBased()) {
    await interaction.editReply("The support channel is not configured correctly.");
    return;
  }

  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: type.roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: SENIOR_HR_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  // Channel names should use the member's server display name, not their Discord username.
  const displayName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const safeDisplayName = displayName.toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || interaction.user.id;

  const channel = await interaction.guild.channels.create({
    name: `${({ general: "general", ia: "internal-affairs", management: "management" }[typeKey] || "general")}-support-${safeDisplayName}`.slice(0, 100),
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    position: 0,
    reason: `Support ticket created by ${interaction.user.tag}`,
  }).catch((error) => {
    console.error("Failed to create support ticket channel:", error);
    return null;
  });

  if (!channel) {
    await interaction.editReply(
      "I couldn't create your support ticket channel. Please make sure the bot can manage channels and permissions."
    );
    return;
  }

  const account = await lookupRobloxAccount(interaction.guild.id, interaction.user.id);
  const ticket = {
    threadId: channel.id,
    isChannelTicket: true,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    type: typeKey,
    teamRoleId: type.roleId,
    description,
    accountCreatedAt: interaction.user.createdAt.toISOString(),
    robloxId: account.robloxId,
    robloxUsername: account.robloxUsername,
    claimedBy: null,
    closed: false,
    closeRequestMessageId: null,
    closeRequestedAt: null,
    createdAt: new Date().toISOString(),
  };

  // Internal Affairs tickets notify both the IA team and Senior High Rank.
  const pingContent = typeKey === "ia"
    ? `<@&${type.roleId}> <@&${SENIOR_HR_ROLE_ID}>`
    : `<@&${type.roleId}>`;
  const ping = await channel.send({
    content: pingContent,
    allowedMentions: { roles: typeKey === "ia" ? [type.roleId, SENIOR_HR_ROLE_ID] : [type.roleId] },
  }).catch(error => {
    console.error("[Support] Failed to notify ticket team:", error);
    return null;
  });
  if (ping) setTimeout(() => ping.delete().catch(() => {}), 1500);

  const panelMessage = await channel.send({
    components: ticketPanelComponents(ticket),
    files: ticketPanelFiles(),
    flags: MessageFlags.IsComponentsV2,
  });
  ticket.panelMessageId = panelMessage.id;

  tickets[channel.id] = ticket;
  saveTickets(tickets);

  await interaction.editReply(
    `Your ${type.label} ticket has been created: <#${channel.id}>`
  );
}


const ticketAddCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Manage access to support tickets.")
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName("add")
    .setDescription("Add a member to this ticket.")
    .addUserOption(option => option.setName("member").setDescription("Member to add to the ticket").setRequired(true))
  )
  .addSubcommand(subcommand => subcommand
    .setName("remove")
    .setDescription("Remove a member from this ticket.")
    .addUserOption(option => option.setName("member").setDescription("Member to remove from the ticket").setRequired(true))
  );

async function handleTicketAccessChange(interaction, action) {
  const tickets = readTickets();
  const ticket = tickets[interaction.channelId];
  if (!ticket || ticket.closed) {
    await interaction.reply({ content: "Use this command inside an open MSRP support ticket.", ephemeral: true });
    return;
  }
  const isClaimer = ticket.claimedBy === interaction.user.id;
  const isSeniorHR = isHighRank(interaction.member);
  if (!isClaimer && !isSeniorHR) {
    await interaction.reply({ content: "Only the staff member who claimed this ticket or Senior High Rank can manage ticket access.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  if (action === "add" && targetUser.id === ticket.userId) {
    await interaction.reply({ content: "The ticket opener already has access to this ticket.", ephemeral: true });
    return;
  }
  if (action === "remove" && targetUser.id === ticket.userId) {
    await interaction.reply({ content: "You cannot remove the ticket creator from their own ticket.", ephemeral: true });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: "That user must be a member of this server.", ephemeral: true });
    return;
  }
  if (action === "remove" && isHighRank(targetMember)) {
    await interaction.reply({ content: "You cannot remove a Senior High Rank member from a ticket.", ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel?.permissionOverwrites) {
    await interaction.reply({ content: "This ticket channel does not support member access changes.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    if (action === "add") {
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      }, { reason: "Added to MSRP support ticket by " + interaction.user.tag });
      await channel.send({
        content: "<@" + targetUser.id + "> was added to this ticket by <@" + interaction.user.id + ">.",
        allowedMentions: { users: [targetUser.id, interaction.user.id] },
      });
      await interaction.editReply("Successfully added " + targetUser.tag + " to this ticket.");
    } else {
      const overwrite = channel.permissionOverwrites.cache.get(targetUser.id);
      if (!overwrite) {
        await interaction.editReply(targetUser.tag + " does not have an individual access override in this ticket.");
        return;
      }
      await channel.permissionOverwrites.delete(targetUser.id, "Removed from MSRP support ticket by " + interaction.user.tag);
      await channel.send({
        content: "<@" + targetUser.id + "> was removed from this ticket by <@" + interaction.user.id + ">.",
        allowedMentions: { users: [targetUser.id, interaction.user.id] },
      });
      await interaction.editReply("Successfully removed " + targetUser.tag + " from this ticket.");
    }
  } catch (error) {
    console.error("[Support] Failed to " + action + " member " + targetUser.id + " in ticket:", error);
    await interaction.editReply("I couldn't " + action + " that member. Check the bot's Manage Channels permission.");
  }
}

async function handleTicketAdd(interaction) {
  return handleTicketAccessChange(interaction, "add");
}

async function handleTicketRemove(interaction) {
  return handleTicketAccessChange(interaction, "remove");
}

const escalateCommand = new SlashCommandBuilder()
  .setName("escalate")
  .setDescription("Change the support type of the current ticket")
  .addStringOption(option =>
    option.setName("type")
      .setDescription("New support team for this ticket")
      .setRequired(true)
      .addChoices(
        { name: "General Support", value: "general" },
        { name: "Internal Affairs Support", value: "ia" },
        { name: "Management Support", value: "management" }
      )
  );

async function handleEscalate(interaction) {
  if (!interaction.inGuild() || !interaction.channel) {
    return interaction.reply({ content: "Use this command inside an open support ticket.", flags: MessageFlags.Ephemeral });
  }
  const tickets = readTickets();
  const ticket = tickets[interaction.channelId];
  if (!ticket || ticket.guildId !== interaction.guildId) {
    return interaction.reply({ content: "This channel is not a registered support ticket. Run `/escalate` inside the ticket you want to change.", flags: MessageFlags.Ephemeral });
  }
  if (ticket.closed || ticket.closing) {
    return interaction.reply({ content: "This ticket is closed or currently closing.", flags: MessageFlags.Ephemeral });
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const canChangeType = isHighRank(member) || canUseTeam(member, ticket.teamRoleId) || ticket.claimedBy === interaction.user.id;
  if (!canChangeType) {
    return interaction.reply({ content: "Only the assigned support team, the ticket claimer, or Senior HR and above can change this ticket's support type.", flags: MessageFlags.Ephemeral });
  }
  const newTypeKey = interaction.options.getString("type", true);
  const newType = TYPES[newTypeKey];
  if (!newType) return interaction.reply({ content: "That support type is invalid.", flags: MessageFlags.Ephemeral });
  const oldTypeKey = ticket.type;
  if (oldTypeKey === newTypeKey) {
    return interaction.reply({ content: "This ticket is already set to **" + newType.label + "**.", flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const channel = interaction.channel;
    const oldRoleId = ticket.teamRoleId || TYPES[oldTypeKey]?.roleId;
    await channel.permissionOverwrites.edit(newType.roleId, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
    });
    if (oldRoleId && oldRoleId !== newType.roleId && oldRoleId !== SENIOR_HR_ROLE_ID) {
      await channel.permissionOverwrites.delete(oldRoleId).catch(error => {
        console.error("Could not remove previous support-team access during type change:", error?.message || error);
      });
    }
    const prefix = { general: "general", ia: "internal-affairs", management: "management" }[newTypeKey];
    const safeUser = (interaction.guild.members.cache.get(ticket.userId)?.user?.username || ticket.userId)
      .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || ticket.userId;
    await channel.setName((prefix + "-support-" + safeUser).slice(0, 100)).catch(error => {
      console.error("Could not rename ticket after support-type change:", error?.message || error);
    });
    ticket.type = newTypeKey;
    ticket.teamRoleId = newType.roleId;
    ticket.supportTypeChangedAt = new Date().toISOString();
    ticket.supportTypeChangedBy = interaction.user.id;
    ticket.escalated = newTypeKey === "management";
    ticket.escalatedAt = newTypeKey === "management" ? new Date().toISOString() : null;
    ticket.escalatedBy = newTypeKey === "management" ? interaction.user.id : null;
    tickets[interaction.channelId] = ticket;
    saveTickets(tickets);
    if (ticket.panelMessageId) {
      const panelMessage = await channel.messages.fetch(ticket.panelMessageId).catch(() => null);
      if (panelMessage) await panelMessage.edit({ components: ticketPanelComponents(ticket), flags: MessageFlags.IsComponentsV2 }).catch(error => console.error("Could not refresh ticket panel after support-type change:", error));
    }
    await interaction.editReply("Ticket type changed from **" + (TYPES[oldTypeKey]?.label || oldTypeKey) + "** to **" + newType.label + "**.");
    await channel.send({
      content: "**Support Type Updated**\nThis ticket was changed from **" + (TYPES[oldTypeKey]?.label || oldTypeKey) + "** to **" + newType.label + "** by <@" + interaction.user.id + ">.\nNew assigned team: <@&" + newType.roleId + ">.",
      allowedMentions: { roles: [newType.roleId], users: [interaction.user.id] }
    });
  } catch (error) {
    console.error("[Support Type Change] Failed:", error);
    return interaction.editReply("I couldn't change the support type. Check the bot's Manage Channels permission and try again. If access changes partially applied, contact management to review this ticket's permissions.");
  }
}

async function handleClaim(interaction, ticket) {
  if (interaction.user.id === ticket.userId) {
    await interaction.reply({
      content: "You cannot claim your own ticket. You can still close it when you're finished.",
      ephemeral: true,
    });
    return;
  }

  if (!canClaim(interaction.member, ticket)) {
    await interaction.reply({
      content: "You do not have permission to claim this ticket.",
      ephemeral: true,
    });
    return;
  }

  if (ticket.claimedBy) {
    await interaction.reply({
      content: `This ticket is already claimed by <@${ticket.claimedBy}>.`,
      ephemeral: true,
    });
    return;
  }

  const thread = interaction.channel;
  const claimedTicket = { ...ticket, claimedBy: interaction.user.id };

  // Acknowledge the button click by updating the panel before persisting the claim.
  // If the panel update fails, do not leave a false claim saved in the ticket data.
  await interaction.update({
    components: ticketPanelComponents(claimedTicket),
    flags: MessageFlags.IsComponentsV2,
  });

  ticket.claimedBy = interaction.user.id;
  const tickets = readTickets();
  tickets[ticket.threadId] = ticket;
  saveTickets(tickets);

  // Tickets are private guild text channels, not threads; permission overwrites
  // already grant access to the assigned team, so there is no thread member to add.

  // Notification is secondary: a failed notification must not make a successful
  // claim look like it failed or leave Discord showing an error to the claimer.
  await thread.send({
    content: `**Support Ticket Claimed**\n<@${ticket.userId}>, <@${interaction.user.id}> will be handling your support ticket. Please continue replying in this channel so they can assist you.`,
  }).catch((error) => {
    console.error("Could not send ticket claim notification:", error);
  });
}

async function finalizeClose(interaction, ticket, closedById = null) {
  const thread = interaction.channel;
  if (!thread?.isTextBased() || !thread.messages || !thread.delete) return false;

  const tickets = readTickets();
  const latest = tickets[ticket.threadId];
  if (!latest || latest.closed) return false;

  // Mark the ticket as closing so another close action cannot start a second timer.
  latest.closing = true;
  latest.closeRequestedAt = null;
  tickets[ticket.threadId] = latest;
  saveTickets(tickets);

  // Keep the ticket channel available for 15 seconds so the closure message can be seen.
  await new Promise((resolve) => setTimeout(resolve, 15000));

  const currentTickets = readTickets();
  const current = currentTickets[ticket.threadId];
  if (!current || current.closed) return true;

  // Log the complete ticket before deleting the thread.
  await sendTicketLog(interaction.client, current, thread, "closed", closedById || interaction.user?.id || null);

  current.closed = true;
  current.closing = false;
  current.closedAt = new Date().toISOString();
  current.closeRequestMessageId = null;
  current.closeRequestedAt = null;
  currentTickets[ticket.threadId] = current;
  saveTickets(currentTickets);

  // Delete the ticket channel after the 15-second closing period.
  const deleted = await thread.delete("Support ticket closed").then(() => true).catch(() => false);

  if (!deleted) {
    const pending = readTickets();
    if (pending[ticket.threadId]) {
      pending[ticket.threadId].closed = false;
      pending[ticket.threadId].closing = false;
      saveTickets(pending);
    }
    return false;
  }

  return true;
}

async function scheduleClosureRequestTimeout(client, ticket) {
  const oldTimer = closureRequestTimers.get(ticket.threadId);
  if (oldTimer) clearTimeout(oldTimer);
  closureRequestTimers.delete(ticket.threadId);
  if (!ticket.closeRequestMessageId || !ticket.closeRequestedAt || ticket.closed || ticket.closing) return;

  const elapsed = Date.now() - new Date(ticket.closeRequestedAt).getTime();
  const remaining = Math.max(0, CLOSURE_RESPONSE_TIMEOUT_MS - elapsed);
  const timer = setTimeout(async () => {
    closureRequestTimers.delete(ticket.threadId);
    const tickets = readTickets();
    const latest = tickets[ticket.threadId];
    if (!latest || latest.closed || latest.closing || !latest.closeRequestMessageId) return;
    const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
    if (!thread || !thread.isTextBased()) return;
    await thread.send({ content: `<@${latest.userId}> did not respond to the closure request within one hour. This ticket will now be closed.`, allowedMentions: { users: [latest.userId] } }).catch(() => {});
    const fakeInteraction = { client, channel: thread, user: { id: null } };
    const closed = await finalizeClose(fakeInteraction, latest, null);
    if (!closed) console.error("[Support] Automatic closure after one-hour timeout failed for ticket " + ticket.threadId);
  }, remaining);
  closureRequestTimers.set(ticket.threadId, timer);
}

async function requestTicketClosure(interaction, ticket) {
  const tickets = readTickets();
  const latest = tickets[ticket.threadId];
  if (!latest || latest.closed || latest.closing) {
    await interaction.reply({ content: "This ticket is already closed or closing.", ephemeral: true });
    return;
  }

  // If the opener has left the server, never create a closure request that nobody can answer.
  const opener = await interaction.guild.members.fetch(latest.userId).catch(() => null);
  if (!opener || latest.openerLeft) {
    await interaction.reply({
      content: "The ticket opener has left the server, so a closure request cannot be sent to them.",
      ephemeral: true,
    });
    return;
  }

  if (latest.closeRequestMessageId) {
    await interaction.reply({ content: "A closure request is already awaiting the ticket opener's response.", ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  // Persist the request state before sending the visible message, so the request
  // cannot appear in Discord without being registered in tickets.json.
  latest.closeRequestedAt = new Date().toISOString();
  latest.closeRequestedBy = interaction.user.id;
  latest.closeRequestMessageId = "pending";
  tickets[latest.threadId] = latest;
  saveTickets(tickets);

  const requestMessage = await interaction.channel.send({
    content: `<@${latest.userId}> **Support staff have requested to close this ticket.** Please respond using the buttons below within **1 hour**. If you do not respond, the ticket will automatically close.`,
    components: closeRequestComponents(),
    allowedMentions: { users: [latest.userId] },
  }).catch(async error => {
    console.error("[Support] Failed to send closure request:", error);
    const latestTickets = readTickets();
    if (latestTickets[latest.threadId]) {
      latestTickets[latest.threadId].closeRequestMessageId = null;
      latestTickets[latest.threadId].closeRequestedAt = null;
      latestTickets[latest.threadId].closeRequestedBy = null;
      saveTickets(latestTickets);
    }
    return null;
  });
  if (!requestMessage) {
    await interaction.followUp({ content: "I couldn't send the closure request. Please check the bot's channel permissions and try again.", ephemeral: true }).catch(() => {});
    return;
  }
  const refreshedTickets = readTickets();
  const refreshedTicket = refreshedTickets[latest.threadId];
  if (!refreshedTicket || refreshedTicket.closed) return;
  refreshedTicket.closeRequestMessageId = requestMessage.id;
  refreshedTicket.closeRequestedAt = refreshedTicket.closeRequestedAt || new Date().toISOString();
  refreshedTicket.closeRequestedBy = interaction.user.id;
  refreshedTickets[latest.threadId] = refreshedTicket;
  saveTickets(refreshedTickets);
  await scheduleClosureRequestTimeout(interaction.client, refreshedTicket);
}

async function handleClose(interaction, ticket) {
  if (ticket.closed || ticket.closing) {
    await interaction.reply({
      content: ticket.closing ? "This ticket is already closing." : "This ticket is already closed.",
      ephemeral: true,
    });
    return;
  }

  const isCreator = interaction.user.id === ticket.userId;
  const isAuthorizedStaff =
    isHighRank(interaction.member) ||
    canUseTeam(interaction.member, ticket.teamRoleId) ||
    ticket.claimedBy === interaction.user.id;

  if (!isCreator && !isAuthorizedStaff) {
    await interaction.reply({
      content: "Only the ticket creator or authorized support staff can request closure.",
      ephemeral: true,
    });
    return;
  }

  if (!isCreator) {
    await requestTicketClosure(interaction, ticket);
    return;
  }

  await interaction.deferUpdate();
  await interaction.channel.send("The ticket opener requested closure. This ticket will be closed in a few seconds.").catch(() => {});
  const closed = await finalizeClose(interaction, ticket, interaction.user.id);
  if (!closed) {
    await interaction.followUp({
      content: "I couldn't close this ticket. Please make sure I have permission to delete the support ticket channel.",
      ephemeral: true,
    });
  }
}

async function handleCloseConfirmation(interaction, ticket, confirm) {
  // The opener cannot use the ticket's regular Close button after it is claimed,
  // but may still confirm a closure request explicitly initiated by authorized staff.
  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({
      content:
        "Only the member who opened this ticket can respond to this closure request.",
      ephemeral: true,
    });
    return;
  }

  const tickets = readTickets();
  const latest = tickets[ticket.threadId];

  if (!latest) {
    await interaction.reply({
      content: "This ticket is no longer registered.",
      ephemeral: true,
    });
    return;
  }

  if (latest.closing) {
    await interaction.reply({
      content: "This ticket is already closing.",
      ephemeral: true,
    });
    return;
  }

  if (latest.closed) {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!latest.closeRequestMessageId && interaction.message?.components?.length) {
    // Recover a request message left behind by a prior interrupted write/deploy.
    latest.closeRequestMessageId = interaction.message.id;
    latest.closeRequestedAt = latest.closeRequestedAt || new Date(interaction.message.createdTimestamp).toISOString();
    tickets[ticket.threadId] = latest;
    saveTickets(tickets);
  }
  if (!latest.closeRequestMessageId || (latest.closeRequestMessageId !== "pending" && latest.closeRequestMessageId !== interaction.message?.id)) {
    await interaction.reply({
      content: "There is no active closure request for this ticket. Ask support staff to send a new request.",
      ephemeral: true,
    });
    return;
  }

  if (!confirm) {
    latest.closeRequestMessageId = null;
    latest.closeRequestedAt = null;
    latest.closeRequestedBy = null;
    const closureTimer = closureRequestTimers.get(ticket.threadId);
    if (closureTimer) clearTimeout(closureTimer);
    closureRequestTimers.delete(ticket.threadId);
    tickets[ticket.threadId] = latest;
    saveTickets(tickets);

    await interaction.update({ components: [] });
    await interaction.channel.send(
      "Ticket closure cancelled. You can continue receiving assistance here."
    );
    return;
  }

  const closureTimer = closureRequestTimers.get(ticket.threadId);
  if (closureTimer) clearTimeout(closureTimer);
  closureRequestTimers.delete(ticket.threadId);
  latest.closeRequestMessageId = null;
  latest.closeRequestedAt = null;
  latest.closeRequestedBy = null;
  tickets[ticket.threadId] = latest;
  saveTickets(tickets);
  await interaction.deferUpdate();
  await interaction.channel.send("The ticket opener confirmed closure. This support ticket will be closed in a few seconds.").catch(() => {});
  const closed = await finalizeClose(interaction, latest, interaction.user.id);

  if (!closed) {
    await interaction.followUp({
      content:
        "I couldn't close this ticket. Please make sure I have permission to delete the support thread.",
      ephemeral: true,
    });
    return;
  }

}

async function setup(client) {
  ensureData();

  client.on("guildMemberRemove", async (member) => {
    try {
      const tickets = readTickets();
      let changed = false;
      for (const ticket of Object.values(tickets)) {
        if (ticket.userId !== member.id || ticket.closed) continue;
        ticket.openerLeft = true;

        // Cancel any pending closure request because the opener can no longer respond.
        if (ticket.closeRequestMessageId || ticket.closeRequestedAt) {
          const requestMessageId = ticket.closeRequestMessageId;
          const timer = closureRequestTimers.get(ticket.threadId);
          if (timer) clearTimeout(timer);
          closureRequestTimers.delete(ticket.threadId);
          ticket.closeRequestMessageId = null;
          ticket.closeRequestedAt = null;
          ticket.closeRequestedBy = null;
          const channel = await client.channels.fetch(ticket.threadId).catch(() => null);
          if (requestMessageId && requestMessageId !== "pending" && channel?.isTextBased() && channel.messages) {
            const requestMessage = await channel.messages.fetch(requestMessageId).catch(() => null);
            if (requestMessage) await requestMessage.edit({ components: [] }).catch(() => {});
          }
        }
        tickets[ticket.threadId] = ticket;
        changed = true;
      }
      if (changed) saveTickets(tickets);
    } catch (error) {
      console.error("Support opener-leave handler error:", error);
    }
  });

  client.on("threadDelete", async (thread) => {
    try {
      const tickets = readTickets();
      const ticket = tickets[thread.id];
      if (!ticket || ticket.closed) return;

      ticket.closed = true;
      ticket.closing = false;
      ticket.closedAt = new Date().toISOString();
      ticket.closeRequestMessageId = null;
      ticket.closeRequestedAt = null;
      ticket.closeRequestedBy = null;
      const timer = closureRequestTimers.get(thread.id);
      if (timer) clearTimeout(timer);
      closureRequestTimers.delete(thread.id);
      tickets[thread.id] = ticket;
      saveTickets(tickets);

      // Use the common logger so manual deletions receive the same transcript file.
      await sendTicketLog(client, ticket, thread, "manual deletion", null);
    } catch (error) {
      console.error("Support thread deletion handler error:", error);
    }
  });

  // Remove legacy private-thread tickets once after deployment; new channel tickets are preserved.
  const legacyTickets = readTickets();
  let changed = false;
  for (const [id, ticket] of Object.entries(legacyTickets)) {
    if (ticket.isChannelTicket) continue;
    const oldTicketChannel = await client.channels.fetch(id).catch(() => null);
    if (oldTicketChannel) {
      await oldTicketChannel.delete("Migrating legacy support tickets to private channels").catch((error) => {
        console.error(`Failed to remove legacy support ticket ${id}:`, error);
      });
    }
    if (!ticket.closed) {
      ticket.closed = true;
      ticket.closing = false;
      ticket.closedAt = new Date().toISOString();
      ticket.closeRequestMessageId = null;
      ticket.closeRequestedAt = null;
      ticket.closeRequestedBy = null;
      legacyTickets[id] = ticket;
      changed = true;
    }
  }
  if (changed) saveTickets(legacyTickets);

  // Restore one-hour closure timers after a restart so pending requests do not get stuck.
  for (const ticket of Object.values(readTickets())) {
    if (ticket.closeRequestMessageId && ticket.closeRequestedAt && !ticket.closed && !ticket.closing) {
      scheduleClosureRequestTimeout(client, ticket).catch(error => console.error("[Support] Could not restore closure timeout:", error));
    }
  }

  client.on("channelDelete", async (channel) => {
    try {
      const tickets = readTickets();
      const ticket = tickets[channel.id];
      if (!ticket || ticket.closed) return;
      ticket.closed = true;
      ticket.closing = false;
      ticket.closedAt = new Date().toISOString();
      ticket.closeRequestMessageId = null;
      ticket.closeRequestedAt = null;
      ticket.closeRequestedBy = null;
      const closureTimer = closureRequestTimers.get(channel.id);
      if (closureTimer) clearTimeout(closureTimer);
      closureRequestTimers.delete(channel.id);
      tickets[channel.id] = ticket;
      saveTickets(tickets);
      await sendTicketLog(client, ticket, channel, "manual deletion", null);
    } catch (error) {
      console.error("Support channel deletion handler error:", error);
    }
  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || !message.content.trim().toLowerCase().startsWith("!openticket")) return;
    const member = message.member;
    if (!isHighRank(member)) {
      await message.reply("Only High Rank and Senior HR can use this command.");
      return;
    }
    const targetId = message.mentions.users.first()?.id || message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
    if (!/^\d{17,20}$/.test(targetId || "")) {
      await message.reply("Usage: `!openticket @member or !openticket USER_ID`");
      return;
    }
    const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.reply("That user must be a member of this server.");
      return;
    }
    const result = await openSupportTicketForMember(message.guild, targetMember, message.author);
    if (result.error) {
      await message.reply(result.error);
      return;
    }
    await message.reply("Opened a **General Support** ticket for " + targetMember.toString() + ": <#" + result.channel.id + ">.");
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "support:create"
      ) {
        await createTicket(interaction, interaction.values[0]);
        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("support:description:")
      ) {
        const typeKey = interaction.customId.split(":")[2];
        await submitTicket(interaction, typeKey);
        return;
      }

      if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "add") {
          await handleTicketAdd(interaction);
          return;
        }
        if (subcommand === "remove") {
          await handleTicketRemove(interaction);
          return;
        }
      }

      if (interaction.isChatInputCommand() && interaction.commandName === "escalate") {
        await handleEscalate(interaction);
        return;
      }

      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("support:")) return;

      const tickets = readTickets();
      const ticket = tickets[interaction.channelId];
      if (!ticket) {
        await interaction.reply({
          content: "This ticket is no longer registered.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      if (interaction.customId === "support:claim") {
        await handleClaim(interaction, ticket);
      } else if (interaction.customId === "support:close") {
        await handleClose(interaction, ticket);
      } else if (interaction.customId === "support:confirm-close") {
        await handleCloseConfirmation(interaction, ticket, true);
      } else if (interaction.customId === "support:cancel-close") {
        await handleCloseConfirmation(interaction, ticket, false);
      }
    } catch (error) {
      console.error("Support system error:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Something went wrong while handling this support ticket.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  });
}

module.exports = { setup, ensureSupportPanel, commands: [escalateCommand, ticketAddCommand] };
