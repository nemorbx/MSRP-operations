const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
const SUPPORT_PANEL_VERSION = 7;
const SUPPORT_PANEL_MARKER = "\u200B".repeat(SUPPORT_PANEL_VERSION);

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

  // Keep the banner directly before the description without an extra component.
  addMedia(container, banner);

  // Keep the description and response-time quote together without a divider between them.
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> Our assistance dashboard is here to easily contact our support team through various ticket options. Pick the one that you think best supports your issue(s) and we'll be there to assist as soon as possible. Avoid pining staff inside of your tickets as they are already notified when you open the ticket."
    )
  );

  // Keep the invisible panel marker inside an existing text component so it
  // doesn't create an extra component (and gap) beneath the footer banner.
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
  const status = ticket.claimedBy
    ? `**Claimed by:** <@${ticket.claimedBy}>`
    : "**Status:** Unclaimed";

  const container = new ContainerBuilder();
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);

  // Top support image.
  addMedia(container, banner);
  container.addSeparatorComponents(separator());

  // Ticket title and instructions, similar to the reference layout.
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## Support Ticket")
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `<@${ticket.userId}>\n\nThank you for contacting Missouri State Roleplay Support.\n\nPlease wait while a staff member reviews your request and assists you. If you have additional information or evidence that may help with your request, you can provide it below.`
    )
  );
  container.addSeparatorComponents(separator());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Report Description:**\n${description}`
    )
  );
  container.addSeparatorComponents(separator());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(status)
  );
  container.addSeparatorComponents(separator());

  // Buttons are kept separate with a divider above and below them.
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support:claim")
        .setLabel("Claim Ticket")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(ticket.claimedBy)),
      new ButtonBuilder()
        .setCustomId("support:close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(separator());

  // Bottom MSRP banner/footer.
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
    .setDescription(`**${type}**\nTicket thread: <#${ticket.threadId}>`)
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

async function sendPanel(channel, client) {
  const banner = assetPath([ROOT_SUPPORT_BANNER, ASSET_SUPPORT_BANNER]);
  const footer = assetPath([ROOT_FOOTER, ASSET_FOOTER]);
  const files = [banner, footer].filter(Boolean);
  await channel.send({
    components: [buildSupportPanel(channel.guild)],
    files,
    flags: MessageFlags.IsComponentsV2,
  });
}

async function ensureSupportPanel(client) {
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

  const botPanels = messages.filter(message => message.author?.id === client.user.id);

  // Discord may normalize invisible text markers in Components V2 payloads.
  // Identify the persistent assistance panel by its attached header image as a fallback.
  const hasHeaderAndFooter = message =>
    message.attachments?.some(attachment => attachment.name === "assistance.png") &&
    message.attachments?.some(attachment => attachment.name === "banner.png");

  const currentPanel = botPanels.find(message =>
    JSON.stringify(message.components || []).includes(SUPPORT_PANEL_MARKER) &&
    hasHeaderAndFooter(message)
  ) || botPanels.find(message =>
    hasHeaderAndFooter(message) &&
    Array.isArray(message.components) &&
    message.components.length > 0
  );

  if (currentPanel) {
    // Do not delete/repost the panel on every startup. Other bot messages below it
    // (for example, command confirmations) are not panel duplicates.
    console.log("Existing assistance panel detected. Leaving it in place.");
    return;
  }

  // Only remove old panel-looking messages, not every message sent by this bot.
  const oldPanels = botPanels.filter(message =>
    message.attachments?.some(attachment =>
      ["assistance.png", "support.png"].includes(attachment.name)
    ) &&
    Array.isArray(message.components) &&
    message.components.length > 0
  );
  for (const panel of oldPanels) {
    await panel.delete().catch(error => {
      console.error("Failed to delete old Support panel:", error);
    });
  }

  await sendPanel(channel, client);
  console.log("Assistance panel posted because no existing panel was detected.");
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
  if (
    !parent ||
    !parent.isTextBased() ||
    typeof parent.threads?.create !== "function"
  ) {
    await interaction.editReply("The support channel is not configured correctly.");
    return;
  }

  const thread = await parent.threads
    .create({
      name: `${type.label} • ${interaction.user.username}`.slice(0, 100),
      autoArchiveDuration: 1440,
      type: 12,
      invitable: false,
      reason: `Support ticket created by ${interaction.user.tag}`,
    })
    .catch(() => null);

  if (!thread) {
    await interaction.editReply(
      "I couldn't create your support ticket. Please make sure the bot can create private threads in the support channel."
    );
    return;
  }

  const ticket = {
    threadId: thread.id,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    type: typeKey,
    teamRoleId: type.roleId,
    description,
    claimedBy: null,
    closed: false,
    closeRequestMessageId: null,
    closeRequestedAt: null,
    createdAt: new Date().toISOString(),
  };

  await thread.members.add(interaction.user.id).catch(() => {});
  await addRoleMembersToPrivateThread(thread, interaction.guild, type.roleId);
  await addHighRankMembers(thread, interaction.guild);

  const ping = await thread
    .send({ content: `<@&${type.roleId}>` })
    .catch(() => null);
  if (ping) setTimeout(() => ping.delete().catch(() => {}), 1500);

  await thread.send({
    components: ticketPanelComponents(ticket),
    files: ticketPanelFiles(),
    flags: MessageFlags.IsComponentsV2,
  });

  tickets[thread.id] = ticket;
  saveTickets(tickets);

  await interaction.editReply(
    `Your ${type.label} ticket has been created: <#${thread.id}>`
  );
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

  ticket.claimedBy = interaction.user.id;
  const tickets = readTickets();
  tickets[ticket.threadId] = ticket;
  saveTickets(tickets);

  const thread = interaction.channel;
  await thread.members.add(interaction.user.id).catch(() => {});
  // Keep the support team members in the private ticket thread after it is claimed.
  // Removing them here creates a public audit log entry for every removed member.
  await interaction.update({
    components: ticketPanelComponents(ticket),
    flags: MessageFlags.IsComponentsV2,
  });

  await thread.send({
    content: `This ticket has been claimed by <@${interaction.user.id}>.`,
  });
}

