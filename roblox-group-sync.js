const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");

const GROUP_ID = "974927500";
const STAFF_ROLE_ID = "896330003";
const LOG_CHANNEL_ID = "1561919652655796244";
const SENIOR_HR_ROLE_ID = "1551704056991318191";
const STAFF_ROLE_IDS = new Set([
  "1528242210871447672", // Staff Team
  "1527385806895976590", // Highway Patrol
  "1527385974290776144", // St. Louis County Police
  "1551985353802518588", // Awaiting Training (Trainee Staff)
]);
const DATA_PATH = path.join(__dirname, "roblox-group-sync-data.json");
const API_BASE = "https://apis.roblox.com/cloud/v2/groups/" + GROUP_ID;

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return { removalReviews: data.removalReviews || {}, confirmedReviews: data.confirmedReviews || {} };
  } catch {
    return { removalReviews: {}, confirmedReviews: {} };
  }
}
const data = loadData();
function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
function isEligible(member) {
  return [...STAFF_ROLE_IDS].some(roleId => member.roles.cache.has(roleId));
}
function isSeniorHROrAbove(member) {
  if (!member) return false;
  if (member.permissions.has("Administrator")) return true;
  if (member.roles.cache.has(SENIOR_HR_ROLE_ID)) return true;
  // Roles higher than Senior HR are expected to be above it in the configured Discord hierarchy.
  const seniorRole = member.guild.roles.cache.get(SENIOR_HR_ROLE_ID);
  return Boolean(seniorRole && member.roles.highest.position > seniorRole.position);
}
function getBloxlinkKey() {
  return process.env.BLOXLINK_API_KEY;
}
function getRobloxKey() {
  return process.env.ROBLOX_GROUP_API_KEY;
}
async function lookupRobloxId(discordId, guildId) {
  const key = getBloxlinkKey();
  if (!key) throw new Error("BLOXLINK_API_KEY is not configured.");
  const response = await fetch(
    "https://api.blox.link/v4/public/guilds/" + encodeURIComponent(guildId) +
    "/discord-to-roblox/" + encodeURIComponent(discordId),
    { headers: { Authorization: key, Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Bloxlink lookup returned HTTP " + response.status + ".");
  const result = await response.json();
  const value = result && (result.robloxID || result.robloxId || result.roblox_id ||
    result.primaryAccount || result.primary_account || result.user?.robloxID ||
    result.user?.robloxId || result.user?.roblox_id || result.user?.id);
  const id = typeof value === "object" && value ? (value.robloxID || value.robloxId || value.id || value.roblox_id) : value;
  return id && /^\d+$/.test(String(id)) ? String(id) : null;
}
async function robloxRequest(pathname, options = {}) {
  const key = getRobloxKey();
  if (!key) throw new Error("ROBLOX_GROUP_API_KEY is not configured.");
  const response = await fetch(API_BASE + pathname, {
    ...options,
    headers: { "x-api-key": key, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Roblox Open Cloud returned HTTP " + response.status + (body ? ": " + body.slice(0, 250) : ""));
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}
async function findMembership(robloxId) {
  const filter = encodeURIComponent("user == 'users/" + robloxId + "'");
  const result = await robloxRequest("/memberships?filter=" + filter);
  const memberships = result.groupMemberships || result.memberships || result.data || [];
  return memberships.find(item => item && (item.user?.path === "users/" + robloxId ||
    item.user?.id === robloxId || item.userId === robloxId)) || memberships[0] || null;
}
async function setStaffRole(robloxId) {
  const membership = await findMembership(robloxId);
  if (!membership) return { status: "not-in-group" };
  const membershipId = membership.path ? membership.path.split("/").pop() : membership.id;
  if (!membershipId) throw new Error("Roblox returned a membership without an ID.");
  const currentRole = membership.role;
  if (currentRole && (currentRole.path === "groups/" + GROUP_ID + "/roles/" + STAFF_ROLE_ID ||
      currentRole.id === STAFF_ROLE_ID || currentRole.roleId === STAFF_ROLE_ID)) {
    return { status: "already-correct" };
  }
  await robloxRequest("/memberships/" + encodeURIComponent(membershipId), {
    method: "PATCH",
    body: JSON.stringify({ role: "groups/" + GROUP_ID + "/roles/" + STAFF_ROLE_ID }),
  });
  return { status: "role-assigned" };
}

async function lookupDiscordIds(robloxId, guildId) {
  const key = getBloxlinkKey();
  if (!key) throw new Error("BLOXLINK_API_KEY is not configured.");
  const response = await fetch(
    "https://api.blox.link/v4/public/guilds/" + encodeURIComponent(guildId) +
    "/roblox-to-discord/" + encodeURIComponent(robloxId),
    { headers: { Authorization: key, Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Bloxlink reverse lookup returned HTTP " + response.status + ".");
  const result = await response.json();
  const ids = [
    ...(Array.isArray(result?.discordIDs) ? result.discordIDs : []),
    ...(Array.isArray(result?.discordIds) ? result.discordIds : []),
    ...(Array.isArray(result?.discord_ids) ? result.discord_ids : []),
    result?.discordID, result?.discordId, result?.discord_id,
    result?.primaryDiscordID, result?.primaryDiscordId, result?.primary_discord_id,
  ];
  return [...new Set(ids.filter(id => /^\d+$/.test(String(id || ""))).map(String))];
}
async function pollJoinRequests(client) {
  const guild = (process.env.DISCORD_GUILD_ID && client.guilds.cache.get(process.env.DISCORD_GUILD_ID)) ||
    client.guilds.cache.first();
  if (!guild || !getBloxlinkKey() || !getRobloxKey()) return;
  let pageToken = "";
  let scanned = 0;
  try {
    do {
      const query = pageToken ? "?pageToken=" + encodeURIComponent(pageToken) : "";
      const result = await robloxRequest("/join-requests" + query);
      const requests = result.groupJoinRequests || result.joinRequests || result.data || [];
      for (const request of requests) {
        if (scanned++ >= 100) return;
        const rawUser = request.user || request.requester || {};
        const path = rawUser.path || request.userPath || "";
        const robloxId = String(rawUser.id || rawUser.userId || request.userId || path.split("/").pop() || "");
        const requestPath = request.path || "";
        const requestId = request.id || request.joinRequestId || requestPath.split("/").pop();
        if (!/^\d+$/.test(robloxId) || !requestId) continue;
        const discordIds = await lookupDiscordIds(robloxId, guild.id);
        let eligibleMember = null;
        for (const discordId of discordIds) {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (member && isEligible(member)) { eligibleMember = member; break; }
        }
        if (!eligibleMember) continue; // Ineligible or unlinked requests intentionally remain pending.
        await robloxRequest("/join-requests/" + encodeURIComponent(requestId) + ":accept", { method: "POST" });
        let assigned = false;
        for (let attempt = 0; attempt < 3 && !assigned; attempt++) {
          if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
          try {
            const syncResult = await setStaffRole(robloxId);
            assigned = syncResult.status === "role-assigned" || syncResult.status === "already-correct";
            if (syncResult.status === "not-in-group") continue;
          } catch (error) {
            if (attempt === 2) throw error;
          }
        }
        await sendLog(client, "✅ Automatically accepted Roblox group join request for eligible staff member <@" + eligibleMember.id + "> (Roblox ID " + robloxId + "). " + (assigned ? "Staff role assignment verified." : "Role assignment will need a retry after Roblox membership finishes processing."));
      }
      pageToken = result.nextPageToken || "";
    } while (pageToken);
  } catch (error) {
    await sendLog(client, "⚠️ Roblox join-request check failed safely; requests were not declined. Error: " + String(error?.message || error).slice(0, 400));
  }
}

async function sendLog(client, message) {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (channel?.isTextBased()) await channel.send({ content: message, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("[Roblox Group Sync] Could not send log:", error?.message || error);
  }
}
function queueRemoval(discordId, robloxId, reason) {
  data.removalReviews[discordId] = {
    discordId, robloxId: robloxId || null, reason,
    createdAt: new Date().toISOString(), confirmedBy: null,
  };
  saveData();
}
const syncCommand = new SlashCommandBuilder()
  .setName("roblox-sync")
  .setDescription("Synchronize a staff member's Roblox group role")
  .addUserOption(option => option.setName("member").setDescription("Staff member to sync; omit to sync yourself").setRequired(false));
const reviewCommand = new SlashCommandBuilder()
  .setName("roblox-review")
  .setDescription("Review pending Roblox group removal checks");
const syncAllCommand = new SlashCommandBuilder()
  .setName("roblox-sync-all")
  .setDescription("Synchronize all currently eligible staff members' Roblox roles");
const confirmRemovalCommand = new SlashCommandBuilder()
  .setName("roblox-confirm-removal")
  .setDescription("Confirm a second eligibility check for a pending Roblox removal")
  .addUserOption(option => option.setName("member").setDescription("Member whose Roblox removal is being confirmed").setRequired(true));

async function handleSync(interaction) {
  const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const selectedUser = interaction.options.getUser("member");
  const target = selectedUser
    ? await interaction.guild.members.fetch(selectedUser.id).catch(() => null)
    : actor;
  if (!isSeniorHROrAbove(actor)) {
    await interaction.reply({ content: "Only Senior HR and above can use Roblox sync commands.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!target || !target.roles) {
    await interaction.reply({ content: "I couldn't resolve that Discord member. Try again.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isEligible(target)) {
    await interaction.reply({ content: "That member does not currently have a qualifying staff role. No Roblox changes were made.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const robloxId = await lookupRobloxId(target.id, interaction.guildId);
    if (!robloxId) {
      await interaction.editReply("No Bloxlink-linked Roblox account was found. Ask the member to link their account; no changes were made.");
      await sendLog(interaction.client, "⚠️ Roblox sync skipped for <@" + target.id + ">: no Bloxlink-linked account.");
      return;
    }
    const result = await setStaffRole(robloxId);
    if (result.status === "not-in-group") {
      await interaction.editReply("The linked Roblox account is not currently in group " + GROUP_ID + ". Ask them to request to join; eligible join requests can be handled by the automation.");
      await sendLog(interaction.client, "ℹ️ Roblox sync for <@" + target.id + "> (Roblox ID " + robloxId + "): not currently a group member.");
      return;
    }
    await interaction.editReply(result.status === "already-correct"
      ? "This member already has the configured staff Roblox role."
      : "Successfully assigned the configured staff Roblox role.");
    await sendLog(interaction.client, "✅ Roblox role sync for <@" + target.id + "> (Roblox ID " + robloxId + "): " + result.status + ".");
  } catch (error) {
    console.error("[Roblox Group Sync]", error);
    await interaction.editReply("Roblox sync failed safely. No removal was attempted. The error was logged; try again later.");
    await sendLog(interaction.client, "❌ Roblox sync failed for <@" + target.id + ">: " + String(error?.message || error).slice(0, 500));
  }
}
async function handleSyncAll(interaction) {
  const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSeniorHROrAbove(actor)) {
    await interaction.reply({ content: "Only Senior HR and above can run a full Roblox staff sync.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const members = await interaction.guild.members.fetch();
    const eligible = [...members.values()].filter(isEligible);
    let assigned = 0, alreadyCorrect = 0, unlinked = 0, notInGroup = 0, failed = 0;
    for (const member of eligible.slice(0, 250)) {
      try {
        const robloxId = await lookupRobloxId(member.id, interaction.guildId);
        if (!robloxId) { unlinked++; continue; }
        const result = await setStaffRole(robloxId);
        if (result.status === "role-assigned") assigned++;
        else if (result.status === "already-correct") alreadyCorrect++;
        else notInGroup++;
      } catch (error) {
        failed++;
        console.error("[Roblox Group Sync] Bulk sync error for " + member.id + ":", error?.message || error);
      }
    }
    await sendLog(interaction.client, "📋 Full Roblox staff sync completed by <@" + actor.id + ">. Checked " + Math.min(eligible.length, 250) + " of " + eligible.length + " eligible staff. Role assigned: " + assigned + "; already correct: " + alreadyCorrect + "; not in group: " + notInGroup + "; unlinked: " + unlinked + "; errors: " + failed + ".");
    await interaction.editReply("Roblox staff sync finished. Checked " + Math.min(eligible.length, 250) + " of " + eligible.length + " eligible staff.\nAssigned: " + assigned + "\nAlready correct: " + alreadyCorrect + "\nNot in group: " + notInGroup + "\nNo Bloxlink link: " + unlinked + "\nErrors: " + failed + (eligible.length > 250 ? "\nThere are more than 250 eligible members; run again after reviewing these results." : ""));
  } catch (error) {
    console.error("[Roblox Group Sync] Bulk sync failed:", error);
    await interaction.editReply("Full sync failed safely. No removals were attempted. Check the Roblox automation log and try again later.");
    await sendLog(interaction.client, "❌ Full Roblox staff sync failed: " + String(error?.message || error).slice(0, 400));
  }
}
async function handleReview(interaction) {
  const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSeniorHROrAbove(actor)) {
    await interaction.reply({ content: "Only Senior HR and above can review Roblox removal checks.", flags: MessageFlags.Ephemeral });
    return;
  }
  const entries = Object.values(data.removalReviews);
  if (!entries.length) {
    await interaction.reply({ content: "There are no pending Roblox removal reviews.", flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = entries.slice(0, 15).map((entry, index) =>
    (index + 1) + ". Discord: <@" + entry.discordId + "> • Roblox ID: " + (entry.robloxId || "unresolved") +
    "\n   Reason: " + entry.reason + " • Since: " + entry.createdAt.slice(0, 10) +
    (entry.confirmedBy ? " • Confirmed by <@" + entry.confirmedBy + ">" : " • Awaiting confirmation")
  );
  await interaction.reply({
    content: "**Pending Roblox removal reviews**\n" + lines.join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
async function handleConfirmRemoval(interaction) {
  const actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSeniorHROrAbove(actor)) {
    await interaction.reply({ content: "Only Senior HR and above can confirm Roblox removal reviews.", flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser("member");
  const review = data.removalReviews[user.id];
  if (!review) {
    await interaction.reply({ content: "No pending Roblox removal review exists for that user.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const currentMember = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (currentMember && isEligible(currentMember)) {
    delete data.removalReviews[user.id];
    saveData();
    await interaction.editReply("Removal cancelled: the member still has a qualifying staff role. Their Roblox group membership must be retained.");
    await sendLog(interaction.client, "✅ Roblox removal review cancelled for <@" + user.id + ">: second check found a qualifying role.");
    return;
  }
  let latestRobloxId = await lookupRobloxId(user.id, interaction.guildId).catch(() => review.robloxId);
  if (review.robloxId && latestRobloxId && String(review.robloxId) !== String(latestRobloxId)) {
    review.robloxId = latestRobloxId;
    review.confirmedBy = null;
    review.createdAt = new Date().toISOString();
    saveData();
    await interaction.editReply("The linked Roblox account changed. The review was refreshed and must be checked again before confirmation.");
    await sendLog(interaction.client, "⚠️ Roblox removal review refreshed for <@" + user.id + "> because their linked Roblox account changed.");
    return;
  }
  review.robloxId = latestRobloxId || null;
  review.confirmedBy = actor.id;
  review.confirmedAt = new Date().toISOString();
  saveData();
  await interaction.editReply("Second check confirmed and recorded. Important: Roblox Open Cloud does not currently expose a supported group-membership removal endpoint for this API key workflow, so this bot has NOT removed the user. A manager must remove the Roblox account manually.");
  await sendLog(interaction.client, "🛑 Roblox removal second-check confirmed by <@" + actor.id + "> for <@" + user.id + "> (Roblox ID " + (review.robloxId || "unresolved") + "). Manual Roblox group removal is still required; the bot did not perform it.");
}
async function syncMember(client, member, reason = "staff role update") {
  if (!member?.guild || member.guild.id !== process.env.DISCORD_GUILD_ID && process.env.DISCORD_GUILD_ID) return;
  if (!isEligible(member)) {
    if (member.roles.cache.size > 0) {
      try {
        const robloxId = await lookupRobloxId(member.id, member.guild.id);
        queueRemoval(member.id, robloxId, reason + ": no qualifying staff role remains");
        await sendLog(client, "🟠 Roblox removal review queued for <@" + member.id + "> (Roblox ID " + (robloxId || "unresolved") + "). Reason: " + reason + ". Staff confirmation is required. This bot will not remove group membership because the documented Open Cloud API does not expose a supported membership-removal endpoint.");
      } catch (error) {
        await sendLog(client, "⚠️ Could not resolve Roblox account for removal review for <@" + member.id + ">. No destructive change was made. Error: " + String(error?.message || error).slice(0, 300));
      }
    }
    return;
  }
  try {
    const robloxId = await lookupRobloxId(member.id, member.guild.id);
    if (!robloxId) {
      await sendLog(client, "⚠️ Staff member <@" + member.id + "> has no Bloxlink-linked Roblox account. Link required; no Roblox change made.");
      return;
    }
    const result = await setStaffRole(robloxId);
    await sendLog(client, result.status === "not-in-group"
      ? "ℹ️ <@" + member.id + "> is eligible, but their linked Roblox account is not in group " + GROUP_ID + "."
      : "✅ Staff role sync for <@" + member.id + "> (Roblox ID " + robloxId + "): " + result.status + ".");
  } catch (error) {
    await sendLog(client, "❌ Roblox sync failed safely for <@" + member.id + ">: " + String(error?.message || error).slice(0, 400));
  }
}
function setup(client) {
  client.once("clientReady", () => {\n    // Poll only after the bot is ready; unlinked/ineligible requests are left pending.\n    pollJoinRequests(client).catch(error => console.error("[Roblox Group Sync] Join-request poll failed:", error));\n    setInterval(() => pollJoinRequests(client).catch(error => console.error("[Roblox Group Sync] Join-request poll failed:", error)), 5 * 60 * 1000);\n  });
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const before = [...STAFF_ROLE_IDS].some(id => oldMember.roles.cache.has(id));
    const after = isEligible(newMember);
    if (before === after && ![...STAFF_ROLE_IDS].some(id => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id))) return;
    await syncMember(client, newMember, "qualifying role changed");
  });
  client.on("guildMemberRemove", async member => {
    if (!isEligible(member)) return;
    try {
      const robloxId = await lookupRobloxId(member.id, member.guild.id);
      queueRemoval(member.id, robloxId, "left the main Discord server");
      await sendLog(client, "🟠 Roblox removal review queued for departed member <@" + member.id + "> (Roblox ID " + (robloxId || "unresolved") + "). Second check and staff confirmation are required. Automatic group removal is not available through the documented Open Cloud membership endpoints, so no destructive change was made.");
    } catch (error) {
      queueRemoval(member.id, null, "left the main Discord server; Bloxlink lookup failed");
      await sendLog(client, "⚠️ Departed Discord member <@" + member.id + "> queued for Roblox removal review, but Bloxlink lookup failed. No destructive change was made.");
    }
  });
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    if (interaction.commandName === "roblox-sync") await handleSync(interaction);
    if (interaction.commandName === "roblox-review") await handleReview(interaction);
    if (interaction.commandName === "roblox-sync-all") await handleSyncAll(interaction);
    if (interaction.commandName === "roblox-confirm-removal") await handleConfirmRemoval(interaction);
  });
}
module.exports = { setup, commands: [syncCommand, reviewCommand, confirmRemovalCommand, syncAllCommand] };
