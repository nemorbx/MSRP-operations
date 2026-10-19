const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const ARRIVALS_CHANNEL_ID = "1527178537600286914";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "welcome.json");
const VERIFY_URL = "https://blox.link/dashboard/user/verifications/verify";
const WELCOME_EMOJI = "<:image_20260331_002936379:1488319316247183434>";

const PREFIX = "!nickname";

const NICKNAME_WORDS = [
  "Green", "Soft", "Crispy", "Sleepy", "Frozen", "Purple", "Tiny", "Lucky", "Cosmic", "Pixel",
  "Turbo", "Golden", "Misty", "Sneaky", "Waffle", "Spicy", "Cloudy", "Fuzzy", "Chill", "Bouncy",
  "Neon", "Silent", "Swift", "Dusty", "Blue", "Sunny", "Shadow", "Happy", "Fluffy", "Salty",
  "Cheesy", "Rocket", "Velvet", "Midnight", "Silver", "Electric", "Wild", "Quiet", "Rapid",
  "Little", "Big", "Cool", "Warm", "Frosty", "Stormy", "Mellow", "Lucky", "Magic", "Ninja",
  "Pixel", "Retro", "Cyber", "Glitch", "Nova", "Orbit", "Solar", "Lunar", "Atomic", "Hyper",
  "Mega", "Mini", "Rapid", "Thunder", "River", "Forest", "Ocean", "Desert", "Cocoa", "Cherry",
  "Mint", "Peach", "Lime", "Berry", "Bubble", "Marble", "Paper", "Rubber", "Copper", "Platinum",
  "Shadow", "Ghost", "Phantom", "Mystic", "Royal", "Lucky", "Fancy", "Simple", "Random", "Secret",
  "Hidden", "Brave", "Swift", "Slick", "Fresh", "Smooth", "Funny", "Goofy", "Sneaky"
];

function generateNickname() {
  const first = NICKNAME_WORDS[Math.floor(Math.random() * NICKNAME_WORDS.length)];
  let second = NICKNAME_WORDS[Math.floor(Math.random() * NICKNAME_WORDS.length)];

  // Avoid identical words so names stay varied.
  while (second === first) {
    second = NICKNAME_WORDS[Math.floor(Math.random() * NICKNAME_WORDS.length)];
  }

  return first + second;
}

const WELCOME_MESSAGES = [
  "Welcome to **Missouri State Roleplay**, <@{member}>! You’re our **{count}th** member. We’re glad you’re here!",
  "Hey <@{member}>, welcome to **Missouri State Roleplay**! You’re member **#{count}**. Have a great time with us!",
  "A new member has arrived! Welcome, <@{member}>, to **Missouri State Roleplay** — member **#{count}**!",
  "Welcome aboard, <@{member}>! Thanks for joining **Missouri State Roleplay** as our **{count}th** member!",
  "Everyone give a warm welcome to <@{member}>! You’re now part of **Missouri State Roleplay**, member **#{count}**!"
];

function buildWelcomeMessage(member) {
  const memberCount = member.guild.memberCount.toLocaleString("en-US");
  const selected = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
    .replaceAll("{member}", member.id)
    .replaceAll("{count}", memberCount);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        WELCOME_EMOJI + " `` - `` " + selected + "\n-# Please verify to access all channels and stop in-game private messages."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Verify").setStyle(ButtonStyle.Link).setURL(VERIFY_URL).setEmoji("👋"),
        new ButtonBuilder().setLabel(memberCount).setStyle(ButtonStyle.Secondary).setEmoji("👥").setDisabled(true)
      )
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [member.id] } };
}
function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ autoNicknameEnabled: false }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { autoNicknameEnabled: data.autoNicknameEnabled === true };
  } catch {
    return { autoNicknameEnabled: false };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ autoNicknameEnabled: data.autoNicknameEnabled === true }, null, 2), "utf8");
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


const autoNicknameCommand = new SlashCommandBuilder()
  .setName("autonickname")
  .setDescription("Enable or disable automatic random nicknames for new members.")
  .addStringOption(option =>
    option
      .setName("action")
      .setDescription("Choose whether automatic random nicknames are enabled or disabled.")
      .setRequired(true)
      .addChoices(
        { name: "Enable", value: "enable" },
        { name: "Disable", value: "disable" }
      )
  );

