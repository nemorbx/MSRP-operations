require("dotenv").config();

const { Client, GatewayIntentBits, Partials, PermissionsBitField, ActivityType } = require("discord.js");

const { setup: setupInfractions } = require("./infractions");
const { setup: setupPromotions } = require("./promotions");
const { setup: setupApplications, ensureApplicationPanel } = require("./applications");
const { setup: setupSupport, ensureSupportPanel, commands: supportCommands } = require("./support");
const { setup: setupAFK } = require("./afk");
const { setup: setupStaffFeedback } = require("./staff-feedback");
const { setup: setupRegulations, ensureRegulationsPanel, postOrRefreshPanel } = require("./regulations");
const { purgeMessages } = require("./purge");
const { setup: setupMessageLogs } = require("./message-logs");
const { setup: setupGiveaway, giveawayCommand } = require("./giveaway");
const { setup: setupInformation, postOrRefreshInformationPanel } = require("./information");
const { setup: setupRolePerks, postOrRefreshRolePerksPanel } = require("./roleperks");
const { setup: setupWelcome, commands: welcomeCommands } = require("./welcome");
const { postOrRefreshVerificationPanel } = require("./verification-panel");
const { setup: setupBooster } = require("./booster");
const { setup: setupDonations, ensureDonationPanel } = require("./donations");
const { setup: setupSay, command: sayCommand } = require("./say");
const { setup: setupSuggestions, commands: suggestionCommands } = require("./suggestions");
const { setup: setupSticky } = require("./sticky");
const { setup: setupMarketplace, ensureMarketplacePanel } = require("./marketplace");
const { setup: setupSessions, ensureSessionPanel, startSessionRefresh } = require("./sessions");
const { setup: setupTraining, commands: trainingCommands } = require("./training");
const { setup: setupAdQueue, commands: adQueueCommands } = require("./ad-queue");
const { setup: setupPartnership, commands: partnershipCommands } = require("./partnership");
const { setupBotIssueLogs } = require("./bot-issue-logs");
const { setup: setupGroupCommands, commands: groupCommands } = require("./group-commands");

const afkModule = require("./afk");
const infractionsModule = require("./infractions");
const promotionsModule = require("./promotions");
const giveawayModule = require("./giveaway");
const staffFeedbackModule = require("./staff-feedback");

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) throw new Error("DISCORD_TOKEN is missing from environment");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Each feature module registers intentional handlers on this shared client.
// Raise the threshold to prevent false-positive warnings for the modular event setup.
client.setMaxListeners(30);

// Centralized logging for errors and warnings across all bot systems.
setupBotIssueLogs(client);

setupInfractions(client);
setupPromotions(client);
setupApplications(client);
setupSupport(client);
setupAFK(client);
setupStaffFeedback(client);
setupRegulations(client);
setupMessageLogs(client);
setupGiveaway(client);
setupInformation(client);
setupRolePerks(client);
setupWelcome(client);
setupSticky(client);
setupMarketplace(client);
setupBooster(client);
setupDonations(client);
setupSay(client);
setupSuggestions(client);
setupSessions(client);
setupTraining(client);
setupAdQueue(client);
setupPartnership(client);
setupGroupCommands(client);

const MEMBER_ROLE_ID = "1527373127422709862";

function updateBotStatus() {
  const guild = client.guilds.cache.first();
  const memberCount = guild?.memberCount ?? 0;

  client.user.setPresence({
    activities: [
      {
        name: `Powering ${memberCount} Members`,
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  });
}

client.on("guildMemberAdd", async member => {
  updateBotStatus();

  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);

    if (!role) {
      console.error("Member role not found in " + member.guild.name + " (" + MEMBER_ROLE_ID + ")");
      return;
    }

    if (role.position >= member.guild.members.me.roles.highest.position) {
      console.error("Member role is not below the bot's highest role in " + member.guild.name);
      return;
    }

    if (member.roles.cache.has(MEMBER_ROLE_ID)) return;

    await member.roles.add(role, "Automatic Member role on server join");
    console.log("Automatically assigned Member role to " + member.user.tag);
  } catch (error) {
    console.error("Failed to assign Member role to " + member.user.tag + ":", error);
  }
});

