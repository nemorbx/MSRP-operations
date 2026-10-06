const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "welcome.json");
const ARRIVALS_CHANNEL_ID = "1527178537600286914";

const PREFIX = "!nickname";

const NICKNAME_FIRST_WORDS = [
  "Green", "Soft", "Crispy", "Sleepy", "Frozen", "Purple", "Tiny", "Lucky",
  "Cosmic", "Pixel", "Turbo", "Golden", "Misty", "Sneaky", "Waffle", "Spicy",
  "Cloudy", "Fuzzy", "Chill", "Bouncy", "Neon", "Silent", "Swift", "Dusty",
  "Blue", "Sunny", "Shadow", "Happy", "Fluffy", "Salty", "Cheesy", "Rocket"
];

const NICKNAME_SECOND_WORDS = [
  "Goblin", "Muffin", "Tomato", "Juice", "Pickle", "Noodle", "Waffle", "Penguin",
  "Potato", "Toast", "Biscuit", "Pancake", "Taco", "Cookie", "Dino", "Otter",
  "Mango", "Donut", "Peanut", "Cactus", "Lemon", "Pigeon", "Dragon", "Fox",
  "Bean", "Bunny", "Koala", "Panda", "Wizard", "Rocket", "Comet", "Spoon"
];

function generateNickname() {
  const first = NICKNAME_FIRST_WORDS[Math.floor(Math.random() * NICKNAME_FIRST_WORDS.length)];
  const second = NICKNAME_SECOND_WORDS[Math.floor(Math.random() * NICKNAME_SECOND_WORDS.length)];
  return first + second;
}

const WELCOME_MESSAGES = [
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Welcome to Missouri State Roleplay!",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Your ER:LC journey starts here.",
  "<:msrpwhite:1552141993768132668> Welcome to MSRP, {member}!",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Get ready to roleplay.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! We're glad to have you in MSRP.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Your next scene starts here.",
  "<:msrpwhite:1552141993768132668> Welcome to Missouri State Roleplay, {member}!",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Enjoy your time in MSRP.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Time to hit the roads of Missouri.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! We hope you enjoy our ER:LC community.",
  "<:msrpwhite:1552141993768132668> Welcome to the community, {member}!",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Your roleplay adventure begins now.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! We're happy to have you here.",
  "<:msrpwhite:1552141993768132668> Welcome to MSRP, {member}! Have fun roleplaying.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Get familiar with the community and enjoy ER:LC.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! We look forward to seeing you in-game.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Thanks for joining Missouri State Roleplay.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Your Missouri roleplay experience starts here.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Glad to have another member of MSRP with us.",
  "<:msrpwhite:1552141993768132668> Welcome, {member}! Enjoy Missouri with us!",
];

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channelId: null }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { channelId: data.channelId ?? ARRIVALS_CHANNEL_ID };
  } catch {
    return { channelId: null };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function isBotOwner(interaction) {
  try {
    const application = await interaction.client.application.fetch();
    const owner = application.owner;

    if (!owner) return false;

    if (owner.members) {
      return owner.members.has(interaction.user.id);
    }

    return owner.id === interaction.user.id;
  } catch (error) {
    console.error("Unable to verify bot owner:", error);
    return false;
  }
}

const command = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Configure the server welcome channel.")
  .addChannelOption(option =>
    option
      .setName("channel")
      .setDescription("The channel where new members will be welcomed.")
      .setRequired(true)
  );

function setupWelcome(client) {
  client.welcomeData = loadData();
  // MSRP arrivals channel: always use the designated channel unless explicitly changed by the owner.

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "welcome") {
      return;
    }

    if (!(await isBotOwner(interaction))) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);

    if (!channel.isTextBased() || !channel.send) {
      await interaction.reply({
        content: "Please choose a text channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    client.welcomeData.channelId = channel.id;
    saveData(client.welcomeData);

    await interaction.reply({
      content: `Welcome messages will now be sent in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content.toLowerCase().startsWith(PREFIX)) return;

    const parts = content.split(/\s+/);
    if (parts[0].toLowerCase() !== PREFIX) return;

    const target = message.mentions.members.first();
    if (!target) {
      await message.reply("Please mention a member to give them a random server nickname.").catch(() => {});
      return;
    }

    if (!target.manageable) {
      await message.reply("I can't change that member's nickname because of my role hierarchy.").catch(() => {});
      return;
    }

    const nickname = generateNickname();

    try {
      await target.setNickname(nickname, `Random MSRP nickname assigned by ${message.author.tag}`);
      await message.reply(`<:msrpwhite:1552141993768132668> Assigned \`${nickname}\` to <@${target.id}>.`).catch(() => {});
    } catch (error) {
      console.error("Random nickname error:", error);
      await message.reply("I couldn't change that member's nickname. Please check my permissions.").catch(() => {});
    }
  });

  client.on("guildMemberAdd", async member => {
    try {
      const channelId = ARRIVALS_CHANNEL_ID;

      const channel = await member.guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !channel.send) return;

      const template =
        WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];

      const content = template.replaceAll("{member}", `<@${member.id}>`);

      await channel.send({
        content,
        allowedMentions: {
          users: [member.id],
        },
      });
    } catch (error) {
      console.error("Welcome message error:", error);
    }
  });
}

function setWelcomeChannel(client, channelId) {
  client.welcomeData = client.welcomeData || loadData();
  client.welcomeData.channelId = channelId;
  saveData(client.welcomeData);
}

module.exports = {
  setup: setupWelcome,
  command,
  commands: [command.toJSON()],
  setWelcomeChannel,
};
