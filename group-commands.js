const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const WHITELISTED_GROUP_ID = "974927500";
const PUBLIC_GROUP_ID = "362792702";
const SENIOR_HR_ROLE_ID = "1551704056991318191";

const groupCommand = new SlashCommandBuilder()
  .setName("group")
  .setDescription("Roblox group tools")
  .addSubcommand(s => s.setName("request").setDescription("Get instructions to request access to the whitelisted Roblox group"))
  .addSubcommand(s => s.setName("accept").setDescription("Accept a pending Roblox group join request (Senior HR+)")
    .addStringOption(o => o.setName("roblox_user_id").setDescription("Roblox user ID of the pending requester").setRequired(true)));

const groupInfoCommand = new SlashCommandBuilder()
  .setName("group-info")
  .setDescription("Show information for MSRP's whitelisted and public Roblox groups");

function isSeniorHROrAbove(member) {
  if (!member) return false;
  if (member.permissions.has("Administrator") || member.roles.cache.has(SENIOR_HR_ROLE_ID)) return true;
  const seniorRole = member.guild.roles.cache.get(SENIOR_HR_ROLE_ID);
  return Boolean(seniorRole && member.roles.highest.position > seniorRole.position);
}

async function robloxJson(url, options = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json", ...(options.headers || {}) }, signal: AbortSignal.timeout(12000), ...options });
  if (!response.ok) throw new Error("Roblox API returned HTTP " + response.status);
  return response.json();
}

async function groupInfo(groupId) {
  return robloxJson("https://groups.roblox.com/v1/groups/" + groupId);
}

async function listPendingRequests(robloxUserId) {
  const key = process.env.ROBLOX_GROUP_API_KEY;
  if (!key) throw new Error("ROBLOX_GROUP_API_KEY is not configured in the hosting environment.");
  const filter = encodeURIComponent("user == 'users/" + robloxUserId + "'");
  const response = await robloxJson("https://apis.roblox.com/cloud/v2/groups/" + WHITELISTED_GROUP_ID + "/join-requests?filter=" + filter + "&maxPageSize=20", {
    headers: { "x-api-key": key },
  });
  return response.groupJoinRequests || response.joinRequests || response.data || [];
}

async function acceptRequest(robloxUserId) {
  const key = process.env.ROBLOX_GROUP_API_KEY;
  if (!key) throw new Error("ROBLOX_GROUP_API_KEY is not configured in the hosting environment.");
  const requests = await listPendingRequests(robloxUserId);
  const request = requests.find(item => {
    const user = item.user || item.requester || {};
    const userPath = user.path || item.userPath || "";
    const id = user.id || user.userId || item.userId || userPath.split("/").pop();
    return String(id) === String(robloxUserId);
  });
  if (!request) return false;
  const requestId = request.id || request.joinRequestId || String(request.path || "").split("/").pop();
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
  if (sub === "request") {
    return interaction.reply({
      content: "To request access, open the whitelisted Roblox group and select **Join Group**: https://www.roblox.com/communities/" + WHITELISTED_GROUP_ID + "/. Eligible staff with a linked Discord/Roblox account are checked automatically about every five minutes. Other requests remain pending for Senior HR+ review.",
      flags: MessageFlags.Ephemeral,
    });
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
    const embed = new EmbedBuilder()
      .setTitle("MSRP Roblox Groups")
      .setDescription("Whitelisted and public group information")
      .addFields(
        { name: "Whitelisted Group", value: "[" + (white.name || "Open group") + "](https://www.roblox.com/communities/" + WHITELISTED_GROUP_ID + "/)\n**Group ID:** " + WHITELISTED_GROUP_ID + "\n**Members:** " + (Number.isFinite(white.memberCount) ? white.memberCount.toLocaleString() : "Unavailable") + "\n**Owner:** " + (white.owner?.username || white.owner?.displayName || "Unavailable"), inline: true },
        { name: "Public Group", value: "[" + (publicGroup.name || "Open group") + "](https://www.roblox.com/communities/" + PUBLIC_GROUP_ID + "/)\n**Group ID:** " + PUBLIC_GROUP_ID + "\n**Members:** " + (Number.isFinite(publicGroup.memberCount) ? publicGroup.memberCount.toLocaleString() : "Unavailable") + "\n**Owner:** " + (publicGroup.owner?.username || publicGroup.owner?.displayName || "Unavailable"), inline: true }
      )
      .setColor(0x2878D0)
      .setFooter({ text: "Information retrieved from Roblox's public group API" });
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Group Info]", error);
    return interaction.editReply("I couldn't retrieve group information from Roblox right now. Please try again later.");
  }
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    try {
      if (interaction.commandName === "group") await handleGroupCommand(interaction);
      else if (interaction.commandName === "group-info") await handleGroupInfo(interaction);
    } catch (error) {
      console.error("[Group Commands]", error);
      const message = "The group command failed safely. Please try again later.";
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

module.exports = { setup, commands: [groupCommand, groupInfoCommand] };
