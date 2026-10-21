const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const WHITELISTED_GROUP_ID = "974927500";
const PUBLIC_GROUP_ID = "362792702";
const PUBLIC_GROUP_URL = "https://www.roblox.com/communities/362792702/Missouri-State-Roleplay-MSRP#!/about";
const SENIOR_HR_ROLE_ID = "1551704056991318191";
const GROUP_LOG_CHANNEL_ID = "1561919652655796244";
const ELIGIBLE_STAFF_ROLE_IDS = ["1528242210871447672", "1527385806895976590", "1527385974290776144", "1551985353802518588"];

const groupCommand = new SlashCommandBuilder()
  .setName("group")
  .setDescription("Roblox group tools")
  .addSubcommand(s => s.setName("request").setDescription("Get instructions to request access to the whitelisted Roblox group"))
  .addSubcommand(s => s.setName("info").setDescription("Show information for both MSRP Roblox groups"))
  .addSubcommand(s => s.setName("accept").setDescription("Accept a pending Roblox group join request (Senior HR+)")
    .addStringOption(o => o.setName("roblox_user_id").setDescription("Roblox user ID of the pending requester").setRequired(true)));

function isSeniorHROrAbove(member) {
  if (!member) return false;
  if (member.permissions.has("Administrator") || member.roles.cache.has(SENIOR_HR_ROLE_ID)) return true;
  const seniorRole = member.guild.roles.cache.get(SENIOR_HR_ROLE_ID);
  return Boolean(seniorRole && member.roles.highest.position > seniorRole.position);
}

async function robloxJson(url, options = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json", ...(options.headers || {}) }, signal: AbortSignal.timeout(12000), ...options });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Roblox API returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 700) : ""));
  }
  return response.json();
}

async function groupInfo(groupId) {
  return robloxJson("https://groups.roblox.com/v1/groups/" + groupId);
}

async function logGroupCheck(client, message) {
  try {
    const channel = await client.channels.fetch(GROUP_LOG_CHANNEL_ID);
    if (channel?.isTextBased()) await channel.send({ content: message, allowedMentions: { parse: [] } });
    else console.error('[Group Checks] Configured log channel is missing or not text-based.');
  } catch (error) { console.error('[Group Checks] Could not send group-check log:', error?.message || error); }
}

