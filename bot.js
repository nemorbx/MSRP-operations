require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes, Partials, PermissionsBitField } = require("discord.js");

const { setup: setupInfractions, commands: infractionCommands } = require("./infractions");
const { setup: setupPromotions, promoteCommand } = require("./promotions");
const { setup: setupApplications } = require("./applications");
const { setup: setupSupport } = require("./support");
const { setup: setupCounting, commands: countingCommands } = require("./counting");
const { setup: setupAFK, commands: afkCommands } = require("./afk");
const { setup: setupStaffFeedback, feedbackCommand, staffRatingCommand } = require("./staff-feedback");
const { setup: setupRegulations } = require("./regulations");
const { purgeMessages } = require("./purge");
const { setup: setupMessageLogs } = require("./message-logs");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) throw new Error("DISCORD_TOKEN is missing from .env");
if (!CLIENT_ID) throw new Error("CLIENT_ID is missing from .env");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
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

const commands = [
  ...infractionCommands,
  promoteCommand.toJSON(),
  ...countingCommands,
  ...afkCommands,
  feedbackCommand.toJSON(),
  staffRatingCommand.toJSON(),
];

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
  console.log("========================================");
  console.log("Logged in as " + client.user.tag);
  console.log("Missouri State Roleplay Operations is online.");
  console.log("GitHub deployment test: successful.");
  console.log("Features loaded: Applications, Support, Infractions, Promotions, Counting, AFK, Staff Feedback, Regulations, Purge");
  console.log("========================================");

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("All slash commands registered.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on("error", error => console.error("Discord client error:", error));
process.on("unhandledRejection", error => console.error("Unhandled promise rejection:", error));
process.on("uncaughtException", error => console.error("Uncaught exception:", error));

console.log("Starting Missouri State Roleplay Operations...");
client.login(TOKEN).catch(error => console.error("Discord login failed:", error));

// FadeHost auto-deploy trigger test.
