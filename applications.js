const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const APPLICATION_CHANNEL_ID = "1551975176084656209";
const STAFF_APPLICATION_CHANNEL_ID = "1528942658041413693";
const STAFF_APPLICATION_RESULTS_CHANNEL_ID = "1560173331704189008";
const BAN_APPEAL_CHANNEL_ID = "1551967879174553610";

const SENIOR_HR_ROLE_ID = "1551704056991318191";
const HR_ROLE_ID = "1551704115350999143";
const STAFF_BLACKLIST_ROLE_ID = "1529726037032833096";
const AWAITING_TRAINING_ROLE_ID = "1551985353802518588";
const APPLICATION_READER_ROLE_ID = "1551993755026858084";
const BAN_APPEAL_READER_ROLE_ID = "1551993820743335976";
const UNVERIFIED_ROLE_ID = "1528563912646197400";

const APPLICATION_PANEL_VERSION = 4;
const APPLICATION_PANEL_MARKER = "\u200B".repeat(APPLICATION_PANEL_VERSION);

const DATA_DIR = path.join(__dirname, "data");
const APPLICATIONS_FILE = path.join(DATA_DIR, "applications.json");
const COOLDOWNS_FILE = path.join(DATA_DIR, "application-cooldowns.json");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");
const STAFF_APPLICATION_RESET_MARKER = path.join(DATA_DIR, ".staff-applications-reset-v1");

const STATUS_COLORS = {
  Pending: 0x3498db,
  Approved: 0x2ecc71,
  Denied: 0xe74c3c,
  Blacklisted: 0x000000,
};

const STAFF_ROLE_IDS = new Set([
  AWAITING_TRAINING_ROLE_ID,
  APPLICATION_READER_ROLE_ID,
  BAN_APPEAL_READER_ROLE_ID,
  SENIOR_HR_ROLE_ID,
  HR_ROLE_ID,
  "1527383332093038755",
  "1528449495136731237",
  "1528449396860260503",
  "1528449441827258531",
  "1528449273644056666",
  "1528449153192169503",
  "1528435425373454366",
  "1528449008668774541",
  "1528426957962743989",
  "1528453585128390698",
  "1528453258568536314",
  "1551797151229808671",
  "1528426796670914671",
  "1528426646259105802",
  "1528425767678247021",
  "1528425691723595867",
  "1527851704605868254",
  "1528425534600646860",
]);

const STAFF_QUESTIONS = [
  "What's Your Roblox Username?",
  "What's Your Time Zone?",
  "How old are you?",
  "Do you have any past experience? If so, please list them along with the invite link.",
  "Why should we pick you over other applicants? (2+ sentences required)",
  "What does VDM stand for? Please provide an example. (2+ sentences required)",
  "What does RDM stand for? Please provide an example. (2+ sentences required)",
  "What does NLR stand for? Please provide an example. (2+ sentences required)",
  "What does FRP stand for? Please provide an example. (2+ sentences required)",
  "You see someone without a livery or a uniform, how would you deal with this? (2+ sentences required)",
  "If Timmy RDM a member and the user had a clip, how would you deal with this scene? (2+ sentences required)",
  "You go to a mod scene and get RDMed and they kept RDMed you, how would you deal with this? (2+ sentences required)",
  "You see someone from the staff team abusing their commands, what would you do? (2+ sentences required)",
];

const countdowns = new Map();
const activeSessions = new Map();

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const [file, initial] of [
    [APPLICATIONS_FILE, {}],
    [COOLDOWNS_FILE, {}],
    [BLACKLIST_FILE, []],
  ]) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(initial, null, 2));
    }
  }
}