client.on("guildMemberRemove", () => {
  updateBotStatus();
});

async function isBotOwner(userId) {
  try {
    await client.application.fetch();
    const owner = client.application.owner;
    if (!owner) return false;
    if (owner.members) return owner.members.has(userId);
    return owner.id === userId;
  } catch (error) {
    console.error("Unable to verify bot owner:", error);
    return false;
  }
}

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const parts = message.content.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() === "!afk" && parts[1]?.toLowerCase() === "remove") {
    const owner = await isBotOwner(message.author.id);
    if (owner && typeof afkModule.handlePrefixCommand === "function") {
      await afkModule.handlePrefixCommand(client, message, ["afk", "remove"], true);
    }
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.toLowerCase().startsWith("!purge")) return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.reply("You don't have permission to use this command.").catch(() => {});
    return;
  }

  const parts = message.content.trim().split(/\s+/);
  const amount = Number(parts[1]);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    await message.reply("Usage: !purge <1-100>").catch(() => {});
    return;
  }

  try {
    const result = await purgeMessages(
      message.channel,
      amount,
      message,
      deletedMessage => {
        if (client.messageLogPurgeDeletes) client.messageLogPurgeDeletes.add(deletedMessage.id);
      }
    );

    if (client.sendPurgeLog) {
      await client.sendPurgeLog(message.guild, {
        executorId: message.author.id,
        amount,
        deletedCount: result.deleted,
        channelId: message.channel.id,
      });
    }

    const confirmation = await message.channel.send("🧹 Purged " + result.deleted + " message" + (result.deleted === 1 ? "." : "s.")).catch(() => null);
    if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), 3000);
  } catch (error) {
    console.error("Purge command error:", error);
    await message.reply("I could not purge those messages. Check my permissions and try again.").catch(() => {});
  }
});

async function testMelonlyApi() {
  const apiToken = process.env.MELONLY_API_TOKEN;
  if (!apiToken) {
    console.log("[Melonly API] Test skipped: MELONLY_API_TOKEN is not configured in the bot environment.");
    return;
  }

  try {
    const response = await fetch("https://api.melonly.xyz/api/v1/server/info", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + apiToken,
      },
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error("[Melonly API] Test failed with HTTP " + response.status + ". Response: " + responseText.slice(0, 500));
      return;
    }

    let serverInfo;
    try {
      serverInfo = JSON.parse(responseText);
    } catch {
      serverInfo = null;
    }

    console.log("[Melonly API] Connection test successful (HTTP " + response.status + ").");
    if (serverInfo && typeof serverInfo === "object") {
      console.log("[Melonly API] Server info response keys: " + Object.keys(serverInfo).join(", "));
    } else {
      console.log("[Melonly API] Server info endpoint returned a successful response.");
    }
  } catch (error) {
    console.error("[Melonly API] Connection test failed:", error?.message || error);
  }
}

