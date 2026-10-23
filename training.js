const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require("discord.js");

const STAFF_TRAINER_ROLE_ID = "1527903039669665853";
const SENIOR_HR_ROLE_ID = "1551704056991318191";
const JUNIOR_MOD_ROLE_ID = "1528449495136731237";
const MODERATION_TEAM_ROLE_ID = "1527381803617222676";
const STAFF_TEAM_ROLE_ID = "1528242210871447672";
const TRAINING_ROLE_ID = "1551985353802518588";
const REQUEST_CHANNEL_ID = "1528996885262766250";
const RESULTS_CHANNEL_ID = "1528997058365886554";
const PROMOTIONS_CHANNEL_ID = "1529167049949970453";
const DATA_PATH = path.join(__dirname, "training-data.json");

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return {
      requests: parsed.requests || {},
      activeRequests: parsed.activeRequests || {},
      results: parsed.results || {},
      claimed: parsed.claimed || {},
    };
  } catch {
    return { requests: {}, activeRequests: {}, results: {}, claimed: {} };
  }
}
function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
const data = loadData();

const trainingCommand = new SlashCommandBuilder()
  .setName("training")
  .setDescription("Training requests and results")
  .addSubcommand(sub => sub.setName("request").setDescription("Request a training session")
    .addStringOption(o => o.setName("timezone").setDescription("Your time zone (e.g. CST, EST, AEDT)").setRequired(true)))
  .addSubcommand(sub => sub.setName("results").setDescription("Submit a trainee's training results")
    .addUserOption(o => o.setName("trainee").setDescription("Trainee being evaluated").setRequired(true))
    .addIntegerOption(o => o.setName("driving").setDescription("Driving score (0–10)").setRequired(true).setMinValue(0).setMaxValue(10))
    .addIntegerOption(o => o.setName("spag").setDescription("SPaG score (0–10)").setRequired(true).setMinValue(0).setMaxValue(10))
    .addIntegerOption(o => o.setName("moderation").setDescription("Moderation score (0–10)").setRequired(true).setMinValue(0).setMaxValue(10))
    .addStringOption(o => o.setName("notes").setDescription("Trainer notes").setRequired(false)));

function isTrainer(member) {
  return member.roles.cache.has(STAFF_TRAINER_ROLE_ID);
}
function isSeniorHR(member) {
  return member.roles.cache.has(SENIOR_HR_ROLE_ID);
}

const ROBLOX_GROUP_ID = "974927500";
const BLOXLINK_API_KEY = process.env.BLOXLINK_API_KEY;