function resetStaffApplicationsOnce() {
  if (fs.existsSync(STAFF_APPLICATION_RESET_MARKER)) return;
  const applications = readJson(APPLICATIONS_FILE, {});
  let removed = 0;
  for (const [id, application] of Object.entries(applications)) {
    if (application?.type === "staff") {
      delete applications[id];
      removed += 1;
    }
  }
  writeJson(APPLICATIONS_FILE, applications);
  fs.writeFileSync(STAFF_APPLICATION_RESET_MARKER, new Date().toISOString(), "utf8");
  console.log(`[Applications] One-time staff application reset complete; removed ${removed} staff application record(s). Ban appeals, cooldowns, and blacklists were preserved.`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isUnverified(member) {
  return Boolean(member?.roles?.cache?.has(UNVERIFIED_ROLE_ID));
}

function isStaff(member) {
  return member.roles.cache.some(role => STAFF_ROLE_IDS.has(role.id));
}

function isHR(member) {
  return member.roles.cache.has(HR_ROLE_ID) || member.roles.cache.has(SENIOR_HR_ROLE_ID);
}

function isSeniorHR(member) {
  return member.roles.cache.has(SENIOR_HR_ROLE_ID);
}

function isBlacklisted(member) {
  const blacklist = readJson(BLACKLIST_FILE, []);
  const listed = Array.isArray(blacklist) && blacklist.some(entry =>
    typeof entry === "string" ? entry === member.id : entry?.userId === member.id
  );
  return listed || member.roles.cache.has(STAFF_BLACKLIST_ROLE_ID);
}

function getUserApplications(userId) {
  const applications = readJson(APPLICATIONS_FILE, {});
  return Object.values(applications)
    .filter(app => app.userId === userId && app.type === "staff")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getCurrentApplication(userId) {
  return getUserApplications(userId).find(app =>
    app.status === "In Progress" || app.status === "Pending"
  ) || null;
}

function getCooldown(userId) {
  const cooldowns = readJson(COOLDOWNS_FILE, {});
  const entry = cooldowns[userId];
  const until = typeof entry === "number" ? entry : Number(entry?.until || 0);
  if (!until) return 0;

  if (Date.now() >= until) {
    if (typeof entry === "number") {
      delete cooldowns[userId];
    } else {
      cooldowns[userId] = { ...entry, until: 0 };
    }
    writeJson(COOLDOWNS_FILE, cooldowns);
    return 0;
  }

  return until;
}

function formatCooldown(until) {
  const remaining = Math.max(0, until - Date.now());
  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return minutes + " minute(s)";
  const hours = Math.ceil(remaining / 3600000);
  if (hours < 24) return hours + " hour(s)";
  return Math.ceil(remaining / 86400000) + " day(s)";
}

function createApplicationId(prefix = "APP") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

function v2Container(...contents) {
  const container = new ContainerBuilder();
  for (const content of contents) {
    if (content) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }
  return container;
}

function v2Reply(interaction, content) {
  return interaction.reply({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [v2Container(content)],
  });
}

function v2Update(interaction, content) {
  return interaction.update({
    flags: MessageFlags.IsComponentsV2,
    components: [v2Container(content)],
  });
}

function questionText(question) {
  return `**${question}**`;
}

function customEmoji(guild, name) {
  const found = guild?.emojis.cache.find(e => e.name === name);
  return found ? `<:${found.name}:${found.id}>` : "";
}

function buildApplicationPanel(guild) {
  const container = new ContainerBuilder();

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://applications.png")
    )
  );

  // Layout: top banner, spaced divider, description, spaced divider, buttons, divider, footer banner.
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> We offer a large range of applications, starting from our **Staff Applications** to **Media Applications**, we're always offering more opportunities to our members!" + APPLICATION_PANEL_MARKER
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("staff_application_start")
        .setLabel("Staff Application")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("media_application_start")
        .setLabel("Media Application")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ban_appeal_start")
        .setLabel("Ban Appeal")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://banner.png")
    )
  );

  return container;
}
async function ensureApplicationPanel(client) {
  const channel = await client.channels.fetch(APPLICATION_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  const botPanels = messages.filter(message => message.author?.id === client.user.id);
  const currentPanel = botPanels.find(message => JSON.stringify(message.components || []).includes(APPLICATION_PANEL_MARKER));

  const looksLikeApplicationPanel = message =>
    message.components?.length &&
    message.attachments?.some(attachment => (attachment.name === "applications.png" || attachment.name === "apps.png"));

  if (currentPanel) {
    for (const duplicate of botPanels.filter(message =>
      message.id !== currentPanel.id && looksLikeApplicationPanel(message)
    ).values()) {
      await duplicate.delete().catch(error => console.error("Failed to remove duplicate Application Center panel:", error));
    }
    console.log("Application Center panel is current; duplicate panels cleaned up.");
    return;
  }

  for (const panel of botPanels.filter(looksLikeApplicationPanel).values()) {
    await panel.delete().catch(error => {
      console.error("Failed to delete old Application Center panel:", error);
    });
  }

  const appBannerPath = path.join(__dirname, "applications.png");
  const bottomBannerPath = path.join(__dirname, "banner.png");

  await channel.send({
    components: [buildApplicationPanel(client.guilds.cache.first())],
    flags: MessageFlags.IsComponentsV2,
    files: [
      { attachment: appBannerPath, name: "applications.png" },
      { attachment: bottomBannerPath, name: "banner.png" },
    ],
  });

  console.log("Application Center panel updated because its panel version changed or no current panel existed.");
}

function buildEligibilityContainer(remaining, ready = false, started = false) {
  const requirements = [
    "You must provide accurate and honest information.",
    "You must be at least 13 years old.",
    "You must have no more than 5 moderations on your Roblox account.",
    "Safe Chat must be disabled on your Roblox account.",
    "You must use a computer to complete this application.",
    "Strong spelling, punctuation, and grammar skills are required.",
    "Your Roblox age group must be at least 13–15+.",
    "You must be able to run Discord and Roblox at the same time.",
  ];

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "## Staff Application\n> You're required to meet these requirements before applying. If you do not meet these requirements, you will not be accepted to join our Staff Team."
    )
  );

  // A large separator provides the same visible breathing room as the reference.
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## Application Requirements")
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(requirements.map(item => `• ${item}`).join("\n"))
  );

  // Separate the requirements from the final instruction paragraph.
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "You are about to start the application to become a staff member at **Missouri State Roleplay**. If you wish to commence this application, please press the **Continue** button below."
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("staff_application_confirm_ready")
        .setLabel(ready ? "Continue" : `Continue (${remaining})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(!ready || started),
      new ButtonBuilder()
        .setCustomId("staff_application_cancel")
         .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(started)
    )
  );

  // Reference panel has a divider beneath the buttons, before the bottom banner.
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://banner.png")
    )
  );
  return container;
}

async function startStaffApplication(interaction) {
  if (!interaction.guild || !interaction.member) return;

  // Unverified members cannot start staff applications. Support tickets remain available through the support panel.
  if (isUnverified(interaction.member)) {
    await v2Reply(interaction, "You must verify your account before using applications. If you are having trouble verifying, open a Support ticket.");
    return;
  }

  // Acknowledge immediately to prevent Discord's interaction from remaining in a thinking state.
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

  if (countdowns.has(interaction.user.id)) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("Your application eligibility check is already running. Please check your DMs for the existing panel.")] });
    return;
  }

  const existing = getCurrentApplication(interaction.user.id);
  if (existing?.status === "In Progress") {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("An application has already been started. Please check your DMs.")] });
    return;
  }
  if (existing?.status === "Pending") {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("You already have an active staff application. Please wait for it to be reviewed.")] });
    return;
  }
  if (isStaff(interaction.member)) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("You cannot submit a staff application because you are already a member of the staff team.")] });
    return;
  }
  if (isBlacklisted(interaction.member)) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("You are currently blacklisted from submitting staff applications.")] });
    return;
  }
  const cooldownUntil = getCooldown(interaction.user.id);
  if (cooldownUntil) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("Your previous staff application was denied. You can submit another application in " + formatCooldown(cooldownUntil) + ".")] });
    return;
  }

  let dm;
  let panelMessage;
  try {
    dm = await interaction.user.createDM();
    const bannerPath = path.join(__dirname, "banner.png");
    panelMessage = await dm.send({
      flags: MessageFlags.IsComponentsV2,
      components: [buildEligibilityContainer(10, false)],
      files: fs.existsSync(bannerPath) ? [{ attachment: bannerPath, name: "banner.png" }] : [],
    });
  } catch (error) {
    console.error("Could not send staff application eligibility panel by DM:", error);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("I couldn't send you the staff application panel. Please enable direct messages from server members and try again.")] });
    return;
  }

  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2Container("I've sent you the staff application panel in your DMs. Please continue there.")] });

  let remaining = 10;
  const timer = setInterval(async () => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      countdowns.delete(interaction.user.id);
      await panelMessage.edit({
        components: [buildEligibilityContainer(0, true)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(error => console.error("Could not update DM eligibility panel:", error));
      return;
    }

    await panelMessage.edit({
      components: [buildEligibilityContainer(remaining, false)],
      flags: MessageFlags.IsComponentsV2,
    }).catch(error => {
      clearInterval(timer);
      countdowns.delete(interaction.user.id);
      console.error("Could not update DM eligibility countdown:", error);
    });
  }, 1000);

  countdowns.set(interaction.user.id, timer);
}

function buildDMControlContainer(userId, applicationId, started = false, submitted = false) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## Staff Application")
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      submitted
        ? "Your application has been submitted for review."
        : "Are you ready to start this application?"
    )
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      submitted
        ? "Your responses have been received. Please wait for the staff team to review your application."
        : "Your application will automatically close after 10 minutes of inactivity. You can cancel the application at any time from this message."
    )
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staff_dm_start:${userId}:${applicationId}`)
        .setLabel(submitted ? "Application Submitted" : "Start Application")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(started || submitted),
      new ButtonBuilder()
        .setCustomId(`staff_dm_cancel:${userId}:${applicationId}`)
        .setLabel("Cancel Application")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(submitted)
    )
  );
  return container;
}

