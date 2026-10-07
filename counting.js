const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "counting.json");

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const MAX_COUNT = 5000;
const DEFAULT_COUNTING_CHANNEL_ID = "1527298583613669458";
const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        channelId: DEFAULT_COUNTING_CHANNEL_ID,
        current: 5,
        highest: 0,
        lastUserId: null,
        processedMessages: {},
      }, null, 2),
      "utf8"
    );
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      channelId: data.channelId ?? DEFAULT_COUNTING_CHANNEL_ID,
      current: Number.isInteger(data.current) && data.current >= 1 ? data.current : 5,
      highest: Number.isInteger(data.highest) && data.highest >= 0 ? data.highest : 0,
      lastUserId: data.lastUserId ?? null,
      processedMessages: data.processedMessages && typeof data.processedMessages === "object"
        ? data.processedMessages
        : {},
    };
  } catch {
    return {
      channelId: DEFAULT_COUNTING_CHANNEL_ID,
      current: 5,
      highest: 0,
      lastUserId: null,
      processedMessages: {},
    };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isSeniorHR(member) {
  return Boolean(member?.roles?.cache?.has(SENIOR_HR_ROLE_ID));
}

function tokenize(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/\d/.test(char)) {
      let number = "";
      while (i < expression.length && /\d/.test(expression[i])) {
        number += expression[i++];
      }
      tokens.push({ type: "number", value: Number(number) });
      continue;
    }

    if ("+-*/()".includes(char)) {
      tokens.push({ type: char, value: char });
      i++;
      continue;
    }

    throw new Error("Invalid character");
  }

  return tokens;
}

