require("dotenv").config();

const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require("discord.js");

const { setup: setupInfractions } = require("./infractions");
const { setup: setupPromotions } = require("./promotions");
const { setup: setupApplications } = require("./applications");
const { setup: setupSupport } = require("./support");
const { setup: setupCounting } = require("./counting");
const { setup: setupAFK } = require("./afk");
const { setup: setupStaffFeedback } = require("./staff-feedback");
const { setup: setupRegulations } = require("./regulations");
const { purgeMessages } = require("./purge");
const { setup: setupMessageLogs } = require("./message-logs");

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

const MEMBER_ROLE_ID = "1527373127422709862";

client.on("guildMemberAdd", async member => {
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

  console.log("Slash commands are already registered; skipping registration during startup.");
});

client.on("error", error => console.error("Discord client error:", error));
process.on("unhandledRejection", error => console.error("Unhandled promise rejection:", error));
process.on("uncaughtException", error => console.error("Uncaught exception:", error));

console.log("Starting Missouri State Roleplay Operations...");
client.login(TOKEN).catch(error => console.error("Discord login failed:", error));

// FadeHost auto-deploy trigger test.
