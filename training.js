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
    .addStringOption(o => o.setName("timezone").setDescription("Your time zone (e.g. CST, EST, AEDT)").setRequired(true))
    .addStringOption(o => o.setName("team_access").setDescription("Can you access the Sheriff's whitelisted team?").setRequired(true)
      .addChoices({ name: "Yes", value: "Yes" }, { name: "No", value: "No" }))
    .addStringOption(o => o.setName("availability").setDescription("Optional: days/times you are available").setRequired(false)))
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
function requestButtons(traineeId, accepted = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("training_accept_" + traineeId).setLabel(accepted ? "Request Accepted" : "Accept Request").setStyle(ButtonStyle.Success).setDisabled(accepted),
    new ButtonBuilder().setCustomId("training_cancel_" + traineeId).setLabel("Cancel Request").setStyle(ButtonStyle.Secondary).setDisabled(accepted)
  );
}
function requestPanel(traineeId, traineeName, timezone, teamAccess, availability, accepted = false, testPreview = false) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      (testPreview ? "**TEST PREVIEW — not a real request**\n\n" : "") +
      "## Training Request\n\n" +
      "> <@" + traineeId + ">, please await a trainer to accept your training. Once accepted make your way to the briefing room located inside of the Sheriff's station.\n\n" +
      "**Trainee:** <@" + traineeId + ">\n" +
      "**Team Access:** ``" + teamAccess + "``\n" +
      "**Time Zone:** ``" + timezone + "``"
    ))
    .addSeparatorComponents(new SeparatorBuilder({ divider: true, spacing: 2 }))
    .addActionRowComponents(requestButtons(traineeId, accepted))
    .addSeparatorComponents(new SeparatorBuilder({ divider: true, spacing: 2 }))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/banner.PNG")
      )
    );
  return [container];
}
function resultButtons(traineeId, resultId, passed, claimed = false) {
  const row = new ActionRowBuilder();
  if (passed) {
    row.addComponents(new ButtonBuilder().setCustomId("training_claim_" + resultId).setLabel(claimed ? "Roles Claimed" : "Claim Roles").setStyle(ButtonStyle.Success).setDisabled(claimed));
  }
  row.addComponents(new ButtonBuilder().setCustomId("training_void_" + resultId).setLabel("Void Result").setStyle(ButtonStyle.Danger));
  return [row];
}

