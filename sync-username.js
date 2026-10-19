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

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "sync-username") return;

    if (!interaction.inGuild() || !interaction.member?.roles?.cache?.has(SENIOR_HR_ROLE_ID)) {
      return interaction.reply({
        content: "You must have the **Senior High Rank** role to use this command.",
        ephemeral: true,
      });
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

module.exports = { setup, commands: [command] };
