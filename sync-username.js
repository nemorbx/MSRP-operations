const { SlashCommandBuilder } = require("discord.js");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const BLOXLINK_API_KEY = process.env.BLOXLINK_API_KEY;

const command = new SlashCommandBuilder()
  .setName("sync-username")
  .setDescription("Set a member's server nickname to their linked Roblox username")
  .addUserOption(option =>
    option.setName("user")
      .setDescription("Discord member whose nickname should be updated")
      .setRequired(true)
  );

async function lookupRobloxUser(guildId, discordUserId) {
  if (!BLOXLINK_API_KEY) throw new Error("BLOXLINK_API_KEY is not configured.");

  const response = await fetch(
    "https://api.blox.link/v4/public/guilds/" + encodeURIComponent(guildId) +
      "/discord-to-roblox/" + encodeURIComponent(discordUserId),
    {
      headers: { Authorization: BLOXLINK_API_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Bloxlink returned HTTP " + response.status + ".");

  const result = await response.json();
  const account = result && (
    result.robloxID || result.robloxId || result.roblox_id ||
    result.primaryAccount || result.primary_account ||
    result.user?.robloxID || result.user?.robloxId || result.user?.roblox_id
  );
  const robloxId = typeof account === "object" && account !== null
    ? (account.robloxID || account.robloxId || account.id || account.roblox_id)
    : account;

  if (!robloxId || !/^\d+$/.test(String(robloxId))) return null;

  const userResponse = await fetch(
    "https://users.roblox.com/v1/users/" + encodeURIComponent(String(robloxId)),
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
  );
  if (!userResponse.ok) throw new Error("Roblox username lookup returned HTTP " + userResponse.status + ".");
  const user = await userResponse.json();
  if (!user?.name || typeof user.name !== "string") throw new Error("Roblox did not return a username.");
  return user.name;
}

const syncAllCommand = new SlashCommandBuilder()
  .setName("sync-all-usernames")
  .setDescription("Sync nicknames for all members linked through Bloxlink");

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || !["sync-username", "sync-all-usernames"].includes(interaction.commandName)) return;

    if (!interaction.inGuild() || !interaction.member?.roles?.cache?.has(SENIOR_HR_ROLE_ID)) {
      return interaction.reply({
        content: "You must have the **Senior High Rank** role to use this command.",
        ephemeral: true,
      });
    }


    if (interaction.commandName === "sync-all-usernames") {
      await interaction.deferReply({ ephemeral: true });
      try {
        // Use Discord's paginated REST member-list endpoint instead of a full
        // gateway member request, which can trigger opcode 8 rate limits.
        const members = [];
        let after = "0";
        while (true) {
          const batch = await interaction.guild.members.fetch({ limit: 1000, after });
          if (batch.size === 0) break;
          members.push(...batch.values());
          after = batch.last().id;
          if (batch.size < 1000) break;
        }
        const humanMembers = members.filter(member => !member.user.bot);
        let updated = 0, unlinked = 0, unchanged = 0, failed = 0;
        for (const member of humanMembers) {
          try {
            const username = await lookupRobloxUser(interaction.guildId, member.id);
            if (!username) { unlinked++; continue; }
            if (!member.manageable) { failed++; continue; }
            if (member.nickname === username) { unchanged++; continue; }
            await member.setNickname(username, "Senior High Rank bulk sync to linked Roblox username");
            updated++;
          } catch (error) {
            failed++;
            console.error("[Sync All Usernames] Failed for " + member.user.tag + ":", error?.message || error);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return interaction.editReply("✅ **Username sync completed.**\\nUpdated: **" + updated + "**\\nAlready correct: **" + unchanged + "**\\nNot linked through Bloxlink: **" + unlinked + "**\\nCould not update: **" + failed + "**");
      } catch (error) {
        console.error("[Sync All Usernames] Bulk sync failed:", error?.message || error);
        const detail = String(error?.message || error);
        if (/rate.?limit|opcode 8/i.test(detail)) {
          return interaction.editReply("⚠️ Discord rate-limited the member-list request. The sync stopped safely; wait for the limit to clear, then try again.");
        }
        return interaction.editReply("❌ I couldn't complete the bulk sync. Check the Central Issue Log and confirm Bloxlink is configured. Error: " + detail.slice(0, 300));
      }
    }

    const target = interaction.options.getMember("user");
    if (!target) {
      return interaction.reply({ content: "I couldn't find that Discord member in this server.", ephemeral: true });
    }

    if (target.id === client.user.id) {
      return interaction.reply({ content: "I can't change my own nickname with this command.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const robloxUsername = await lookupRobloxUser(interaction.guildId, target.id);
      if (!robloxUsername) {
        return interaction.editReply(
          "❌ **This user is not linked through Bloxlink.** Ask them to link their Roblox account, then try again."
        );
      }

      if (!target.manageable) {
        return interaction.editReply(
          "❌ I couldn't change this member's nickname. Make sure my role is above their highest role and I have **Manage Nicknames** permission."
        );
      }

      await target.setNickname(robloxUsername, "Senior High Rank synced nickname to linked Roblox username");
      return interaction.editReply("✅ Updated " + target.user.tag + "'s server nickname to **" + robloxUsername + "**.");
    } catch (error) {
      console.error("[Sync Username] Failed:", error?.message || error);
      return interaction.editReply(
        "❌ I couldn't sync that username. Check that Bloxlink is configured and the bot has **Manage Nicknames** permission, then try again."
      );
    }
  });
}

module.exports = { setup, commands: [command, syncAllCommand] };