function setupWelcome(client) {
  client.welcomeData = loadData();

  client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === "autonickname") {
      if (!interaction.member?.roles?.cache?.has("1551704056991318191")) {
        await interaction.reply({
          content: "You don't have permission to use this command.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const action = interaction.options.getString("action", true);
      const enabled = action === "enable";
      client.welcomeData.autoNicknameEnabled = enabled;
      saveData(client.welcomeData);

      await interaction.reply({
        content: "<:msrpwhite:1552141993768132668> Automatic random nicknames are now **" +
          (enabled ? "enabled" : "disabled") + "**.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const parts = content.split(/\s+/);
    if (parts[0].toLowerCase() !== "!autonickname") return;

    if (!message.member.roles.cache.has("1551704056991318191")) {
      await message.delete().catch(() => {});
      return;
    }

    await message.delete().catch(() => {});

    const action = parts[1]?.toLowerCase();
    const temporaryReply = async text => {
      const sent = await message.channel.send(text).catch(() => null);
      if (sent) setTimeout(() => sent.delete().catch(() => {}), 3000);
    };

    if (action !== "enable" && action !== "disable") {
      await temporaryReply("Usage: !autonickname enable or !autonickname disable");
      return;
    }

    const enabled = action === "enable";
    client.welcomeData.autoNicknameEnabled = enabled;
    saveData(client.welcomeData);

    await temporaryReply(
      `<:msrpwhite:1552141993768132668> Automatic random nicknames are now **${enabled ? "enabled" : "disabled"}**.`
    );
  });

  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content.toLowerCase().startsWith(PREFIX)) return;

    const parts = content.split(/\s+/);
    if (parts[0].toLowerCase() !== PREFIX) return;

    if (!message.member.roles.cache.has("1551704056991318191")) {
      await message.delete().catch(() => {});
      return;
    }

    // Delete the command immediately and remove the bot's response after 3 seconds.
    await message.delete().catch(() => {});
    const temporaryReply = async text => {
      const sent = await message.channel.send(text).catch(() => null);
      if (sent) setTimeout(() => sent.delete().catch(() => {}), 3000);
    };

    const target = message.mentions.members.first();
    if (!target) {
      await temporaryReply("Please mention a member to give them a random server nickname.");
      return;
    }

    if (!target.manageable) {
      await temporaryReply("I can't change that member's nickname because of my role hierarchy.");
      return;
    }

    const nickname = generateNickname();

    try {
      await target.setNickname(nickname, "Random MSRP nickname assigned by " + message.author.tag);
      await temporaryReply("<:msrpwhite:1552141993768132668> Assigned `" + nickname + "` to <@" + target.id + ">.");
    } catch (error) {
      console.error("Random nickname error:", error);
      await temporaryReply("I couldn't change that member's nickname. Please check my permissions.");
    }
  });

  client.on("guildMemberAdd", async member => {
    try {
      if (client.welcomeData?.autoNicknameEnabled && member.manageable) {
        const nickname = generateNickname();
        await member.setNickname(
          nickname,
          "Automatic random nickname on server join"
        ).catch(error => {
          console.error("Automatic random nickname error:", error);
        });
      }

      const channelId = ARRIVALS_CHANNEL_ID;
      const channel = await member.guild.channels.fetch(channelId).catch(error => {
        console.error("[Welcome] Could not fetch welcome channel " + channelId + ":", error);
        return null;
      });

      if (!channel) {
        console.error("[Welcome] Welcome channel " + channelId + " was not found or is inaccessible.");
        return;
      }
      if (!channel.isTextBased() || !channel.send) {
        console.error("[Welcome] Configured welcome channel " + channelId + " is not a sendable text channel.");
        return;
      }

      const botMember = member.guild.members.me;
      const permissions = botMember ? channel.permissionsFor(botMember) : null;
      if (!permissions?.has(["ViewChannel", "SendMessages"])) {
        console.error("[Welcome] Missing View Channel or Send Messages permission in #" + channel.name + " (" + channel.id + ").");
        return;
      }

      await channel.send(buildWelcomeMessage(member));
      console.log("[Welcome] Sent welcome message for " + member.user.tag + " in #" + channel.name + ".");
    } catch (error) {
      console.error("Welcome message error:", error);
    }
  });
}

module.exports = {
  setup: setupWelcome,
  commands: [autoNicknameCommand.toJSON()],
};