function setup(client) {
  client.on("messageCreate", async message => {
    try {
      if (!message.guild || message.author.bot) return;
      const command = message.content.trim().toLowerCase();
      if (command !== "!test training request" && command !== "!clear training requests") return;

      const member = await message.guild.members.fetch(message.author.id);
      if (!isSeniorHR(member)) {
        await message.reply("Only Senior HR can use training test and cleanup commands.");
        return;
      }

      const channel = message.guild.channels.cache.get(REQUEST_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        await message.reply("The training request channel is not configured correctly.");
        return;
      }

      if (command === "!test training request") {
        const testId = message.author.id;
        const sent = await channel.send({
          components: requestPanel(testId, message.author.username, "CDT", "Yes", "Test preview", false, true),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });
        await message.reply("Test training request posted in <#" + channel.id + ">. It is a preview only and does not create a real request.");
        return;
      }

      let deleted = 0;
      let before;
      while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        before = batch.last().id;
        const botMessages = batch.filter(m => m.author.id === client.user.id);
        for (const botMessage of botMessages.values()) {
          if (botMessage.content.includes("TRAINING REQUEST TEST") ||
              botMessage.components?.length ||
              botMessage.embeds?.some(e => e.title === "Training Request")) {
            await botMessage.delete().catch(() => {});
            deleted++;
          }
        }
        if (batch.size < 100) break;
      }
      for (const [traineeId, request] of Object.entries(data.activeRequests)) {
        if (request.guildId === message.guild.id && request.channelId === channel.id) {
          delete data.activeRequests[traineeId];
        }
      }
      saveData();
      await message.reply("Cleared " + deleted + " training request/test message(s) posted by MSRP Operations and removed pending training requests from the active queue.");
    } catch (error) {
      console.error("Training prefix command error:", error);
      await message.reply("That training command failed. Check the bot console for details.").catch(() => {});
    }
  });

  client.on("interactionCreate", async interaction => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "training" && interaction.guild) {
        const sub = interaction.options.getSubcommand();
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const now = Date.now();

        if (sub === "request") {
          if (!member.roles.cache.has(TRAINING_ROLE_ID)) {
            return interaction.reply({ content: "Only members with the Awaiting Training role can request training.", flags: MessageFlags.Ephemeral });
          }
          if (data.activeRequests[member.id]) {
            return interaction.reply({ content: "You already have a pending or accepted training request. Cancel the pending request or complete your session first.", flags: MessageFlags.Ephemeral });
          }
          const timezone = interaction.options.getString("timezone", true).trim();
          const teamAccess = interaction.options.getString("team_access", true);
          const availability = interaction.options.getString("availability")?.trim() || "Not provided";
          if (timezone.length < 2 || timezone.length > 60 || availability.length > 300) {
            return interaction.reply({ content: "Please enter a valid time zone and keep availability notes under 300 characters.", flags: MessageFlags.Ephemeral });
          }
          const channel = interaction.guild.channels.cache.get(REQUEST_CHANNEL_ID);
          if (!channel || !channel.isTextBased()) {
            return interaction.reply({ content: "The training request channel is not configured correctly. Please contact an administrator.", flags: MessageFlags.Ephemeral });
          }
          const request = { traineeId: member.id, guildId: interaction.guild.id, timezone, teamAccess, availability, createdAt: now, status: "pending", messageId: null, channelId: channel.id };
          data.activeRequests[member.id] = request;
          saveData();
          const sent = await channel.send({
            components: requestPanel(member.id, member.user.username, timezone, teamAccess, availability),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [STAFF_TRAINER_ROLE_ID], users: [member.id] }
          });
          request.messageId = sent.id;
          saveData();
          return interaction.reply({ content: "Your training request has been submitted. Staff Trainers have been notified.", flags: MessageFlags.Ephemeral });
        }

        if (sub === "results") {
          if (!isTrainer(member)) return interaction.reply({ content: "Only Staff Trainers can submit training results.", flags: MessageFlags.Ephemeral });
          const traineeUser = interaction.options.getUser("trainee", true);
          const trainee = await interaction.guild.members.fetch(traineeUser.id).catch(() => null);
          if (!trainee || trainee.user.bot || !trainee.roles.cache.has(TRAINING_ROLE_ID)) {
            return interaction.reply({ content: "That member must be a non-bot member with the Awaiting Training role.", flags: MessageFlags.Ephemeral });
          }
          const request = data.activeRequests[trainee.id];
          if (!request || request.status !== "accepted") {
            return interaction.reply({ content: "That trainee must have a training request accepted by a Staff Trainer before results can be submitted.", flags: MessageFlags.Ephemeral });
          }
          const driving = interaction.options.getInteger("driving", true);
          const spag = interaction.options.getInteger("spag", true);
          const moderation = interaction.options.getInteger("moderation", true);
          const total = driving + spag + moderation;
          const passed = total >= 20;
          const notes = interaction.options.getString("notes")?.trim() || "No additional notes.";
          const resultsChannel = interaction.guild.channels.cache.get(RESULTS_CHANNEL_ID);
          if (!resultsChannel || !resultsChannel.isTextBased()) return interaction.reply({ content: "The training results channel is not configured correctly.", flags: MessageFlags.Ephemeral });

          const resultId = interaction.id;
          const record = {
            resultId, guildId: interaction.guild.id, traineeId: trainee.id, trainerId: interaction.user.id,
            driving, spag, moderation, total, passed, notes, messageId: null, channelId: resultsChannel.id,
            claimed: false, voided: false, createdAt: now
          };
          data.results[resultId] = record;
          delete data.activeRequests[trainee.id];
          saveData();

          const embed = new EmbedBuilder().setColor(passed ? 0x2ecc71 : 0xe74c3c).setTitle("Training Results")
            .setDescription("<@" + interaction.user.id + "> has sent the results for <@" + trainee.id + ">'s training. They scored a total of **" + total + "/30**, which means the trainee has **" + (passed ? "passed" : "failed") + "**.")
            .addFields(
              { name: "Trainee", value: "<@" + trainee.id + ">", inline: true },
              { name: "Trainer", value: "<@" + interaction.user.id + ">", inline: true },
              { name: "Driving Ability", value: String(driving), inline: true },
              { name: "SPaG Ability", value: String(spag), inline: true },
              { name: "Moderation Ability", value: String(moderation), inline: true },
              { name: "Total Score", value: total + "/30", inline: true },
              { name: "Training Notes", value: notes.slice(0, 1000), inline: false }
            ).setTimestamp();
          const message = await resultsChannel.send({
            embeds: [embed],
            components: resultButtons(trainee.id, resultId, passed),
            allowedMentions: { parse: [] }
          });
          record.messageId = message.id;
          saveData();

          if (passed) {
            try {
              await trainee.send({
                content: "You passed staff training with " + total + "/30. Use the Claim Roles button on your result in the training results channel to receive your staff roles.",
              });
            } catch {}
          }
          return interaction.reply({ content: "Training results recorded: **" + (passed ? "PASS" : "FAIL") + "** (" + total + "/30). " + (passed ? "The trainee must claim their roles from the results message." : "A score below 20 is a fail. The trainee may request another session whenever they are eligible and have the Awaiting Training role."), flags: MessageFlags.Ephemeral });
        }
      }

      if (!interaction.isButton() || !interaction.guild) return;
      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (interaction.customId.startsWith("training_accept_")) {
        if (!isTrainer(member)) return interaction.reply({ content: "Only Staff Trainers can accept training requests.", flags: MessageFlags.Ephemeral });
        const traineeId = interaction.customId.slice("training_accept_".length);
        const request = data.activeRequests[traineeId];
        if (!request || request.status !== "pending" || request.guildId !== interaction.guild.id) {
          return interaction.reply({ content: "This request is no longer pending.", flags: MessageFlags.Ephemeral });
        }
        request.status = "accepted";
        request.acceptedBy = interaction.user.id;
        request.acceptedAt = Date.now();
        saveData();
        const panelText = interaction.message.components?.[0]?.components || [];
        const trainee = await interaction.guild.members.fetch(traineeId).catch(() => null);
        const requestPanelComponents = requestPanel(
          traineeId,
          trainee?.user?.username || "Unknown user",
          request.timezone,
          request.teamAccess,
          request.availability,
          true
        );
        await interaction.update({ components: requestPanelComponents, flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [STAFF_TRAINER_ROLE_ID], parse: [] } });
        await interaction.followUp({ content: "You accepted this training request. The trainee has been notified.", flags: MessageFlags.Ephemeral });
        if (trainee) {
          await trainee.send("Your training request has been accepted by <@" + interaction.user.id + ">. Please make your way to the briefing room inside the Sheriff's station.").catch(() => {});
        }
        await interaction.channel.send({ content: "<@" + traineeId + ">, <@" + interaction.user.id + "> has accepted your training request.", allowedMentions: { users: [traineeId, interaction.user.id] } });
        return;
      }

      if (interaction.customId.startsWith("training_cancel_")) {
        const traineeId = interaction.customId.slice("training_cancel_".length);
        const request = data.activeRequests[traineeId];
        if (!request || request.status !== "pending" || request.guildId !== interaction.guild.id) {
          return interaction.reply({ content: "Only a pending request can be cancelled. Accepted sessions must be handled by a Staff Trainer.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== traineeId && !isTrainer(member) && !isSeniorHR(member)) {
          return interaction.reply({ content: "Only the trainee, a Staff Trainer, or Senior HR can cancel a pending request.", flags: MessageFlags.Ephemeral });
        }
        delete data.activeRequests[traineeId];
        saveData();
        await interaction.update({ components: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
        return;
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
        await interaction.update({ embeds: interaction.message.embeds, components: resultButtons(trainee.id, resultId, true, true) });
        await interaction.followUp({ content: "Congratulations! You received Junior Moderator, Moderation Team, and Staff Team roles.", flags: MessageFlags.Ephemeral });
        const promotionsChannel = interaction.guild.channels.cache.get(PROMOTIONS_CHANNEL_ID);
        if (promotionsChannel && promotionsChannel.isTextBased()) {
          await promotionsChannel.send({
            embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("Staff Promotion")
              .setDescription("Congratulations <@" + trainee.id + ">! They passed training with **" + record.total + "/30** and claimed the **Junior Moderator**, **Moderation Team**, and **Staff Team** roles.\n\n**Trainer:** <@" + record.trainerId + ">")
              .setTimestamp()],
            allowedMentions: { parse: [] }
          }).catch(() => {});
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