async function cancelApplicationById(userId, applicationId, dm, controlMessage) {
  const data = readJson(APPLICATIONS_FILE, {});
  const application = data[applicationId];
  if (!application || application.userId !== userId) return false;
  if (application.status !== "In Progress") return false;

  const session = activeSessions.get(userId);
  if (session?.collector) session.collector.stop("cancelled");
  activeSessions.delete(userId);

  delete data[applicationId];
  writeJson(APPLICATIONS_FILE, data);

  if (controlMessage) {
    await controlMessage.edit({
      components: [v2Container("## Staff Application\nYour application has been cancelled.")],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  } else if (dm) {
    await dm.send({
      components: [v2Container("## Staff Application\nYour application has been cancelled.")],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }
  return true;
}

async function activateDMApplication(user, applicationId, dm, controlMessage) {
  const existingSession = activeSessions.get(user.id);
  if (existingSession?.collector && !existingSession.collector.ended) {
    await dm.send("Your application is already running. Please answer the current question in this DM.").catch(() => {});
    return;
  }
  if (!dm || !dm.isDMBased()) {
    throw new Error("Staff application collector requires a direct-message channel.");
  }

  const applications = readJson(APPLICATIONS_FILE, {});
  const application = applications[applicationId];
  if (!application || application.userId !== user.id || application.status !== "In Progress") return;

  const filter = message => message.author.id === user.id && message.channel.isDMBased();
  const collector = dm.createMessageCollector({ filter, time: 10 * 60 * 1000 });
  const session = {
    applicationId,
    collector,
    controlMessage,
    index: Array.isArray(application.answers) ? application.answers.length : 0,
    answers: Array.isArray(application.answers) ? [...application.answers] : [],
  };

  activeSessions.set(user.id, session);

  collector.on("collect", async message => {
    try {
    const content = message.content.trim();

    if (!content) {
      await dm.send("Please provide a response.").catch(() => {});
      collector.resetTimer({ time: 10 * 60 * 1000 });
      return;
    }

    session.answers[session.index] = content;
    session.index += 1;
    collector.resetTimer({ time: 10 * 60 * 1000 });
    const progressData = readJson(APPLICATIONS_FILE, {});
    const progressApplication = progressData[applicationId];
    if (progressApplication && progressApplication.status === "In Progress") {
      progressApplication.answers = [...session.answers];
      progressApplication.lastActivityAt = new Date().toISOString();
      progressApplication.controlMessageId = controlMessage?.id || progressApplication.controlMessageId || null;
      progressApplication.controlChannelId = controlMessage?.channelId || progressApplication.controlChannelId || dm.id;
      writeJson(APPLICATIONS_FILE, progressData);
    }

    if (session.index >= STAFF_QUESTIONS.length) {
      collector.stop("submitted");
      const data = readJson(APPLICATIONS_FILE, {});
      const current = data[applicationId];
      if (!current) return;

      data[applicationId] = {
        ...current,
        status: "Pending",
        submittedAt: new Date().toISOString(),
        answers: session.answers,
      };
      writeJson(APPLICATIONS_FILE, data);
      activeSessions.delete(user.id);

      // Update the original DM control panel to a clear submitted state.
      // Do not replace it with the eligibility panel or send another start panel.
      await controlMessage.edit({
        components: [buildDMControlContainer(user.id, applicationId, true, true)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(error => {
        console.error("[Applications] Failed to update the application control panel to submitted:", error);
      });

      await dm.send({
        components: [v2Container("**Application submitted!** Your responses have been received and sent to the staff team for review. You will be notified when a decision is made.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(error => {
        console.error("[Applications] Failed to send application submission confirmation:", error);
      });

      await postStaffApplication(globalThis.__msrpClient, data[applicationId]);
      return;
    }

    await dm.send({ components: [v2Container(questionText(STAFF_QUESTIONS[session.index]))], flags: MessageFlags.IsComponentsV2 }).catch(error => {
      console.error("[Applications] Failed to send next staff application question:", error);
    });
    } catch (error) {
      console.error("[Applications] Error while processing a staff application answer:", error);
      await dm.send("I encountered a problem saving your answer. Your application has been stopped safely. Please start a new application from the Application Center.").catch(() => {});
      collector.stop("error");
      const data = readJson(APPLICATIONS_FILE, {});
      if (data[applicationId]?.status === "In Progress") {
        data[applicationId].answers = [...session.answers];
        data[applicationId].lastActivityAt = new Date().toISOString();
        writeJson(APPLICATIONS_FILE, data);
      }
      activeSessions.delete(user.id);
      await controlMessage.edit({
        components: [buildDMControlContainer(user.id, applicationId, true, false)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
      await dm.send({
        components: [v2Container("## Application Paused\nSomething interrupted the application, but your saved answers have been kept. Use the Start Application button on your application control message to resume.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  });

  collector.on("error", error => {
    console.error("[Applications] Staff application message collector error:", error);
  });

  collector.on("end", async (_, reason) => {
    activeSessions.delete(user.id);
    if (reason === "time") {
      const data = readJson(APPLICATIONS_FILE, {});
      if (data[applicationId]?.status === "In Progress") {
        delete data[applicationId];
        writeJson(APPLICATIONS_FILE, data);
        await dm.send({
          components: [v2Container("## Staff Application Expired\nYour application was automatically closed after 10 minutes of inactivity. You may start a new application from the Application Center.")],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
        await controlMessage.edit({
          components: [v2Container("## Staff Application\nThis application has expired because there was no activity for 10 minutes.")],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    }
  });

  try {
    if (session.index >= STAFF_QUESTIONS.length) {
      const data = readJson(APPLICATIONS_FILE, {});
      const current = data[applicationId];
      if (current && current.status === "In Progress") {
        current.status = "Pending";
        current.submittedAt = new Date().toISOString();
        current.answers = [...session.answers];
        writeJson(APPLICATIONS_FILE, data);
        collector.stop("submitted");
        activeSessions.delete(user.id);
        await controlMessage.edit({ components: [buildDMControlContainer(user.id, applicationId, true, true)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        await postStaffApplication(globalThis.__msrpClient, current);
        await dm.send({ components: [v2Container("Your saved application was submitted for review after the bot restarted.")], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
      return;
    }
    const resumeText = session.index > 0
      ? "## Application Resumed\nYour saved progress has been restored. Continue with the next unanswered question.\n\n" + questionText(STAFF_QUESTIONS[session.index])
      : questionText(STAFF_QUESTIONS[0]);
    await dm.send({ components: [v2Container(resumeText)], flags: MessageFlags.IsComponentsV2 });
  } catch (error) {
    console.error("[Applications] Failed to send first staff application question:", error);
    collector.stop("error");
    activeSessions.delete(user.id);
    const data = readJson(APPLICATIONS_FILE, {});
    if (data[applicationId]?.status === "In Progress") {
      delete data[applicationId];
      writeJson(APPLICATIONS_FILE, data);
    }
    await controlMessage.edit({
      components: [v2Container("## Staff Application Error\nI couldn't send the first question. Please check your DMs and start a new application.")],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }
}

async function beginDMApplication(interaction) {
  const user = interaction.user;
  const timer = countdowns.get(user.id);
  if (timer) clearInterval(timer);
  countdowns.delete(user.id);
  const existing = getCurrentApplication(user.id);

  if (existing?.status === "In Progress") {
    await v2Update(interaction, "An application has already been started. Please check your DMs.");
    return;
  }
  if (existing?.status === "Pending") {
    await v2Update(interaction, "You already have an active staff application. Please wait for it to be reviewed.");
    return;
  }

  const applications = readJson(APPLICATIONS_FILE, {});

  try {
    const dm = await user.createDM();
    const application = {
      id: createApplicationId("STAFF"),
      type: "staff",
      userId: user.id,
      username: user.tag,
      status: "In Progress",
      createdAt: new Date().toISOString(),
      answers: [],
      controlMessageId: interaction.message.id,
      controlChannelId: interaction.message.channelId,
      lastActivityAt: new Date().toISOString(),
    };

    applications[application.id] = application;
    writeJson(APPLICATIONS_FILE, applications);

    // Reuse the eligibility DM as the application control message. Do not
    // send a second "Are you ready?" confirmation panel: Continue starts the
    // first question immediately, and the same message retains the cancel control.
    await interaction.update({
      flags: MessageFlags.IsComponentsV2,
      components: [buildEligibilityContainer(0, true, true)],
    });

    await activateDMApplication(user, application.id, dm, interaction.message);
  } catch (error) {
    console.error("Failed to create staff application:", error);
    for (const [id, app] of Object.entries(applications)) {
      if (app.userId === user.id && app.status === "In Progress") delete applications[id];
    }
    writeJson(APPLICATIONS_FILE, applications);
    await v2Update(interaction, "I couldn't send you a DM. Please make sure your Discord direct messages are enabled, then try again.").catch(() => {});
  }
}

function statusColor(status) {
  return status === "Approved" ? 0x2ecc71 : status === "Denied" ? 0xe74c3c : status === "Blacklisted" ? 0x000000 : 0x808080;
}

function buildStaffReviewContainer(application) {
  const statusText = application.status === "Approved" ? "Accepted" : application.status === "Denied" ? "Denied" : application.status === "Blacklisted" ? "Blacklisted" : "Currently Being Reviewed";
  const container = new ContainerBuilder().setAccentColor(statusColor(application.status));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("## Staff Application\n**Status:** " + statusText + "\n**Applicant:** <@" + application.userId + ">" + (application.status === "Pending" ? "\n**Application Reader:** <@&" + APPLICATION_READER_ROLE_ID + ">" : "\n**Reviewed By:** <@" + (application.reviewedBy || "Unknown") + ">")));
  (STAFF_QUESTIONS || []).slice(0, 25).forEach((question, index) => {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("**" + String(question) + "**\n" + String(application.answers?.[index] || "No response.")));
  });
  if (application.resultReason) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("**Decision Reason**\n" + application.resultReason));
  }
  return container;
}

function buildStaffReviewButtons(application) {
  if (application.status !== "Pending") return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("staff_approve:" + application.id).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("staff_deny:" + application.id).setLabel("Deny").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("staff_blacklist:" + application.id).setLabel("Blacklist").setStyle(ButtonStyle.Secondary)
  )];
}

async function postStaffApplication(client, application) {
  const channel = await client.channels.fetch(STAFF_APPLICATION_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    components: [buildStaffReviewContainer(application), ...buildStaffReviewButtons(application)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [application.userId], roles: [APPLICATION_READER_ROLE_ID] },
  });
}

function recoverStaffApplicationFromReviewMessage(interaction, applicationId) {
  const components = interaction.message?.components || [];
  const texts = [];

  function walk(items) {
    for (const item of items || []) {
      if (typeof item.content === "string") texts.push(item.content);
      if (Array.isArray(item.components)) walk(item.components);
    }
  }

  walk(components);

  const combined = texts.join("\n");
  const userMatch = combined.match(/<@(\d{17,20})>/);
  if (!userMatch) return null;

  const answers = [];
  for (const text of texts) {
    const match = text.match(/^\*\*(.+?)\*\*\n([\s\S]*)$/);
    if (match && !match[1].startsWith("Status:") && !match[1].startsWith("Applicant:")) {
      answers.push(match[2].trim());
    }
  }

  return {
    id: applicationId,
    type: "staff",
    userId: userMatch[1],
    status: "Pending",
    createdAt: new Date().toISOString(),
    answers,
  };
}

async function showStaffDecisionReasonModal(interaction, action, applicationId) {
  const modal = new ModalBuilder()
    .setCustomId(`staff_decision_reason:${action}:${applicationId}`)
    .setTitle(action === "approve" ? "Accept Application" : action === "blacklist" ? "Blacklist Applicant" : "Deny Application");
  const reason = new TextInputBuilder()
    .setCustomId("decision_reason")
    .setLabel(action === "approve" ? "Reason for accepting" : action === "blacklist" ? "Reason for staff blacklist" : "Reason for denying")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Explain why this decision was made...")
    .setMinLength(3)
    .setMaxLength(1000)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  await interaction.showModal(modal);
}

async function handleStaffDecision(interaction, action, applicationId, decisionReason = "") {
  // Modal submissions need a response of their own; button-based decisions defer the update.
  if (!interaction.deferred && !interaction.replied) {
    if (interaction.isModalSubmit?.()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    else await interaction.deferUpdate();
  }

  if (!interaction.member?.roles?.cache?.has(APPLICATION_READER_ROLE_ID)) {
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [v2Container("Only Application Readers can approve, deny, or blacklist staff applications.")],
    });
    return;
  }

  const applications = readJson(APPLICATIONS_FILE, {});
  let application = applications[applicationId];

  // Review messages can survive a bot redeploy while the local data file does
  // not. Recover the applicant and answers directly from the review message so
  // old pending applications remain actionable instead of returning "not found".
  if (!application || application.type !== "staff") {
    application = recoverStaffApplicationFromReviewMessage(interaction, applicationId);
    if (!application) {
      await interaction.followUp({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [v2Container("That application could not be found. Please have the applicant submit a new application.")],
      });
      return;
    }
    applications[applicationId] = application;
  }

  if (application.status !== "Pending") {
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [v2Container(`This application has already been ${application.status.toLowerCase()}.`)],
    });
    return;
  }

  const member = await interaction.guild.members.fetch(application.userId).catch(() => null);

  if (action === "approve") {
    application.status = "Approved";
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = new Date().toISOString();
    application.resultReason = decisionReason.trim();
    if (!member) throw new Error("Applicant is no longer a member of this server; cannot assign Awaiting Training role.");
    await member.roles.add(AWAITING_TRAINING_ROLE_ID);
  } else if (action === "deny") {
    application.status = "Denied";
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = new Date().toISOString();
    application.resultReason = decisionReason.trim();
    const cooldowns = readJson(COOLDOWNS_FILE, {});
    const previous = cooldowns[application.userId];
    const previousCount = typeof previous === "object" && previous
      ? Number(previous.denialCount || 0)
      : 0;
    const denialCount = previousCount + 1;
    const duration = denialCount === 1
      ? 10 * 60 * 1000
      : denialCount === 2
        ? 3 * 60 * 60 * 1000
        : 3 * 24 * 60 * 60 * 1000;
    cooldowns[application.userId] = {
      denialCount,
      until: Date.now() + duration,
      lastDeniedAt: new Date().toISOString(),
    };
    writeJson(COOLDOWNS_FILE, cooldowns);
    application.denialCount = denialCount;
    application.reapplicationCooldownMs = duration;
  } else if (action === "blacklist") {
    application.status = "Blacklisted";
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = new Date().toISOString();
    application.resultReason = decisionReason.trim();
    const blacklist = readJson(BLACKLIST_FILE, []);
    if (!blacklist.includes(application.userId)) blacklist.push(application.userId);
    writeJson(BLACKLIST_FILE, blacklist);
    if (member) await member.roles.add(STAFF_BLACKLIST_ROLE_ID);
  }

  writeJson(APPLICATIONS_FILE, applications);
  await postStaffApplicationResult(interaction.client, application);

  // We already deferred the interaction, so edit the original review message
  // instead of calling interaction.update() a second time.
  await interaction.message.edit({
    components: [buildStaffReviewContainer(application)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [application.userId, interaction.user.id] },
  }).catch(error => {
    console.error("Failed to update staff application review message:", error);
  });

  // Finish the deferred button/modal interaction with a visible success confirmation.
  // Without this follow-up, Discord can keep showing the interaction as "thinking..."
  // even though the application result and role changes were processed successfully.
  const successMessage = action === "approve"
    ? "✅ Staff application approved successfully. The applicant has been assigned the Awaiting Training role."
    : action === "deny"
      ? "✅ Staff application denied successfully. The 3-day reapplication cooldown has been applied."
      : "✅ Staff applicant has been blacklisted successfully.";
  await interaction.followUp({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [v2Container(successMessage)],
  });
}

async function postStaffApplicationResult(client, application) {
  const channel = await client.channels.fetch(STAFF_APPLICATION_RESULTS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error("[Applications] Staff application results channel could not be found or is not text-based.");
    return;
  }

  const status = application.status === "Approved" ? "Accepted" :
    application.status === "Denied" ? "Denied" : "Blacklisted";
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Staff Application Results — ${status}\n**Applicant:** <@${application.userId}>\n**Reviewed By:** <@${application.reviewedBy}>\n**Reason:** ${application.resultReason || "No reason provided."}`
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  const bannerPath = path.join(__dirname, "banner.png");
  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [application.userId, application.reviewedBy] },
  };
  if (fs.existsSync(bannerPath)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://banner.png")
      )
    );
    payload.files = [{ attachment: bannerPath, name: "banner.png" }];
  }
  await channel.send(payload);
}

async function safeDM(userId, content) {
  try {
    const user = await globalThis.__msrpClient?.users.fetch(userId);
    if (user) {
      await user.send({
        components: [v2Container(content)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch (error) {
    console.error("Failed to DM application user:", error);
  }
}

async function showBanAppealModal(interaction) {
  const modal = new ModalBuilder().setCustomId("ban_appeal_modal").setTitle("Ban Appeal");

  const username = new TextInputBuilder()
    .setCustomId("ban_appeal_username")
    .setLabel("Roblox Username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const reason = new TextInputBuilder()
    .setCustomId("ban_appeal_reason")
    .setLabel("Why were you banned?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const appeal = new TextInputBuilder()
    .setCustomId("ban_appeal_why")
    .setLabel("Why should your ban be appealed?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(username),
    new ActionRowBuilder().addComponents(reason),
    new ActionRowBuilder().addComponents(appeal)
  );

  await interaction.showModal(modal);
}

function buildBanAppealReviewContainer(appeal) {
  const statusText = appeal.status === "Approved" ? "Accepted" : appeal.status === "Denied" ? "Denied" : "Currently Being Reviewed";
  const container = new ContainerBuilder().setAccentColor(statusColor(appeal.status));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("## Ban Appeal\n**Roblox Username:** " + String(appeal.username || "Unknown") + "\n**Status:** " + statusText + "\n**Applicant:** <@" + appeal.userId + ">" + (appeal.status === "Pending" ? "\n**Ban Appeal Reader:** <@" + BAN_APPEAL_READER_ROLE_ID + ">" : "\n**Reviewed By:** <@" + (appeal.reviewedBy || "Unknown") + ">")));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("**Why were you banned?**\n" + String(appeal.answers?.reason || "No response.")));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("**Why should your ban be appealed?**\n" + String(appeal.answers?.why || "No response.")));
  return container;
}

function buildBanAppealReviewButtons(appeal) {
  if (appeal.status !== "Pending") return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("appeal_approve:" + appeal.id).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("appeal_deny:" + appeal.id).setLabel("Deny").setStyle(ButtonStyle.Danger)
  )];
}

async function submitBanAppeal(interaction) {
  // Modal submissions also have a short response window. Acknowledge first,
  // then perform channel lookup, persistence, and message sending.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const channel = await interaction.client.channels.fetch(BAN_APPEAL_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [v2Container("The ban appeal channel could not be found.")],
    });
    return;
  }

  const existingAppeal = Object.values(readJson(APPLICATIONS_FILE, {}))
    .filter(app => app.type === "ban_appeal" && app.userId === interaction.user.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

  if (existingAppeal?.status === "Pending") {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [v2Container("## Ban Appeal\nYour ban appeal is currently being reviewed. Please wait for the staff team to finish reviewing it.")],
    });
    return;
  }

  if (existingAppeal?.status === "Denied") {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [v2Container("## Ban Appeal\nYour previous ban appeal was denied. You cannot submit another ban appeal.")],
    });
    return;
  }

  const appealId = createApplicationId("APPEAL");
  const username = interaction.fields.getTextInputValue("ban_appeal_username");
  const reason = interaction.fields.getTextInputValue("ban_appeal_reason");
  const why = interaction.fields.getTextInputValue("ban_appeal_why");

  const appeal = {
    id: appealId,
    type: "ban_appeal",
    userId: interaction.user.id,
    username,
    status: "Pending",
    createdAt: new Date().toISOString(),
    answers: { reason, why },
  };

  const applications = readJson(APPLICATIONS_FILE, {});
  applications[appealId] = appeal;
  writeJson(APPLICATIONS_FILE, applications);

  await channel.send({
    components: [buildBanAppealReviewContainer(appeal), ...buildBanAppealReviewButtons(appeal)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [appeal.userId], roles: [BAN_APPEAL_READER_ROLE_ID] },
  });

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [v2Container("## Ban Appeal\nYour ban appeal has been submitted and is currently being reviewed by the staff team.")],
  });
}

async function handleBanAppealDecision(interaction, action, appealId) {
  // Acknowledge immediately so saving data or sending the decision DM cannot
  // cause the button interaction to expire before the review message updates.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  if (!interaction.member?.roles?.cache?.has(BAN_APPEAL_READER_ROLE_ID)) {
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [v2Container("Only Ban Appeal Readers can approve or deny ban appeals.")],
    });
    return;
  }

  const applications = readJson(APPLICATIONS_FILE, {});
  const appeal = applications[appealId];
  if (!appeal || appeal.type !== "ban_appeal") {
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [v2Container("That ban appeal could not be found.")],
    });
    return;
  }
  if (appeal.status !== "Pending") {
    await interaction.followUp({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [v2Container(`This ban appeal has already been ${appeal.status.toLowerCase()}.`)],
    });
    return;
  }

  appeal.status = action === "approve" ? "Approved" : "Denied";
  appeal.reviewedBy = interaction.user.id;
  appeal.reviewedAt = new Date().toISOString();
  writeJson(APPLICATIONS_FILE, applications);

  await interaction.message.edit({
    components: [buildBanAppealReviewContainer(appeal)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [appeal.userId, interaction.user.id] },
  });
  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

  await safeDM(
    appeal.userId,
    appeal.status === "Approved"
      ? "## Ban Appeal Accepted\nYour Missouri State Roleplay ban appeal has been accepted. You have received an approval decision."
      : "## Ban Appeal Denied\nYour Missouri State Roleplay ban appeal has been denied. You cannot submit another ban appeal."
  );
}

async function handleDMButton(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[0].replace("staff_dm_", "");
  const userId = parts[1];
  const applicationId = parts.slice(2).join(":");

  if (interaction.user.id !== userId) return;

  const applications = readJson(APPLICATIONS_FILE, {});
  const application = applications[applicationId];
  if (!application || application.userId !== userId) {
    await v2Reply(interaction, "This application session could not be found.");
    return;
  }

  if (action === "start") {
    if (application.status !== "In Progress") {
      await interaction.update({
        components: [v2Container("## Staff Application\nThis application has already been started or completed.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
      return;
    }

    await interaction.update({
      components: [buildDMControlContainer(userId, applicationId, true, false)],
      flags: MessageFlags.IsComponentsV2,
    });

    await activateDMApplication(interaction.user, applicationId, interaction.channel, interaction.message);
    return;
  }

  if (action === "cancel") {
    const session = activeSessions.get(userId);
    if (session?.collector) session.collector.stop("cancelled");
    activeSessions.delete(userId);

    if (application.status === "In Progress") {
      delete applications[applicationId];
      writeJson(APPLICATIONS_FILE, applications);
      await interaction.update({
        components: [v2Container("## Staff Application\nYour application has been cancelled.")],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await interaction.update({
        components: [v2Container("## Staff Application\nThis application has already been submitted and can no longer be cancelled.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }
}

function setup(client) {
  ensureDataFiles();
  // Keep in-progress records when the bot restarts or deploys.
  globalThis.__msrpClient = client;

  // Restore saved in-progress applications after deploys/restarts.
  client.once(Events.ClientReady, async () => {
    const data = readJson(APPLICATIONS_FILE, {});
    const resumable = Object.values(data).filter(app => app?.type === "staff" && app.status === "In Progress");
    for (const application of resumable) {
      try {
        const user = await client.users.fetch(application.userId);
        const dm = await user.createDM();
        let controlMessage = null;
        if (application.controlMessageId) {
          controlMessage = await dm.messages.fetch(application.controlMessageId).catch(() => null);
        }
        if (!controlMessage) {
          controlMessage = await dm.send({
            components: [buildDMControlContainer(user.id, application.id, true, false)],
            flags: MessageFlags.IsComponentsV2,
          });
          application.controlMessageId = controlMessage.id;
          application.controlChannelId = controlMessage.channelId;
          data[application.id] = application;
          writeJson(APPLICATIONS_FILE, data);
        }
        await activateDMApplication(user, application.id, dm, controlMessage);
      } catch (error) {
        console.error("[Applications] Could not resume in-progress application " + application.id + " for user " + application.userId + ":", error);
      }
    }
    console.log("[Applications] Startup resume check complete for " + resumable.length + " in-progress application(s).");
  });

  // Senior HR can clear an applicant's stored denial history and cooldown.
  // Usage: !clear application denials @user (or a user ID)
  client.on("messageCreate", async message => {
    try {
      if (!message.guild || message.author.bot) return;
      const parts = message.content.trim().split(/\\s+/);
      if (parts.slice(0, 3).join(" ").toLowerCase() !== "!clear application denials") return;
      const actor = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!actor || !isSeniorHR(actor)) {
        await message.reply("Only Senior HR can clear staff application denial history.");
        return;
      }
      const targetId = message.mentions.users.first()?.id || parts[3]?.replace(/[<@!>]/g, "");
      if (!targetId || !/^\\d{17,20}$/.test(targetId)) {
        await message.reply("Usage: !clear application denials @user or !clear application denials USER_ID.");
        return;
      }
      const applications = readJson(APPLICATIONS_FILE, {});
      let removed = 0;
      for (const [applicationId, application] of Object.entries(applications)) {
        if (application.userId === targetId && application.type === "staff" && application.status === "Denied") {
          delete applications[applicationId];
          removed++;
        }
      }
      writeJson(APPLICATIONS_FILE, applications);
      const cooldowns = readJson(COOLDOWNS_FILE, {});
      delete cooldowns[targetId];
      writeJson(COOLDOWNS_FILE, cooldowns);
      await message.reply("Cleared stored staff application denial history for <@" + targetId + "> and reset their reapplication cooldown. Removed " + removed + " denied application record(s).");
    } catch (error) {
      console.error("Application denial history clear command failed:", error);
      await message.reply("Could not clear that applicant's denial history. Check the bot console for details.").catch(() => {});
    }
  });

  // The Application Center panel is persistent and is intentionally not
  // recreated during bot startup. This prevents duplicate panels and speeds up
  // deployments.

  client.on("interactionCreate", async interaction => {
    try {
      if (interaction.isButton()) {
        // Block application actions for unverified members, while leaving the Support panel handled by support.js available.
        if (interaction.guild && isUnverified(interaction.member) && [
          "staff_application_start", "media_application_start", "ban_appeal_start",
          "staff_application_cancel", "staff_application_confirm_ready"
        ].includes(interaction.customId)) {
          await v2Reply(interaction, "You must verify your account before using applications. If you are having trouble verifying, open a Support ticket.");
          return;
        }

        if (interaction.customId.startsWith("staff_dm_start:") || interaction.customId.startsWith("staff_dm_cancel:")) {
          await handleDMButton(interaction);
          return;
        }

        if (interaction.customId === "staff_application_start") {
          await startStaffApplication(interaction);
          return;
        }

        if (interaction.customId === "media_application_start") {
          await v2Reply(
            interaction,
            "Become a member of the Media Team by applying through a General Support ticket."
          );
          return;
        }

        if (interaction.customId === "staff_application_cancel") {
          const timer = countdowns.get(interaction.user.id);
          if (timer) clearInterval(timer);
          countdowns.delete(interaction.user.id);
          await v2Update(interaction, "Application cancelled.");
          return;
        }

        if (interaction.customId === "staff_application_confirm_ready") {
          await beginDMApplication(interaction);
          return;
        }

        if (interaction.customId.startsWith("staff_application_confirm:")) {
          await interaction.deferUpdate();
          return;
        }

        const [prefix, id] = interaction.customId.split(":");
        if (prefix === "staff_approve" || prefix === "staff_deny" || prefix === "staff_blacklist") {
          await showStaffDecisionReasonModal(interaction, prefix.replace("staff_", ""), id);
          return;
        }

        if (prefix === "appeal_approve" || prefix === "appeal_deny") {
          await handleBanAppealDecision(interaction, prefix.replace("appeal_", ""), id);
          return;
        }

        if (interaction.customId === "ban_appeal_start") {
          await showBanAppealModal(interaction);
          return;
        }
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("staff_decision_reason:")) {
        const [, action, applicationId] = interaction.customId.split(":");
        const reason = interaction.fields.getTextInputValue("decision_reason").trim();
        if (reason.length < 3) {
          await interaction.reply({ content: "Please provide a reason of at least 3 characters.", ephemeral: true });
          return;
        }
        await handleStaffDecision(interaction, action, applicationId, reason);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === "ban_appeal_modal") {
        await submitBanAppeal(interaction);
      }
    } catch (error) {
      console.error("Application interaction error:", error);
      const message = "Something went wrong while processing this application action.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          components: [v2Container(message)],
        }).catch(() => {});
      } else {
        await v2Reply(interaction, message).catch(() => {});
      }
    }
  });
}

module.exports = { setup, ensureApplicationPanel };
