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
const SUPPORT_LOGS_CHANNEL_ID = "1552509962910171176";
const SUPPORT_PANEL_VERSION = 8;
const SUPPORT_PANEL_MARKER = "\u200B".repeat(SUPPORT_PANEL_VERSION);
let supportPanelRefreshPromise = null;

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
  return [
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## Ticket Closure Requested\nA staff member has requested to close your ticket. If you still need assistance, cancel the closure. Otherwise, confirm to close the ticket."
        )
      )
      .addSeparatorComponents(separator())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("support:confirm-close")
            .setLabel("Confirm Closure")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("support:cancel-close")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        )
      ),
  ];
}

function isHighRank(member) {
  return Boolean(member?.roles?.cache?.has(SENIOR_HR_ROLE_ID));
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
    if (!batch || !batch.size) break;

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

  const channel = await interaction.guild.channels.create({
    name: `${({ general: "general", ia: "internal-affairs", management: "management" }[typeKey] || "general")}-support-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || interaction.user.id}`.slice(0, 100),
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

  const ping = await channel.send({ content: `<@&${type.roleId}>` }).catch(() => null);
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


const escalateCommand = new SlashCommandBuilder()
  .setName("escalate")
  .setDescription("Escalate the current support ticket to Management");

async function handleEscalate(interaction, ticket) {
  if (ticket.closed || ticket.closing) {
    await interaction.reply({ content: "This ticket is closed or currently closing.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  const canEscalate = isHighRank(member) || canUseTeam(member, ticket.teamRoleId) || ticket.claimedBy === interaction.user.id;
  if (!canEscalate) {
    await interaction.reply({ content: "Only the assigned support team, the ticket's claimer, or Senior HR and above can escalate this ticket.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.escalated) {
    await interaction.reply({ content: "This ticket has already been escalated to Management.", flags: MessageFlags.Ephemeral });
    return;
  }
  const oldRoleId = ticket.teamRoleId;
  ticket.teamRoleId = MANAGEMENT_TEAM_ROLE_ID;
  ticket.escalated = true;
  ticket.escalatedAt = new Date().toISOString();
  ticket.escalatedBy = interaction.user.id;
  const tickets = readTickets();
  tickets[ticket.threadId] = ticket;
  saveTickets(tickets);

  await interaction.reply({ content: "This ticket has been escalated to Management.", flags: MessageFlags.Ephemeral });
  const thread = interaction.channel;
  if (ticket.panelMessageId) {
    const panelMessage = await thread.messages.fetch(ticket.panelMessageId).catch(() => null);
    if (panelMessage) {
      await panelMessage.edit({ components: ticketPanelComponents(ticket), flags: MessageFlags.IsComponentsV2 }).catch(error => {
        console.error("Could not update escalated ticket panel:", error);
      });
    }
  }
  await thread.send({
    content: "**Ticket Escalated to Management**\\n<@&" + MANAGEMENT_TEAM_ROLE_ID + "> — this ticket was escalated by <@" + interaction.user.id + "> from <@&" + oldRoleId + ">.",
    allowedMentions: { roles: [MANAGEMENT_TEAM_ROLE_ID], users: [interaction.user.id] }
  }).catch(error => console.error("Could not notify Management about escalated ticket:", error));
}

async function handleClaim(interaction, ticket) {
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

  await thread.members.add(interaction.user.id).catch((error) => {
    console.error("Could not add ticket claimer to ticket channel:", error);
  });

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

  // Keep the ticket channel available for five seconds so the closure message can be seen.
  await new Promise((resolve) => setTimeout(resolve, 5000));

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

  // Delete the ticket channel after the five-second closing period.
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
      content: "Only the ticket creator or authorized support staff can close this ticket.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  await interaction.channel.send("This support ticket will close in 5 seconds.").catch(() => {});
  const closed = await finalizeClose(interaction, ticket, interaction.user.id);
  if (!closed) {
    await interaction.followUp({
      content: "I couldn't close this ticket. Please make sure I have permission to delete the support ticket channel.",
      ephemeral: true,
    });
  }
}

async function handleCloseConfirmation(interaction, ticket, confirm) {
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

  if (!latest.closeRequestMessageId) {
    await interaction.reply({
      content: "There is no active closure request for this ticket.",
      ephemeral: true,
    });
    return;
  }

  if (!confirm) {
    latest.closeRequestMessageId = null;
    latest.closeRequestedAt = null;
    tickets[ticket.threadId] = latest;
    saveTickets(tickets);

    await interaction.update({ components: [], flags: MessageFlags.IsComponentsV2 });
    await interaction.channel.send(
      "Ticket closure cancelled. You can continue receiving assistance here."
    );
    return;
  }

  await interaction.deferUpdate();
  await interaction.channel.send("This support ticket will close in 5 seconds.").catch(() => {});
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
      tickets[thread.id] = ticket;
      saveTickets(tickets);

      const logsChannel = await client.channels.fetch(SUPPORT_LOGS_CHANNEL_ID).catch(() => null);
      if (logsChannel && logsChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("Support Ticket Log")
          .setDescription(`**${TYPES[ticket.type]?.label || ticket.type || "Support"}**\nTicket thread: \`#${thread.id}\``)
          .addFields(
            { name: "Status", value: "Deleted Manually", inline: true },
            { name: "Created By", value: `<@${ticket.userId}>`, inline: true },
            { name: "Claimed By", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed", inline: true },
            { name: "Report Description", value: String(ticket.description || "No description provided.").slice(0, 1024) }
          )
          .setTimestamp();
        await logsChannel.send({ embeds: [embed] }).catch(() => {});
      }
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
      legacyTickets[id] = ticket;
      changed = true;
    }
  }
  if (changed) saveTickets(legacyTickets);

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
      tickets[channel.id] = ticket;
      saveTickets(tickets);
      await sendTicketLog(client, ticket, channel, "manual deletion", null);
    } catch (error) {
      console.error("Support channel deletion handler error:", error);
    }
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

      if (interaction.isChatInputCommand() && interaction.commandName === "escalate") {
        await handleEscalate(interaction, ticket);
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

module.exports = { setup, ensureSupportPanel, commands: [escalateCommand] };