client.once("clientReady", async () => {
  updateBotStatus();

  console.log("========================================");
  console.log("Logged in as " + client.user.tag);
  console.log("Missouri State Roleplay Operations is online.");
  console.log("GitHub deployment test: successful.");
  console.log("Features loaded: Applications, Support, Infractions, Promotions, AFK, Staff Feedback, Regulations, Information, Role Perks, Marketplace, Purge, Booster, Say, Suggestions, Sticky, Welcome");
  console.log("========================================");

  await testMelonlyApi();

  try {
    await ensureDonationPanel(client);
  } catch (error) {
    console.error("Donation leaderboard startup error:", error);
  }

  try {
    await ensureSessionPanel(client);
    startSessionRefresh(client);
  } catch (error) {
    console.error("Session panel startup error:", error);
  }

  try {
    await ensureApplicationPanel(client);
  } catch (error) {
    console.error("Application panel refresh error:", error);
  }

  try {
    await ensureSupportPanel(client);
  } catch (error) {
    console.error("Support panel refresh error:", error);
  }

  try {
    await ensureRegulationsPanel(client);
  } catch (error) {
    console.error("Regulations panel restore/update error:", error);
  }

  // Marketplace is persistent; do not edit or repost it during startup.

  try {
    await postOrRefreshInformationPanel(client);
  } catch (error) {
    console.error("Information panel refresh error:", error);
  }

  try {
    await postOrRefreshVerificationPanel(client);
  } catch (error) {
    console.error("Verification panel refresh error:", error);
  }

  try {
    await postOrRefreshRolePerksPanel(client);
  } catch (error) {
    console.error("Role Perks panel refresh error:", error);
  }

  try {
    // MSRP commands are registered per guild below. Remove any legacy global
    // registrations first so stale global /promote entries do not appear beside
    // the current guild command in Discord's command picker.
    try {
      await client.application.commands.set([]);
      console.log("Cleared legacy global MSRP slash commands.");
    } catch (globalCommandError) {
      console.error("Could not clear legacy global slash commands:", globalCommandError);
    }

    const rawCommands = [
      ...(infractionsModule.commands || []),
      ...(promotionsModule.promoteCommand ? [promotionsModule.promoteCommand] : []),
      ...(afkModule.commands || []),
      ...(giveawayModule.giveawayCommand ? [giveawayModule.giveawayCommand] : []),
      ...(staffFeedbackModule.feedbackCommand ? [staffFeedbackModule.feedbackCommand] : []),
      ...(staffFeedbackModule.staffRatingCommand ? [staffFeedbackModule.staffRatingCommand] : []),
      ...(suggestionCommands || []),
      ...(sayCommand ? [sayCommand] : []),
      ...(welcomeCommands || []),
      ...(trainingCommands || []),
      ...(adQueueCommands || []),
      ...(partnershipCommands || []),
      ...(groupCommands || []),
      ...(supportCommands || []),
    ];

    const commandDefinitions = rawCommands.map(command =>
      typeof command?.toJSON === "function" ? command.toJSON() : command
    );

    const seen = new Set();
    const uniqueCommands = commandDefinitions.filter(command => {
      if (!command?.name || seen.has(command.name)) return false;
      seen.add(command.name);
      return true;
    }).map(command => ({
      ...command,
      dm_permission: false,
    }));

    for (const guild of client.guilds.cache.values()) {
      await guild.commands.set(uniqueCommands);
      console.log("Registered " + uniqueCommands.length + " MSRP slash commands in " + guild.name + ": " + uniqueCommands.map(command => "/" + command.name).join(", "));
    }
  } catch (error) {
    console.error("Slash command registration error:", error);
  }

  // Refresh periodically so the displayed member count stays accurate.
  setInterval(updateBotStatus, 60 * 1000);
});


client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== "!update-verification") return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    await message.reply("You don't have permission to update the Verification panel.").catch(() => {});
    return;
  }

  try {
    await postOrRefreshVerificationPanel(client, { forceRefresh: true });
    const confirmation = await message.reply("Verification panel refreshed; duplicate panels were removed.").catch(() => null);
    if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), 3000);
  } catch (error) {
    console.error("Verification update command error:", error);
    await message.reply("I could not update the Verification panel. Check the Central Issue Log.").catch(() => {});
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== "!update-regulations") return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    await message.reply("You don't have permission to update the Regulations panel.");
    return;
  }

  try {
    await postOrRefreshPanel(client);
    const confirmation = await message.reply("Regulations panel updated.").catch(() => null);
    if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), 3000);
  } catch (error) {
    console.error("Regulations update command error:", error);
    await message.reply("I could not update the Regulations panel.").catch(() => {});
  }
});

client.on("error", error => console.error("Discord client error:", error));
process.on("unhandledRejection", error => console.error("Unhandled promise rejection:", error));
process.on("uncaughtException", error => console.error("Uncaught exception:", error));

console.log("Starting Missouri State Roleplay Operations...");
client.login(TOKEN).catch(error => console.error("Discord login failed:", error));

// FadeHost auto-deploy trigger test.
