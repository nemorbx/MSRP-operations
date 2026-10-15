const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const STAFF_TRAINER_ROLE_ID = "1527903039669665853";
const JUNIOR_MOD_ROLE_ID = "1528449495136731237";
const STAFF_TEAM_ROLE_ID = "1528242210871447672";
const TRAINING_ROLE_ID = "1551985353802518588";
const REQUEST_CHANNEL_ID = "1528996885262766250";
const RESULTS_CHANNEL_ID = "1528997058365886554";
const PROMOTIONS_CHANNEL_ID = "1529167049949970453";
const REQUEST_COOLDOWN_MS = 60 * 60 * 1000;
const FAIL_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const DATA_PATH = path.join(__dirname, "training-data.json");

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return { requests: parsed.requests || {}, failedUntil: parsed.failedUntil || {} };
  } catch {
    return { requests: {}, failedUntil: {} };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
const data = loadData();

const trainingCommand = new SlashCommandBuilder()
  .setName("training")
  .setDescription("Training requests and results")
  .addSubcommand(sub => sub.setName("request").setDescription("Request a training session"))
  .addSubcommand(sub => sub.setName("results").setDescription("Submit a trainee's training results")
    .addUserOption(o => o.setName("trainee").setDescription("Trainee being evaluated").setRequired(true))
    .addStringOption(o => o.setName("driving").setDescription("Driving result").setRequired(true)
      .addChoices({name:"Pass",value:"Pass"},{name:"Fail",value:"Fail"}))
    .addStringOption(o => o.setName("spag").setDescription("SPAG result").setRequired(true)
      .addChoices({name:"Pass",value:"Pass"},{name:"Fail",value:"Fail"}))
    .addStringOption(o => o.setName("moderation").setDescription("Moderation result").setRequired(true)
      .addChoices({name:"Pass",value:"Pass"},{name:"Fail",value:"Fail"}))
    .addStringOption(o => o.setName("notes").setDescription("Optional trainer notes").setRequired(false)));

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "training" || !interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const member = interaction.member;
    const now = Date.now();

    if (sub === "request") {
      if (!member.roles.cache.has(TRAINING_ROLE_ID)) {
        return interaction.reply({ content: "Only trainees with the Awaiting Training role can request training.", flags: MessageFlags.Ephemeral });
      }
      const failedUntil = data.failedUntil[member.id] || 0;
      if (failedUntil > now) {
        const hours = Math.ceil((failedUntil - now) / (60 * 60 * 1000));
        return interaction.reply({ content: `Your training request is locked after a failed training. Try again in approximately ${hours} hour(s).`, flags: MessageFlags.Ephemeral });
      }
      const last = data.requests[member.id] || 0;
      if (now - last < REQUEST_COOLDOWN_MS) {
        const minutes = Math.ceil((REQUEST_COOLDOWN_MS - (now - last)) / 60000);
        return interaction.reply({ content: `You can request training again in ${minutes} minute(s).`, flags: MessageFlags.Ephemeral });
      }
      const channel = interaction.guild.channels.cache.get(REQUEST_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({ content: "The training request channel is not configured correctly. Please contact an administrator.", flags: MessageFlags.Ephemeral });
      }
      data.requests[member.id] = now;
      saveData(data);
      const embed = new EmbedBuilder().setColor(0x3498db).setTitle("Training Request")
        .setDescription(`**Trainee:** ${member}\n**Requested by:** ${interaction.user}\n\nA trainee has requested a training session. Staff Trainers, please coordinate with them.`)
        .setTimestamp();
      await channel.send({ content: `<@&${STAFF_TRAINER_ROLE_ID}>`, embeds: [embed], allowedMentions: { roles: [STAFF_TRAINER_ROLE_ID] } });
      return interaction.reply({ content: "Your training request has been submitted. Staff Trainers have been notified.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "results") {
      if (!member.roles.cache.has(STAFF_TRAINER_ROLE_ID)) {
        return interaction.reply({ content: "Only members with the Staff Trainer role can submit training results.", flags: MessageFlags.Ephemeral });
      }
      const traineeUser = interaction.options.getUser("trainee", true);
      const trainee = await interaction.guild.members.fetch(traineeUser.id).catch(() => null);
      if (!trainee || trainee.user.bot) {
        return interaction.reply({ content: "I couldn't find that trainee in this server.", flags: MessageFlags.Ephemeral });
      }
      if (!trainee.roles.cache.has(TRAINING_ROLE_ID)) {
        return interaction.reply({ content: "That member does not have the Awaiting Training role, so they cannot receive training results through this command.", flags: MessageFlags.Ephemeral });
      }
      const driving = interaction.options.getString("driving", true);
      const spag = interaction.options.getString("spag", true);
      const moderation = interaction.options.getString("moderation", true);
      const notes = interaction.options.getString("notes") || "No additional notes.";
      const passed = [driving, spag, moderation].every(result => result === "Pass");
      const resultsChannel = interaction.guild.channels.cache.get(RESULTS_CHANNEL_ID);
      if (!resultsChannel || !resultsChannel.isTextBased()) {
        return interaction.reply({ content: "The training results channel is not configured correctly. No roles were changed.", flags: MessageFlags.Ephemeral });
      }

      try {
        if (passed) {
          const juniorRole = interaction.guild.roles.cache.get(JUNIOR_MOD_ROLE_ID);
          const staffRole = interaction.guild.roles.cache.get(STAFF_TEAM_ROLE_ID);
          if (!juniorRole || !staffRole) {
            return interaction.reply({ content: "The Junior Moderator or Staff Team role could not be found. No roles were changed.", flags: MessageFlags.Ephemeral });
          }
          if (juniorRole.position >= interaction.guild.members.me.roles.highest.position ||
              staffRole.position >= interaction.guild.members.me.roles.highest.position ||
              (interaction.guild.roles.cache.get(TRAINING_ROLE_ID)?.position || 0) >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: "My highest role must be above the Junior Moderator, Staff Team, and Awaiting Training roles. No roles were changed.", flags: MessageFlags.Ephemeral });
          }
          await trainee.roles.add([JUNIOR_MOD_ROLE_ID, STAFF_TEAM_ROLE_ID], "Passed staff training");
          await trainee.roles.remove(TRAINING_ROLE_ID, "Passed staff training");
          delete data.failedUntil[trainee.id];
        } else {
          await trainee.roles.remove(TRAINING_ROLE_ID, "Failed staff training");
          data.failedUntil[trainee.id] = now + FAIL_COOLDOWN_MS;
        }
        saveData(data);

        const resultEmbed = new EmbedBuilder()
          .setColor(passed ? 0x2ecc71 : 0xe74c3c)
          .setTitle(passed ? "Training Results — Passed" : "Training Results — Failed")
          .setDescription(`**Trainee:** ${trainee}\n**Trainer:** ${interaction.user}\n\n**Driving:** ${driving}\n**SPAG:** ${spag}\n**Moderation:** ${moderation}\n\n**Notes:** ${notes}`)
          .setTimestamp();
        await resultsChannel.send({ embeds: [resultEmbed], allowedMentions: { parse: [] } });

        if (passed) {
          const promotionsChannel = interaction.guild.channels.cache.get(PROMOTIONS_CHANNEL_ID);
          if (promotionsChannel && promotionsChannel.isTextBased()) {
            const promotionEmbed = new EmbedBuilder().setColor(0x2ecc71).setTitle("Staff Promotion")
              .setDescription(`Congratulations ${trainee}! You have successfully passed staff training and have been assigned **Junior Moderator** and **Staff Team** roles. Welcome to the MSRP staff team!\n\n**Trainer:** ${interaction.user}`)
              .setTimestamp();
            await promotionsChannel.send({ embeds: [promotionEmbed], allowedMentions: { parse: [] } });
          }
          await interaction.reply({ content: `Training results recorded: **PASS**. ${trainee} received the Junior Moderator and Staff Team roles, and the promotion announcement was sent.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `Training results recorded: **FAIL**. The result was sent to the results channel only. ${trainee} must wait 3 days before requesting training again.`, flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        console.error("Training results error:", error);
        return interaction.reply({ content: "I couldn't complete the role updates. Check the bot's role hierarchy and permissions.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

module.exports = { setup, commands: [trainingCommand] };