async function finalizeClose(interaction, ticket, closedById = null) {
  const thread = interaction.channel;
  if (!thread?.isThread()) return false;

  const tickets = readTickets();
  const latest = tickets[ticket.threadId];
  if (!latest || latest.closed) return false;

  // Mark the ticket as closing so another close action cannot start a second timer.
  latest.closing = true;
  latest.closeRequestedAt = null;
  tickets[ticket.threadId] = latest;
  saveTickets(tickets);

  // Keep the thread available for five seconds so the closure message can be seen.
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

  // Actually delete the ticket thread after the five-second closing period.
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

  // Senior HR can close any support ticket immediately. No closure request is sent.
  if (isHighRank(interaction.member)) {
    await interaction.deferUpdate();
    await interaction.channel.send("This support ticket will close in 5 seconds. It was closed by Senior HR.").catch(() => {});
    const closed = await finalizeClose(interaction, ticket, interaction.user.id);
    if (!closed) {
      await interaction.followUp({
        content: "I couldn't close this ticket. Please make sure I have permission to delete the support thread.",
        ephemeral: true,
      });
      return;
    }
    return;
  }

  if (!canRequestClosure(interaction.member, ticket)) {
    await interaction.reply({
      content:
        "Only the claiming staff member or the appropriate support team can request closure. The ticket opener must confirm the request.",
      ephemeral: true,
    });
    return;
  }

  const tickets = readTickets();
  const latest = tickets[ticket.threadId];
  if (!latest || latest.closed) {
    await interaction.reply({
      content: "This ticket is already closed.",
      ephemeral: true,
    });
    return;
  }

  if (latest.closeRequestMessageId) {
    await interaction.reply({
      content: "A closure request is already waiting for the ticket opener.",
      ephemeral: true,
    });
    return;
  }

  const message = await interaction.channel
    .send({
      components: closeRequestComponents(),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => null);

  if (!message) {
    await interaction.reply({
      content: "I couldn't create the closure request.",
      ephemeral: true,
    });
    return;
  }

  latest.closeRequestMessageId = message.id;
  latest.closeRequestedAt = Date.now();
  tickets[ticket.threadId] = latest;
  saveTickets(tickets);

  await interaction.reply({
    content: "Closure request sent to the ticket opener.",
    ephemeral: true,
  });
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

  // Ensure the Support panel is present and refresh it when the panel version changes.
  try {
    await ensureSupportPanel(client);
  } catch (error) {
    console.error("Support panel refresh error:", error);
  }

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

module.exports = { setup, ensureSupportPanel };