async function getTeamAccess(discordUserId, guildId) {
  if (!BLOXLINK_API_KEY) {
    throw new Error("BLOXLINK_API_KEY is not configured in the bot environment.");
  }

  const response = await fetch(
    "https://api.blox.link/v4/public/guilds/" + encodeURIComponent(guildId) +
      "/discord-to-roblox/" + encodeURIComponent(discordUserId),
    {
      method: "GET",
      headers: { Authorization: BLOXLINK_API_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    }
  );

  if (!response.ok) {
    throw new Error("Bloxlink lookup failed with HTTP " + response.status + ".");
  }

  const result = await response.json();
  const user = result && (result.robloxID || result.robloxId || result.roblox_id ||
    result.primaryAccount || result.primary_account || result.user?.robloxID ||
    result.user?.robloxId || result.user?.roblox_id);
  const robloxId = typeof user === "object" && user !== null
    ? (user.robloxID || user.robloxId || user.id || user.roblox_id)
    : user;

  if (!robloxId || !/^\d+$/.test(String(robloxId))) {
    throw new Error("Bloxlink did not return a linked Roblox account.");
  }

  let groupResponse = await fetch(
    "https://groups.roblox.com/v2/users/" + encodeURIComponent(String(robloxId)) + "/groups/roles",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
  );
  if (!groupResponse.ok) {
    groupResponse = await fetch(
      "https://groups.roblox.com/v1/users/" + encodeURIComponent(String(robloxId)) + "/groups/roles",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
    );
  }

  if (!groupResponse.ok) {
    throw new Error("Roblox group membership lookup failed with HTTP " + groupResponse.status + ".");
  }

  const groupResult = await groupResponse.json();
  if (!Array.isArray(groupResult.data)) {
    throw new Error("Roblox returned an unexpected group membership response.");
  }

  // Roblox's v2 users/{userId}/groups/roles endpoint normally returns
  // { data: [{ group: { id, name }, role: { id, name } }] }. Accept the
  // documented ID plus equivalent path/legacy shapes without treating an
  // incomplete response as a definitive "No".
  const isInWhitelistedGroup = groupResult.data.some(entry => {
    const ids = [
      entry?.group?.id,
      entry?.group?.groupId,
      entry?.group?.group_id,
      entry?.group?.path,
      entry?.groupId,
      entry?.group_id,
      entry?.group?.group?.id,
      entry?.id,
    ].filter(value => value !== undefined && value !== null);
    return ids.some(value => {
      const id = String(value);
      return id === ROBLOX_GROUP_ID || id === "groups/" + ROBLOX_GROUP_ID ||
        id.endsWith("/groups/" + ROBLOX_GROUP_ID);
    });
  });
  return isInWhitelistedGroup ? "Yes" : "No";
}
function requestButtons(traineeId, accepted = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("training_accept_" + traineeId).setLabel(accepted ? "Request Accepted" : "Accept Request").setStyle(ButtonStyle.Success).setDisabled(accepted),
    new ButtonBuilder().setCustomId("training_cancel_" + traineeId).setLabel("Cancel Request").setStyle(ButtonStyle.Secondary).setDisabled(false)
  );
}
function requestPanel(traineeId, traineeName, timezone, teamAccess, availability = "Now", accepted = false, testPreview = false, acceptedBy = null) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      (testPreview ? "**TEST PREVIEW — not a real request**\n\n" : "") +
      (accepted ? "## Training Request Accepted\n\n" : "## Training Request\n\n") +
      (accepted
        ? "> Your training request has been accepted. Please message your trainer in staff chat to continue your training.\\n\\n"
        : "> Please await a trainer to accept your training request. Once accepted, message your trainer in staff chat to continue your training.\\n\\n") +
        await interaction.followUp({ content: "You accepted this training request. The trainee has been notified.", flags: MessageFlags.Ephemeral });
        await interaction.channel.send({
          content: "<@" + traineeId + "> your training request has been accepted. Please message your trainer <@" + interaction.user.id + "> in staff chat to continue your training.",
          allowedMentions: { users: [traineeId, interaction.user.id], parse: [] }
        });
        if (trainee) {
          await trainee.send("Your training request has been accepted by <@" + interaction.user.id + ">. Please message your trainer in staff chat to continue your training.").catch(() => {});
        }
        return;
      }

      if (interaction.customId.startsWith("training_cancel_")) {
        const traineeId = interaction.customId.slice("training_cancel_".length);
        const request = data.activeRequests[traineeId];
        if (!request || !["pending", "accepted"].includes(request.status) || request.guildId !== interaction.guild.id) {
          return interaction.reply({ content: "This request has already been completed or cancelled.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== request.traineeId) {
          return interaction.reply({ content: "Only the person who submitted this training request can cancel it.", flags: MessageFlags.Ephemeral });
        }
        delete data.activeRequests[traineeId];
        saveData();
        if (request.pingMessageId) {
          await interaction.channel.messages.delete(request.pingMessageId).catch(() => {});
        }
        const trainee = await interaction.guild.members.fetch(traineeId).catch(() => null);
        const traineeName = String(trainee?.user?.username || "Unknown user").replace(/[`*_~|>]/g, "");
        const cancelledPanel = new ContainerBuilder()
          .setAccentColor(0x808080)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            "## Training Request\n\n> This request has been cancelled and is no longer active.\n\n" +
            "**Trainee:** " + traineeName + "\n" +
            "**Team Access:** ``" + request.teamAccess + "``\n" +
            "**Time Zone:** ``" + request.timezone + "``\n\n" +
            "~~Request Cancelled~~"
          ))
          .addSeparatorComponents(new SeparatorBuilder({ divider: true, spacing: 2 }))
          .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("training_cancelled_accept_" + traineeId).setLabel("Request Cancelled").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId("training_cancelled_cancel_" + traineeId).setLabel("Cancelled").setStyle(ButtonStyle.Secondary).setDisabled(true)
          ))
          .addSeparatorComponents(new SeparatorBuilder({ divider: true, spacing: 2 }))
          .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL("https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/banner.PNG")
          ));
        await interaction.update({
          components: [cancelledPanel],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });
        return interaction.followUp({ content: "Your training request has been cancelled.", flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId.startsWith("training_claim_")) {
        const resultId = interaction.customId.slice("training_claim_".length);
        const record = data.results[resultId];
        if (!record || record.voided || !record.passed || record.guildId !== interaction.guild.id) {
          return interaction.reply({ content: "This passing result is no longer available to claim.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== record.traineeId) {
          return interaction.reply({ content: "Only the trainee who passed can claim these roles.", flags: MessageFlags.Ephemeral });
        }
        if (record.claimed) return interaction.reply({ content: "You have already claimed your training roles.", flags: MessageFlags.Ephemeral });
        const roles = [JUNIOR_MOD_ROLE_ID, MODERATION_TEAM_ROLE_ID, STAFF_TEAM_ROLE_ID];
        const roleObjects = roles.map(id => interaction.guild.roles.cache.get(id));
        if (roleObjects.some(role => !role)) return interaction.reply({ content: "A required staff role could not be found. Please contact Senior HR.", flags: MessageFlags.Ephemeral });
        const botMember = interaction.guild.members.me;
        if (!botMember || roleObjects.some(role => role.position >= botMember.roles.highest.position) ||
            (interaction.guild.roles.cache.get(TRAINING_ROLE_ID)?.position || 0) >= botMember.roles.highest.position) {
          return interaction.reply({ content: "The bot's role hierarchy must be above the training and staff roles before roles can be claimed.", flags: MessageFlags.Ephemeral });
        }
        const trainee = await interaction.guild.members.fetch(record.traineeId);
        await trainee.roles.add(roles, "Claimed roles after passing staff training");
        await trainee.roles.remove(TRAINING_ROLE_ID, "Claimed staff roles after passing training");
        record.claimed = true;
        record.claimedAt = Date.now();
        data.claimed[trainee.id] = record.resultId;
        saveData();
        await interaction.update({ components: resultPanel(record), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
        await interaction.followUp({ content: "Congratulations! You received Junior Moderator, Moderation Team, and Staff Team roles.", flags: MessageFlags.Ephemeral });
        const promotionsChannel = interaction.guild.channels.cache.get(PROMOTIONS_CHANNEL_ID);
        if (promotionsChannel && promotionsChannel.isTextBased()) {
          const fs = require("fs");
          const path = require("path");
          const headerPath = path.join(__dirname, "passed-training.png");
          const footerPath = path.join(__dirname, "banner.png");
          const components = new ContainerBuilder()
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL("attachment://passed-training.png")
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "> Congratulations, <@" + trainee.id + ">! You have successfully passed staff training with a score of **" + record.total + "/30**. Your **Junior Moderator**, **Moderation Team**, and **Staff Team** roles have been assigned.\n\n" +
                "> **Trainer:** <@" + record.trainerId + ">\\n" +
                "> **Result:** `PASSED`"
              )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL("attachment://banner.png")
              )
            );
          const files = [];
          if (fs.existsSync(headerPath)) files.push({ attachment: headerPath, name: "passed-training.png" });
          if (fs.existsSync(footerPath)) files.push({ attachment: footerPath, name: "banner.png" });
          await promotionsChannel.send({
            components: [components],
            files,
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
          }).catch(error => console.error("[Training] Failed to post passed-training announcement:", error));
        }
        return;
      }

      if (interaction.customId.startsWith("training_void_")) {
        const resultId = interaction.customId.slice("training_void_".length);
        const record = data.results[resultId];
        if (!record || record.voided || record.guildId !== interaction.guild.id) return interaction.reply({ content: "This result has already been voided or could not be found.", flags: MessageFlags.Ephemeral });
        if (interaction.user.id !== record.trainerId && !isSeniorHR(member)) {
          return interaction.reply({ content: "Only the trainer who issued this result or Senior HR can void it.", flags: MessageFlags.Ephemeral });
        }
        record.voided = true;
        record.voidedBy = interaction.user.id;
        record.voidedAt = Date.now();
        saveData();
        if (record.claimed) {
          const trainee = await interaction.guild.members.fetch(record.traineeId).catch(() => null);
          if (trainee) {
            for (const roleId of [JUNIOR_MOD_ROLE_ID, MODERATION_TEAM_ROLE_ID, STAFF_TEAM_ROLE_ID]) {
              if (trainee.roles.cache.has(roleId)) await trainee.roles.remove(roleId, "Training result voided").catch(() => {});
            }
            if (!trainee.roles.cache.has(TRAINING_ROLE_ID)) await trainee.roles.add(TRAINING_ROLE_ID, "Training result voided; training required again").catch(() => {});
          }
          delete data.claimed[record.traineeId];
        }
        delete data.results[resultId];
        saveData();
        await interaction.message.delete().catch(async () => {
          await interaction.update({ content: "This training result was voided by <@" + interaction.user.id + ">.", embeds: [], components: [] }).catch(() => {});
        });
        return interaction.reply({ content: "Training result voided and deleted. " + (record.claimed ? "The roles awarded from this result were removed." : ""), flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } catch (error) {
      console.error("Training system error:", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "The training action could not be completed. Please check the bot console.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

module.exports = { setup, commands: [trainingCommand] };
