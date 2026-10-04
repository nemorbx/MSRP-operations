require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes, Partials } = require("discord.js");

const { setup: setupInfractions, commands: infractionCommands } = require("./infractions");
const { setup: setupPromotions, promoteCommand } = require("./promotions");
const { setup: setupApplications } = require("./applications");
const { setup: setupSupport } = require("./support");
const { setup: setupCounting, commands: countingCommands } = require("./counting");
const { setup: setupAFK, commands: afkCommands } = require("./afk");
const { setup: setupStaffFeedback, feedbackCommand, staffRatingCommand } = require("./staff-feedback");
const { setup: setupRegulations } = require("./regulations");

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

const commands = [
  ...infractionCommands,
  promoteCommand.toJSON(),
  ...countingCommands,
  ...afkCommands,
  feedbackCommand.toJSON(),
  staffRatingCommand.toJSON(),
];

client.once("clientReady", async () => {
  console.log("========================================");
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Missouri State Roleplay Operations is online.");
  console.log("Features loaded: Applications, Support, Infractions, Promotions, Counting, AFK, Staff Feedback, Regulations");
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