function evaluateExpression(expression) {
  if (typeof expression !== "string" || expression.length > 100) return null;
  const tokens = tokenize(expression);
  if (!tokens.length) return null;

  let index = 0;

  function parseExpression() {
    let value = parseTerm();
    while (tokens[index]?.type === "+" || tokens[index]?.type === "-") {
      const operator = tokens[index++].type;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (tokens[index]?.type === "*" || tokens[index]?.type === "/") {
      const operator = tokens[index++].type;
      const right = parseFactor();
      if (operator === "/") {
        if (right === 0) throw new Error("Division by zero");
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  }

  function parseFactor() {
    const token = tokens[index];
    if (!token) throw new Error("Unexpected end");

    if (token.type === "+" || token.type === "-") {
      // Unary signs are intentionally not supported. Counting accepts
      // arithmetic operators between numbers, but no negative values.
      throw new Error("Unary operator not allowed");
    }

    if (token.type === "number") {
      index++;
      return token.value;
    }

    if (token.type === "(") {
      index++;
      const value = parseExpression();
      if (tokens[index]?.type !== ")") throw new Error("Missing parenthesis");
      index++;
      return value;
    }

    throw new Error("Invalid expression");
  }

  const result = parseExpression();
  if (index !== tokens.length) throw new Error("Unexpected token");
  if (!Number.isFinite(result) || !Number.isSafeInteger(result)) return null;
  return result;
}

function rememberProcessed(data, messageId, record) {
  data.processedMessages[messageId] = record;

  // Keep the persistent file bounded while retaining plenty of history for edits.
  const ids = Object.keys(data.processedMessages);
  if (ids.length > 10000) {
    for (const id of ids.slice(0, ids.length - 10000)) {
      delete data.processedMessages[id];
    }
  }
}


const commands = [
  new SlashCommandBuilder()
    .setName("count")
    .setDescription("Manage the server counting system.")
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Set the counting channel.")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel where counting will take place.")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove the configured counting channel.")
    )
    .addSubcommand(sub =>
      sub
        .setName("leaderboard")
        .setDescription("Show the server's highest-ever count.")
    )
    .addSubcommand(sub =>
      sub
        .setName("reset")
        .setDescription("Reset the current count to 1 without erasing the record.")
    )
    .toJSON(),
];

function setupCounting(client) {
  client.countingData = loadData();
  console.log(
    client.countingData.channelId
      ? `Counting system ready in channel ${client.countingData.channelId}; next number: ${client.countingData.current}`
      : "Counting system loaded, but no counting channel is configured. Use /count set."
  );
  let messageQueue = Promise.resolve();

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "count") return;

    const subcommand = interaction.options.getSubcommand();
    const member = interaction.member;
    const senior = isSeniorHR(member);

    if (["set", "remove", "reset"].includes(subcommand) && !senior) {
      await interaction.reply({
        content: "You don't have permission to manage the counting system. Senior High Rank+ only.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "set") {
      const channel = interaction.options.getChannel("channel", true);
      client.countingData.channelId = channel.id;
      client.countingData.current = 1;
      client.countingData.lastUserId = null;
      saveData(client.countingData);
      await interaction.reply({
        content: `Counting channel set to <#${channel.id}>. The current count is **1**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "remove") {
      client.countingData.channelId = null;
      client.countingData.current = 1;
      client.countingData.lastUserId = null;
      saveData(client.countingData);
      await interaction.reply({
        content: "The counting channel has been removed.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "reset") {
      client.countingData.current = 1;
      client.countingData.lastUserId = null;
      saveData(client.countingData);
      await interaction.reply({
        content: "The current counting sequence has been reset to **1**. The server record was not erased.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: `🏆 **Server Highest Number:** ${client.countingData.highest}`,
      flags: MessageFlags.Ephemeral,
    });
  });

  client.on("messageCreate", message => {
    messageQueue = messageQueue
      .then(async () => {
        if (message.author.bot || !message.guild) return;
        if (!client.countingData.channelId || message.channel.id !== client.countingData.channelId) return;

        // 5,000 is the maximum. A Senior High Rank+ member must reset before
        // another sequence can begin.
        if (client.countingData.current > MAX_COUNT) return;

        if (client.countingData.lastUserId === message.author.id) {
          // The attempted counting message is invalid, so remove it first.
          await message.delete().catch(() => {});

          // Post a normal public warning that mentions the member, then remove
          // the warning after five seconds.
          const warning = await message.channel.send({
            content: `⚠️ <@${message.author.id}> You cannot count twice in a row. Another user must successfully count the next number before you can count again.`,
            allowedMentions: { users: [message.author.id] },
          }).catch(() => null);

          if (warning) {
            setTimeout(() => {
              warning.delete().catch(() => {});
            }, 5000);
          }

          return;
        }

        const data = client.countingData;
        const expected = data.current;

        if (
          !message.author.createdTimestamp ||
          Date.now() - message.author.createdTimestamp < MIN_ACCOUNT_AGE_MS
        ) {
          await message.delete().catch(() => {});
          const warning = await message.channel.send({
            content: "<:msrpwhite:1552141993768132668> Your Discord account must be at least 7 days old to participate in counting.",
            allowedMentions: { parse: [] },
          }).catch(() => null);
          if (warning) {
            setTimeout(() => warning.delete().catch(() => {}), 5000);
          }
          return;
        }
        let result = null;

        try {
          result = evaluateExpression(message.content.trim());
        } catch {
          result = null;
        }

        if (result !== expected || result < 1 || result > MAX_COUNT) {
          await message.react("❌").catch(() => {});
          data.current = 1;
          data.lastUserId = null;
          saveData(data);
          await message.channel.send(
            `❌ **Wrong Number**\nThe correct next number was **${expected}**.\nThe counting sequence has been **reset to 1**.`
          ).catch(() => {});
          return;
        }

        const recordBreak = result > data.highest;
        if (recordBreak) data.highest = result;

        data.current = result < MAX_COUNT ? result + 1 : MAX_COUNT + 1;
        data.lastUserId = message.author.id;

        rememberProcessed(data, message.id, {
          userId: message.author.id,
          countedNumber: result,
          edited: false,
        });
        saveData(data);

        await message.react("✅").catch(() => {});
        if (recordBreak) await message.react("🏆").catch(() => {});

        if (result === MAX_COUNT) {
          await message.channel.send(
            "🏁 **5,000 reached!** A Senior High Rank+ member must use `/count reset` to start a new sequence."
          ).catch(() => {});
        }
      })
      .catch(error => {
        console.error("Counting message handling error:", error);
      });
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;
      if (!client.countingData.channelId || newMessage.channel?.id !== client.countingData.channelId) return;

      const record = client.countingData.processedMessages[newMessage.id];
      if (!record || record.edited) return;
      if (oldMessage.content === newMessage.content) return;

      record.edited = true;
      saveData(client.countingData);

      const nextNumber = client.countingData.current;
      if (nextNumber <= MAX_COUNT) {
        await newMessage.channel.send(
          `⚠️ **Counting Message Edited**\nThe number was edited.\n**The next number is ${nextNumber}.**`
        ).catch(() => {});
      } else {
        await newMessage.channel.send(
          "⚠️ **Counting Message Edited**\nThe number was edited.\n**The maximum number of 5,000 has been reached. A Senior High Rank+ member must use `/count reset`.**"
        ).catch(() => {});
      }
    } catch (error) {
      console.error("Counting edit handling error:", error);
    }
  });
}

module.exports = { setup: setupCounting, commands };