async function lookupLinkedRobloxId(guildId, discordId) {
  const key = process.env.BLOXLINK_API_KEY;
  if (!key) throw new Error('BLOXLINK_API_KEY is not configured.');
  const response = await fetch('https://api.blox.link/v4/public/guilds/' + encodeURIComponent(guildId) + '/discord-to-roblox/' + encodeURIComponent(discordId), { headers: { Authorization: key, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Bloxlink lookup returned HTTP ' + response.status + '.');
  const result = await response.json();
  const raw = result?.robloxID || result?.robloxId || result?.roblox_id || result?.primaryAccount || result?.primary_account || result?.user?.robloxID || result?.user?.robloxId || result?.user?.id;
  const id = raw && typeof raw === 'object' ? (raw.robloxID || raw.robloxId || raw.id || raw.roblox_id) : raw;
  return id && /^\d+$/.test(String(id)) ? String(id) : null;
}

async function listPendingRequests() {
  const key = process.env.ROBLOX_GROUP_API_KEY;
  if (!key) throw new Error("ROBLOX_GROUP_API_KEY is not configured in the hosting environment.");

  const allRequests = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ maxPageSize: "20" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await robloxJson("https://apis.roblox.com/cloud/v2/groups/" + WHITELISTED_GROUP_ID + "/join-requests?" + params.toString(), {
      headers: { "x-api-key": key },
    });
    allRequests.push(...(response.groupJoinRequests || response.joinRequests || response.data || []));
    pageToken = response.nextPageToken || "";
    if (!pageToken) break;
  }
  return allRequests;
}

function getJoinRequestUserId(request) {
  // Roblox's documented GroupJoinRequest schema represents user as a string,
  // for example "users/8259993925", not necessarily an object.
  const user = request.user || request.requester || "";
  const candidates = [
    typeof user === "string" ? user : "",
    user && typeof user === "object" ? (user.path || user.id || user.userId || user.robloxId || "") : "",
    request.userPath || request.userId || request.robloxUserId || "",
  ];
  for (const candidate of candidates) {
    const id = String(candidate || "").split("/").filter(Boolean).pop();
    if (/^\d+$/.test(id || "")) return id;
  }
  return null;
}

async function acceptRequest(robloxUserId) {
  const key = process.env.ROBLOX_GROUP_API_KEY;
  if (!key) throw new Error("ROBLOX_GROUP_API_KEY is not configured in the hosting environment.");

  // Avoid the user filter here: Roblox's GroupJoinRequest schema returns user
  // as a resource-name string, so match that documented shape locally.
  const requests = await listPendingRequests();
  const request = requests.find(item => getJoinRequestUserId(item) === String(robloxUserId));
  if (!request) return false;

  // The documented resource path is groups/{groupId}/join-requests/{joinRequestId};
  // the join-request ID is the final path segment (often the user's ID).
  const resourceName = request.path || request.name || "";
  const requestId = resourceName.split("/").filter(Boolean).pop() ||
    request.joinRequestId || request.id;
  if (!requestId) throw new Error("Roblox returned a pending request without an ID.");

  await robloxJson("https://apis.roblox.com/cloud/v2/groups/" + WHITELISTED_GROUP_ID + "/join-requests/" + encodeURIComponent(requestId) + ":accept", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return true;
}

async function handleGroupCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "info") return handleGroupInfo(interaction);
  if (sub === "request") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const eligible = ELIGIBLE_STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
      const robloxId = await lookupLinkedRobloxId(interaction.guildId, interaction.user.id);
      if (eligible && robloxId) {
        const accepted = await acceptRequest(robloxId);
        const result = accepted ? "Eligible staff member has a linked Roblox account; their pending request was accepted." : "Eligible staff member is linked, but no pending request was found. No group changes were made.";
        await logGroupCheck(interaction.client, "🔎 **Roblox group request**\nDiscord user: <@" + interaction.user.id + ">\nRoblox user ID: " + robloxId + "\nResult: " + result);
        return interaction.editReply((accepted ? "Your pending request was accepted." : "I could not find a pending request for your linked Roblox account.") + "\nWhitelisted group: https://www.roblox.com/communities/974927500/MSRP-WhiteIisted#!/about");
      }
      const reason = !eligible ? "The Discord member does not have an eligible staff role." : "No linked Roblox account could be resolved."; 
      await logGroupCheck(interaction.client, "🕓 **Roblox group request requires review**\nDiscord user: <@" + interaction.user.id + ">\nReason: " + reason);
      return interaction.editReply("Your request needs Senior HR+ approval. " + reason + " Join/request to join the whitelisted group first, and make sure your Roblox account is linked through Bloxlink.\nWhitelisted group: https://www.roblox.com/communities/974927500/MSRP-WhiteIisted#!/about");
    } catch (error) {
      console.error("[Group Request]", error);
      await logGroupCheck(interaction.client, "❌ **Roblox group request check failed**\nRequested by: <@" + interaction.user.id + ">\nError: " + String(error?.message || error).slice(0, 500));
      return interaction.editReply("I could not verify or process your request right now. No group change was made. Please contact Senior HR+.");
    }
  }
  const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSeniorHROrAbove(actor)) {
    return interaction.reply({ content: "Only Senior HR and above can accept Roblox group requests.", flags: MessageFlags.Ephemeral });
  }
  const robloxUserId = interaction.options.getString("roblox_user_id", true).trim();
  if (!/^\d{1,20}$/.test(robloxUserId)) {
    return interaction.reply({ content: "Enter a numeric Roblox user ID.", flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const accepted = await acceptRequest(robloxUserId);
    return interaction.editReply(accepted
      ? "Accepted the pending join request for Roblox user ID " + robloxUserId + "."
      : "No pending join request was found for Roblox user ID " + robloxUserId + ". No change was made.");
  } catch (error) {
    console.error("[Group Accept]", error);
    return interaction.editReply("I couldn't accept that request. Check the Roblox API key's group:read and group:write permissions and review the bot logs. No other changes were made.");
  }
}

async function handleGroupInfo(interaction) {
  await interaction.deferReply();
  try {
    const [white, publicGroup] = await Promise.all([groupInfo(WHITELISTED_GROUP_ID), groupInfo(PUBLIC_GROUP_ID)]);
    const ownerName = group => group.owner?.username || group.owner?.displayName || 'Unavailable';
    const count = group => Number.isFinite(group.memberCount) ? group.memberCount.toLocaleString('en-US') : 'Unavailable';
    const ticks = String.fromCharCode(96,96);
    const groupBlock = (title, id, group, linkLabel) => '## ' + title + ' (' + id + ')\n' + 'Member count: ' + ticks + count(group) + ticks + '\n' + 'Group Owner: ' + ticks + ownerName(group) + ticks + '\n' + 'Group Link: [' + linkLabel + '](<' + (id === PUBLIC_GROUP_ID ? PUBLIC_GROUP_URL : 'https://www.roblox.com/communities/' + id + '/#!/about') + '>)';
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(groupBlock('Whitelisted Group', WHITELISTED_GROUP_ID, white, 'Whitelisted Group')));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(groupBlock('Public Group', PUBLIC_GROUP_ID, publicGroup, 'Public Group')));
    const bannerPath = path.join(__dirname, 'banner.png');
    const files = [];
    if (fs.existsSync(bannerPath)) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
      container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://banner.png')));
      files.push(new AttachmentBuilder(bannerPath, { name: 'banner.png' }));
    }
    await interaction.editReply({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
    await logGroupCheck(interaction.client, '🔎 **Roblox group information checked**\nRequested by: <@' + interaction.user.id + '>\nWhitelisted group ' + WHITELISTED_GROUP_ID + ': ' + count(white) + ' members; owner ' + ownerName(white) + '.\nPublic group ' + PUBLIC_GROUP_ID + ': ' + count(publicGroup) + ' members; owner ' + ownerName(publicGroup) + '.');
  } catch (error) {
    console.error('[Group Info]', error);
    await logGroupCheck(interaction.client, '❌ **Roblox group information check failed**\nRequested by: <@' + interaction.user.id + '>\nError: ' + String(error?.message || error).slice(0, 500));
    return interaction.editReply('I could not retrieve group information from Roblox right now. Please try again later.');
  }
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    try {
      if (interaction.commandName === "group") await handleGroupCommand(interaction);
    } catch (error) {
      console.error("[Group Commands]", error);
      const message = "The group command failed safely. Please try again later.";
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { setup, commands: [groupCommand] };
