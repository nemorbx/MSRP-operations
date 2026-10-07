require("dotenv").config();

const { Client, GatewayIntentBits, Partials, PermissionsBitField, ActivityType } = require("discord.js");

const { setup: setupInfractions } = require("./infractions");
const { setup: setupPromotions } = require("./promotions");
const { setup: setupApplications, ensureApplicationPanel } = require("./applications");
const { setup: setupSupport, ensureSupportPanel } = require("./support");
const { setup: setupCounting } = require("./counting");
const { setup: setupAFK } = require("./afk");
const { setup: setupStaffFeedback } = require("./staff-feedback");
const { setup: setupRegulations, ensureRegulationsPanel, postOrRefreshPanel } = require("./regulations");
const { purgeMessages } = require("./purge");
const { setup: setupMessageLogs } = require("./message-logs");
const { setup: setupGiveaway, giveawayCommand } = require("./giveaway");
const { setup: setupInformation, postOrRefreshInformationPanel } = require("./information");
const { setup: setupWelcome, commands: welcomeCommands } = require("./welcome");
const { setup: setupBooster } = require("./booster");
const { setup: setupSay, command: sayCommand } = require("./say");
const { setup: setupSuggestions, commands: suggestionCommands } = require("./suggestions");
const { setup: setupSticky } = require("./sticky");

const afkModule = require("./afk");
const infractionsModule = require("./infractions");
const promotionsModule = require("./promotions");
const countingModule = require("./counting");
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

setupInfractions(client);
setupPromotions(client);
setupApplications(client);
setupSupport(client);
setupCounting(client);
setupAFK(client);
setupStaffFeedback(client);
setupRegulations(client);
setupMessageLogs(client);
setupGiveaway(client);
setupInformation(client);
setupWelcome(client);
setupSticky(client);
setupBooster(client);
setupSay(client);
setupSuggestions(client);

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

  const parts = message.content.trim().split(/\\s+/);
  if (parts[0]?.toLowerCase() === "!afk" && parts[1]?.toLowerCase() === "remove") {
    const owner = await isBotOwner(message.author.id);
    if (owner && typeof afkModule.handlePrefixCommand === "function") {
      await afkModule.handlePrefixCommand(client, message, parts.slice(1), true);
    }
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.toLowerCase().startsWith("!purge")) return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.reply("You need the Manage Messages permission to use !purge.").catch(() => {});
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

client.once("clientReady", async () => {
  updateBotStatus();

  console.log("========================================");
  console.log("Logged in as " + client.user.tag);
  console.log("Missouri State Roleplay Operations is online.");
  console.log("GitHub deployment test: successful.");
  console.log("Features loaded: Applications, Support, Infractions, Promotions, Counting, AFK, Staff Feedback, Regulations, Information, Purge");
  console.log("========================================");

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
    console.error("Regulations panel refresh error:", error);
  }

  try {
    await postOrRefreshInformationPanel(client);
  } catch (error) {
    console.error("Information panel refresh error:", error);
  }

  try {
    const rawCommands = [
      ...(infractionsModule.commands || []),
      ...(promotionsModule.promoteCommand ? [promotionsModule.promoteCommand] : []),
      ...(afkModule.commands || []),
      ...(countingModule.commands || []),
      ...(giveawayModule.giveawayCommand ? [giveawayModule.giveawayCommand] : []),
      ...(staffFeedbackModule.feedbackCommand ? [staffFeedbackModule.feedbackCommand] : []),
      ...(staffFeedbackModule.staffRatingCommand ? [staffFeedbackModule.staffRatingCommand] : []),
      ...(suggestionCommands || []),
      ...(sayCommand ? [sayCommand] : []),
      ...(welcomeCommands || []),
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
  if (message.content.trim().toLowerCase() !== "!update-regulations") return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    await message.reply("You need the Manage Server permission to update the Regulations panel.");
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
