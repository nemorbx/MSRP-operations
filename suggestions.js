
const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require("discord.js");

const SUGGESTIONS_CHANNEL_ID = "1555982682796593152";
const SENIOR_HIRING_ROLE_ID = "1551704056991318191";

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "suggestions.json");
const BANNER_PATH = path.join(__dirname, "banner.png");
const BANNER_NAME = "banner.png";

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      nextNumber: 1,
      suggestions: {}
    }, null, 2), "utf8");
  }
}

function loadData() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!data || typeof data !== "object") throw new Error("Invalid suggestions data");
    if (!Number.isInteger(data.nextNumber) || data.nextNumber < 1) data.nextNumber = 1;
    if (!data.suggestions || typeof data.suggestions !== "object") data.suggestions = {};
    return data;
  } catch {
    return { nextNumber: 1, suggestions: {} };
  }
}

function saveData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isSeniorHiring(member) {
  return Boolean(member?.roles?.cache?.has(SENIOR_HIRING_ROLE_ID));
}

function getVoteButtons(record) {
  const locked = record.status !== "pending";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_up_${record.id}`)
      .setLabel(String(record.upVotes.length))
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(`suggest_down_${record.id}`)
      .setLabel(String(record.downVotes.length))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(locked),
    ...(record.status === "pending"
      ? [
          new ButtonBuilder()
            .setCustomId(`suggest_accept_${record.id}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`suggest_deny_${record.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Secondary),
        ]
      : [
          new ButtonBuilder()
            .setCustomId(`suggest_decision_${record.id}`)
            .setLabel(
              `${record.status === "accepted" ? "Accepted" : "Denied"} by ${record.reviewerName}`
            )
            .setStyle(
              record.status === "accepted"
                ? ButtonStyle.Success
                : ButtonStyle.Danger
            )
            .setDisabled(true),
        ])
  );
}

function buildSuggestionContainer(client, record) {
  const container = new ContainerBuilder();

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Suggestion #${record.number}\n**User**\n<@${record.userId}>`
      )
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(record.avatarUrl)
        .setDescription(`${record.username}'s avatar`)
    );

  container.addSectionComponents(section);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Suggestion**\n${record.text}`
    )
  );

  if (record.status !== "pending") {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${record.status === "accepted" ? "Accepted" : "Denied"} by <@${record.reviewerId}>`
      )
    );
  }

  container.addActionRowComponents(getVoteButtons(record));

  if (fs.existsSync(BANNER_PATH)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${BANNER_NAME}`)
      )
    );
  }

  return container;
}

async function refreshSuggestionMessage(client, record) {
  const channel = await client.channels.fetch(SUGGESTIONS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const message = await channel.messages.fetch(record.messageId).catch(() => null);
  if (!message) return false;

  const mentionUsers = [...new Set([
    record.userId,
    ...(record.reviewerId ? [record.reviewerId] : []),
  ])];

  const payload = {
    flags: MessageFlags.IsComponentsV2,
    components: [buildSuggestionContainer(client, record)],
    allowedMentions: {
      users: mentionUsers,
      parse: [],
    },
  };

  if (fs.existsSync(BANNER_PATH)) {
    payload.files = [
      new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME })
    ];
  }

  await message.edit(payload);
  return true;
}

const commands = [
  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for Missouri State Roleplay.")
    .toJSON(),
];

function setupSuggestions(client) {
  client.suggestionsData = loadData();

  client.on("interactionCreate", async interaction => {
    try {
      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "suggest"
      ) {
        if (!interaction.guild) {
          await interaction.reply({
            content: "This command can only be used in the server.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`suggest_modal_${interaction.id}`)
          .setTitle("Submit Suggestion");

        const input = new TextInputBuilder()
          .setCustomId("suggestion")
          .setLabel("Suggestion")
          .setPlaceholder("Tell us what you would like to see changed or added.")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        await interaction.showModal(modal);
        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("suggest_modal_")
      ) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const text = interaction.fields.getTextInputValue("suggestion").trim();
        if (!text) {
          await interaction.editReply({ content: "Your suggestion cannot be empty." });
          return;
        }

        const data = client.suggestionsData;
        const number = data.nextNumber++;
        const id = `${interaction.id}_${number}`;

        const record = {
          id,
          number,
          guildId: interaction.guildId,
          channelId: SUGGESTIONS_CHANNEL_ID,
          userId: interaction.user.id,
          username: interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL({
            extension: "png",
            size: 256,
          }),
          text,
          upVotes: [],
          downVotes: [],
          status: "pending",
          reviewerId: null,
          reviewerName: null,
          createdAt: Date.now(),
          messageId: null,
          threadId: null,
        };

        const channel = await interaction.guild.channels.fetch(SUGGESTIONS_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          await interaction.editReply({ content: "I couldn't find the configured suggestions channel." });
          return;
        }

        const payload = {
          flags: MessageFlags.IsComponentsV2,
          components: [buildSuggestionContainer(client, record)],
          allowedMentions: {
            users: [interaction.user.id],
            parse: [],
          },
        };

        if (fs.existsSync(BANNER_PATH)) {
          payload.files = [
            new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME })
          ];
        }

        const message = await channel.send(payload);
        record.messageId = message.id;

        const thread = await message.startThread({
          name: `Discussion ${interaction.user.username}'s Suggestion`,
          autoArchiveDuration: 10080,
          reason: `Discussion thread for Suggestion #${number}`,
        });

        record.threadId = thread.id;

        data.suggestions[id] = record;
        saveData(data);

        await thread.send({
          content: `Discussion for <@${interaction.user.id}>'s Suggestion #${number}.`,
          allowedMentions: { users: [interaction.user.id] },
        }).catch(() => {});

        await interaction.editReply({
          content: `Your suggestion has been submitted as **Suggestion #${number}**.`,
        });
        return;
      }

      if (!interaction.isButton()) return;

      const match = interaction.customId.match(/^suggest_(up|down|accept|deny)_(.+)$/);
      if (!match) return;

      const action = match[1];
      const suggestionId = match[2];
      const data = client.suggestionsData;
      const record = data.suggestions[suggestionId];

      if (!record) {
        await interaction.reply({
          content: "That suggestion could not be found.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === "accept" || action === "deny") {
        if (!isSeniorHiring(interaction.member)) {
          await interaction.reply({
            content: "Only Senior Hiring can approve or deny suggestions.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (record.status !== "pending") {
          await interaction.reply({
            content: `This suggestion has already been ${record.status}.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        record.status = action === "accept" ? "accepted" : "denied";
        record.reviewerId = interaction.user.id;
        record.reviewerName = interaction.user.username;
        saveData(data);

        await interaction.deferUpdate();
        await refreshSuggestionMessage(client, record);

        return;
      }

      if (record.status !== "pending") {
        await interaction.reply({
          content: "Voting is closed because this suggestion has already been reviewed.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const userId = interaction.user.id;
      record.upVotes = record.upVotes.filter(id => id !== userId);
      record.downVotes = record.downVotes.filter(id => id !== userId);

      if (action === "up") {
        record.upVotes.push(userId);
      } else {
        record.downVotes.push(userId);
      }

      saveData(data);

      await interaction.deferUpdate();
      await refreshSuggestionMessage(client, record);
    } catch (error) {
      console.error("Suggestions interaction error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Something went wrong while handling that suggestion.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  });
}

module.exports = { setup: setupSuggestions, commands };
