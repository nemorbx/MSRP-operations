import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================
// FILE SETUP
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLICATIONS_FILE = path.join(
  __dirname,
  "applications.json"
);

const BLACKLIST_FILE = path.join(
  __dirname,
  "blacklist.json"
);

function ensureFile(file, data) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2)
    );
  }
}

ensureFile(APPLICATIONS_FILE, []);
ensureFile(BLACKLIST_FILE, []);

function load(file, fallback = []) {
  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return fallback;
  }
}

function save(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

// ============================================================
// CHANNELS
// ============================================================

const APPLICATION_CENTER_CHANNEL_ID =
  "1551975176084656209";

const APPLICATIONS_CHANNEL_ID =
  "1528942658041413693";

const BAN_APPEALS_CHANNEL_ID =
  "1551967879174553610";

// ============================================================
// ROLES
// ============================================================

const SENIOR_HR_ROLE_ID =
  "1551704056991318191";

const HR_ROLE_ID =
  "1551704115350999143";

const STAFF_BLACKLIST_ROLE_ID =
  "1529726037032833096";

const AWAITING_TRAINING_ROLE_ID =
  "1551985353802518588";

const APPLICATION_READER_ROLE_ID =
  "1551993755026858084";

const BAN_APPEAL_READER_ROLE_ID =
  "1551993820743335976";

// ============================================================
// STAFF ROLES
// ============================================================

const STAFF_ROLE_IDS = [
  "1527383332093038755",
  "1528449495136731237",
  "1528449396860260503",
  "1528449441827258531",
  "1551793867534114827",
  "1528449273644056666",
  "1528449153192169503",
  "1528435425373454366",
  "1528449008668774541",
  "1528426018136920245",
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
  "1528425622047821875"
];

// ============================================================
// COLORS
// ============================================================

const COLORS = {
  PENDING: 0x5dade2,
  APPROVED: 0x57f287,
  DENIED: 0xed4245,
  BLACKLISTED: 0xf1c40f
};

// ============================================================
// STAFF QUESTIONS
// ============================================================

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
  "You see someone from the staff team abusing their commands, what would you do? (2+ sentences required)"
];

// ============================================================
// ACTIVE APPLICATIONS
// ============================================================

const activeApplications = new Map();
const countdowns = new Map();

let clientRef = null;

// ============================================================
// HELPERS
// ============================================================

function isStaff(member) {
  return STAFF_ROLE_IDS.some(role =>
    member.roles.cache.has(role)
  );
}

function isHR(member) {
  return (
    member.roles.cache.has(HR_ROLE_ID) ||
    member.roles.cache.has(SENIOR_HR_ROLE_ID)
  );
}

function isSeniorHR(member) {
  return member.roles.cache.has(
    SENIOR_HR_ROLE_ID
  );
}

function isBlacklisted(userId) {
  const blacklist = load(
    BLACKLIST_FILE,
    []
  );

  return blacklist.some(
    x => x.userId === userId
  );
}

function hasPendingApplication(userId) {
  const applications = load(
    APPLICATIONS_FILE,
    []
  );

  return applications.some(
    x =>
      x.type === "staff" &&
      x.userId === userId &&
      x.status === "Pending"
  );
}

function wasRecentlyDenied(userId) {
  const applications = load(
    APPLICATIONS_FILE,
    []
  );

  const denied = applications
    .filter(
      x =>
        x.type === "staff" &&
        x.userId === userId &&
        x.status === "Denied" &&
        x.reviewedAt
    )
    .sort(
      (a, b) =>
        new Date(b.reviewedAt) -
        new Date(a.reviewedAt)
    );

  if (!denied.length) {
    return false;
  }

  const deniedTime =
    new Date(
      denied[0].reviewedAt
    ).getTime();

  const cooldown =
    3 * 24 * 60 * 60 * 1000;

  return Date.now() <
    deniedTime + cooldown;
}

function createID(prefix) {
  const applications = load(
    APPLICATIONS_FILE,
    []
  );

  let id;

  do {
    id =
      `${prefix}-${Math.floor(
        100000 +
        Math.random() * 900000
      )}`;
  } while (
    applications.some(
      x => x.id === id
    )
  );

  return id;
}

// ============================================================
// APPLICATION CENTER PANEL
// ============================================================

async function ensureApplicationCenter() {
  try {
    const channel =
      await clientRef.channels.fetch(
        APPLICATION_CENTER_CHANNEL_ID
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const alreadyExists =
      messages.some(message =>
        message.author.id ===
          clientRef.user.id &&
        message.components?.some(row =>
          row.components?.some(
            component =>
              component.customId ===
              "staff_application_start"
          )
        )
      );

    if (alreadyExists) {
      console.log(
        "Application Center panel already exists."
      );
      return;
    }

    // ========================================================
    // COMPONENTS V2 APPLICATION CENTER
    // ========================================================
    // The panel intentionally uses Components V2 instead of
    // a traditional Discord embed, so there is no embed border.

    const container =
      new ContainerBuilder()
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(
              "attachment://apps.png"
            )
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## <:msrpwhite:1552141993768132668> Staff Application\n" +
            "Welcome to the Missouri State Roleplay Staff Application! Before applying, please make sure you meet all of our staff requirements."
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## <:msrpwhite:1552141993768132668> Ban Appeal\n" +
            "If you have been banned from Missouri State Roleplay and believe your ban should be reviewed, you may submit a ban appeal below. Please provide accurate and honest information."
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                "staff_application_start"
              )
              .setLabel("Staff Application")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(
                "ban_appeal_start"
              )
              .setLabel("Ban Appeal")
              .setStyle(ButtonStyle.Secondary)
          )
        )
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(
              "attachment://banner.png"
            )
          )
        );

    await channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      files: [
        {
          attachment: path.join(
            __dirname,
            "apps.png"
          ),
          name: "apps.png"
        },
        {
          attachment: path.join(
            __dirname,
            "banner.png"
          ),
          name: "banner.png"
        }
      ]
    });

    console.log(
      "Application Center Components V2 panel created."
    );
  } catch (error) {
    console.error(
      "Application Center error:",
      error
    );
  }
}

// ============================================================
// STAFF APPLICATION ELIGIBILITY
// ============================================================

async function startStaffApplication(
  interaction
) {
  const member = interaction.member;

  if (!member) {
    await interaction.reply({
      content:
        "I couldn't verify your server membership.",
      ephemeral: true
    });
    return;
  }

  if (isStaff(member)) {
    await interaction.reply({
      content:
        "You cannot submit a staff application because you are already a member of the staff team.",
      ephemeral: true
    });
    return;
  }

  if (
    isBlacklisted(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "You cannot submit a staff application because you are staff blacklisted.",
      ephemeral: true
    });
    return;
  }

  if (
    hasPendingApplication(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "You already have an active staff application.",
      ephemeral: true
    });
    return;
  }

  if (
    wasRecentlyDenied(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "Your previous staff application was denied. You must wait 3 days before submitting another staff application.",
      ephemeral: true
    });
    return;
  }

  const embed =
    new EmbedBuilder()
      .setColor(COLORS.PENDING)
      .setTitle(
        "Staff Application | Eligibility"
      )
      .setDescription(
        "Before starting your application, please make sure you meet all of the following requirements."
      )
      .addFields({
        name: "Requirements",
        value:
          "• You must provide accurate and honest information.\n" +
          "• You must be at least 13 years old.\n" +
          "• You must have no more than 5 moderations on your account.\n" +
          "• Safe Chat must be disabled on your Roblox account.\n" +
          "• You must use a computer to complete this application.\n" +
          "• Strong spelling, punctuation, and grammar skills are required.\n" +
          "• Your Roblox age group must be at minimum 13–15+.\n" +
          "• You must be able to run both Discord and Roblox at the same time."
      });

  await interaction.reply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            "staff_application_confirm"
          )
          .setLabel("Confirm (10)")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId(
            "staff_application_cancel"
          )
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
      )
    ],
    ephemeral: true
  });

  let seconds = 10;

  const timer = setInterval(
    async () => {
      seconds--;

      if (seconds <= 0) {
        clearInterval(timer);
        countdowns.delete(
          interaction.user.id
        );

        try {
          await interaction.editReply({
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "staff_application_confirm"
                  )
                  .setLabel("Confirm")
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "staff_application_cancel"
                  )
                  .setLabel("Cancel")
                  .setStyle(
                    ButtonStyle.Danger
                  )
              )
            ]
          });
        } catch {}

        return;
      }

      try {
        await interaction.editReply({
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "staff_application_confirm"
                )
                .setLabel(
                  `Confirm (${seconds})`
                )
                .setStyle(
                  ButtonStyle.Success
                )
                .setDisabled(true),

              new ButtonBuilder()
                .setCustomId(
                  "staff_application_cancel"
                )
                .setLabel("Cancel")
                .setStyle(
                  ButtonStyle.Danger
                )
            )
          ]
        });
      } catch {
        clearInterval(timer);
        countdowns.delete(
          interaction.user.id
        );
      }
    },
    1000
  );

  countdowns.set(
    interaction.user.id,
    timer
  );
}

// ============================================================
// START STAFF APPLICATION
// ============================================================

async function beginStaffApplication(
  interaction
) {
  const timer =
    countdowns.get(
      interaction.user.id
    );

  if (timer) {
    clearInterval(timer);
    countdowns.delete(
      interaction.user.id
    );
  }

  try {
    const dm =
      await interaction.user.createDM();

    activeApplications.set(
      interaction.user.id,
      {
        answers: [],
        questionIndex: 0
      }
    );

    await interaction.update({
      content:
        "Your staff application has been started. Please check your DMs to continue your application.",
      embeds: [],
      components: []
    });

    // Starts directly with question one.
    await dm.send(
      STAFF_QUESTIONS[0]
    );
  } catch (error) {
    console.error(
      "DM error:",
      error
    );

    try {
      await interaction.update({
        content:
          "I couldn't send you a DM. Please enable Direct Messages from this server and try again.",
        embeds: [],
        components: []
      });
    } catch {}
  }
}

// ============================================================
// NEXT QUESTION
// ============================================================

async function askNextQuestion(userId) {
  const session =
    activeApplications.get(userId);

  if (!session) {
    return;
  }

  const question =
    STAFF_QUESTIONS[
      session.questionIndex
    ];

  if (!question) {
    await finishStaffApplication(
      userId
    );
    return;
  }

  const user =
    await clientRef.users.fetch(
      userId
    );

  await user.send(question);
}

// ============================================================
// FINISH STAFF APPLICATION
// ============================================================

async function finishStaffApplication(
  userId
) {
  const session =
    activeApplications.get(userId);

  if (!session) {
    return;
  }

  const user =
    await clientRef.users.fetch(
      userId
    );

  const id =
    createID("MSRP");

  const answers = {};

  STAFF_QUESTIONS.forEach(
    (question, index) => {
      answers[question] =
        session.answers[index] ||
        "No answer provided.";
    }
  );

  const application = {
    id,
    type: "staff",
    userId,
    username: user.tag,
    createdAt:
      new Date().toISOString(),
    status: "Pending",
    answers
  };

  const applications =
    load(APPLICATIONS_FILE, []);

  applications.push(application);

  save(
    APPLICATIONS_FILE,
    applications
  );

  activeApplications.delete(userId);

  const channel =
    await clientRef.channels.fetch(
      APPLICATIONS_CHANNEL_ID
    );

  const embed =
    new EmbedBuilder()
      .setColor(COLORS.PENDING)
      .setTitle(
        "New Staff Application"
      )
      .setDescription(
        `**Application ID:** ${id}\n` +
        `**Applicant:** <@${userId}>\n` +
        `**Status:** Pending`
      )
      .setThumbnail(
        user.displayAvatarURL()
      )
      .setTimestamp();

  for (
    let i = 0;
    i < STAFF_QUESTIONS.length;
    i++
  ) {
    let answer =
      answers[STAFF_QUESTIONS[i]];

    if (answer.length > 1024) {
      answer =
        answer.substring(0, 1021) +
        "...";
    }

    embed.addFields({
      name: STAFF_QUESTIONS[i],
      value: answer
    });
  }

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `app_approve_${id}`
        )
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `app_deny_${id}`
        )
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          `app_blacklist_${id}`
        )
        .setLabel("Blacklist")
        .setStyle(ButtonStyle.Secondary)
    );

  await channel.send({
    content:
      `<@&${APPLICATION_READER_ROLE_ID}>`,
    embeds: [embed],
    components: [row]
  });

  try {
    await user.send(
      "Thank you for submitting your application to join the Missouri State Roleplay staff team. Our team will carefully review your responses, and you can expect to hear back from us soon."
    );
  } catch {}
}

// ============================================================
// BAN APPEAL POP-UP
// ============================================================

async function openBanAppeal(
  interaction
) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "ban_appeal_modal"
      )
      .setTitle(
        "Missouri State Roleplay | Ban Appeal"
      );

  const username =
    new TextInputBuilder()
      .setCustomId(
        "ban_username"
      )
      .setLabel(
        "Roblox Username"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true);

  const whyBanned =
    new TextInputBuilder()
      .setCustomId(
        "ban_reason"
      )
      .setLabel(
        "Why were you banned?"
      )
      .setStyle(
        TextInputStyle.Paragraph
      )
      .setRequired(true);

  const whyAppeal =
    new TextInputBuilder()
      .setCustomId(
        "ban_appeal_reason"
      )
      .setLabel(
        "Why should your ban be appealed?"
      )
      .setStyle(
        TextInputStyle.Paragraph
      )
      .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      username
    ),
    new ActionRowBuilder().addComponents(
      whyBanned
    ),
    new ActionRowBuilder().addComponents(
      whyAppeal
    )
  );

  await interaction.showModal(modal);
}

// ============================================================
// SUBMIT BAN APPEAL
// ============================================================

async function submitBanAppeal(
  interaction
) {
  const username =
    interaction.fields.getTextInputValue(
      "ban_username"
    );

  const reason =
    interaction.fields.getTextInputValue(
      "ban_reason"
    );

  const appealReason =
    interaction.fields.getTextInputValue(
      "ban_appeal_reason"
    );

  const id =
    createID("APPEAL");

  const appeal = {
    id,
    type: "ban_appeal",
    userId:
      interaction.user.id,
    username:
      interaction.user.tag,
    createdAt:
      new Date().toISOString(),
    status: "Pending",
    answers: {
      "Roblox Username":
        username,
      "Why were you banned?":
        reason,
      "Why should your ban be appealed?":
        appealReason
    }
  };

  const applications =
    load(APPLICATIONS_FILE, []);

  applications.push(appeal);

  save(
    APPLICATIONS_FILE,
    applications
  );

  const channel =
    await clientRef.channels.fetch(
      BAN_APPEALS_CHANNEL_ID
    );

  const embed =
    new EmbedBuilder()
      .setColor(COLORS.PENDING)
      .setTitle(
        "New Ban Appeal"
      )
      .setDescription(
        `**Appeal ID:** ${id}\n` +
        `**Applicant:** <@${interaction.user.id}>\n` +
        `**Status:** Pending`
      )
      .setThumbnail(
        interaction.user.displayAvatarURL()
      )
      .addFields(
        {
          name: "Roblox Username",
          value: username
        },
        {
          name: "Why were you banned?",
          value: reason
        },
        {
          name:
            "Why should your ban be appealed?",
          value: appealReason
        }
      )
      .setTimestamp();

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `appeal_approve_${id}`
        )
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `appeal_deny_${id}`
        )
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({
    content:
      `<@&${BAN_APPEAL_READER_ROLE_ID}>`,
    embeds: [embed],
    components: [row]
  });

  await interaction.reply({
    content:
      "Your ban appeal has been submitted successfully.",
    ephemeral: true
  });
}

// ============================================================
// UPDATE STAFF APPLICATION COLOR
// ============================================================

async function updateStaffEmbed(
  interaction,
  status,
  color,
  label
) {
  const oldEmbed =
    interaction.message.embeds[0];

  const embed =
    EmbedBuilder
      .from(oldEmbed)
      .setColor(color)
      .setTimestamp();

  let description =
    oldEmbed.description || "";

  description =
    description.replace(
      /\*\*Status:\*\* [^\n]*/,
      `**Status:** ${status}`
    );

  description +=
    `\n**${label}:** <@${interaction.user.id}>`;

  embed.setDescription(description);

  await interaction.message.edit({
    embeds: [embed],
    components: []
  });
}

// ============================================================
// STAFF APPLICATION DECISION
// ============================================================

async function handleStaffDecision(
  interaction
) {
  const parts =
    interaction.customId.split("_");

  const action = parts[1];
  const id =
    parts.slice(2).join("_");

  const applications =
    load(APPLICATIONS_FILE, []);

  const application =
    applications.find(
      x =>
        x.type === "staff" &&
        x.id === id
    );

  if (!application) {
    await interaction.reply({
      content:
        "That application could not be found.",
      ephemeral: true
    });
    return;
  }

  if (
    !isHR(interaction.member)
  ) {
    await interaction.reply({
      content:
        "You don't have permission to review applications. HR+ only.",
      ephemeral: true
    });
    return;
  }

  if (
    action === "blacklist" &&
    !isSeniorHR(
      interaction.member
    )
  ) {
    await interaction.reply({
      content:
        "You don't have permission to blacklist applicants. Senior HR+ only.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  try {
    // APPROVE
    if (action === "approve") {
      const member =
        await interaction.guild.members.fetch(
          application.userId
        );

      await member.roles.add(
        AWAITING_TRAINING_ROLE_ID
      );

      application.status =
        "Approved";

      application.reviewerId =
        interaction.user.id;

      application.reviewedAt =
        new Date().toISOString();

      save(
        APPLICATIONS_FILE,
        applications
      );

      await updateStaffEmbed(
        interaction,
        "Approved",
        COLORS.APPROVED,
        "Approved By"
      );

      try {
        await member.send(
          "Congratulations! Your Missouri State Roleplay staff application has been approved.\n\nYou have been given the **Awaiting Training** role. Please wait for further instructions regarding your training."
        );
      } catch {}

      await interaction.editReply(
        "Application approved. The Awaiting Training role has been given."
      );

      return;
    }

    // DENY
    if (action === "deny") {
      application.status =
        "Denied";

      application.reviewerId =
        interaction.user.id;

      application.reviewedAt =
        new Date().toISOString();

      save(
        APPLICATIONS_FILE,
        applications
      );

      await updateStaffEmbed(
        interaction,
        "Denied",
        COLORS.DENIED,
        "Denied By"
      );

      try {
        const user =
          await clientRef.users.fetch(
            application.userId
          );

        await user.send(
          "Thank you for applying to the Missouri State Roleplay staff team. Unfortunately, your application has been denied. You must wait 3 days before submitting another application."
        );
      } catch {}

      await interaction.editReply(
        "Application denied. The applicant must wait 3 days before applying again."
      );

      return;
    }

    // BLACKLIST
    if (action === "blacklist") {
      const member =
        await interaction.guild.members.fetch(
          application.userId
        );

      await member.roles.add(
        STAFF_BLACKLIST_ROLE_ID
      );

      const blacklist =
        load(
          BLACKLIST_FILE,
          []
        );

      if (
        !blacklist.some(
          x =>
            x.userId ===
            application.userId
        )
      ) {
        blacklist.push({
          userId:
            application.userId,
          applicationId:
            application.id,
          blacklistedBy:
            interaction.user.id,
          blacklistedAt:
            new Date().toISOString()
        });

        save(
          BLACKLIST_FILE,
          blacklist
        );
      }

      application.status =
        "Blacklisted";

      application.reviewerId =
        interaction.user.id;

      application.reviewedAt =
        new Date().toISOString();

      save(
        APPLICATIONS_FILE,
        applications
      );

      await updateStaffEmbed(
        interaction,
        "Blacklisted",
        COLORS.BLACKLISTED,
        "Blacklisted By"
      );

      try {
        await member.send(
          "Your Missouri State Roleplay staff application has been blacklisted. You are no longer eligible to submit staff applications."
        );
      } catch {}

      await interaction.editReply(
        "Applicant has been blacklisted and given the Staff Blacklist role."
      );
    }
  } catch (error) {
    console.error(
      "Application decision error:",
      error
    );

    await interaction.editReply(
      "I couldn't complete that action. Check the bot's permissions and role hierarchy."
    );
  }
}

// ============================================================
// BAN APPEAL DECISION
// ============================================================

async function handleAppealDecision(
  interaction
) {
  const parts =
    interaction.customId.split("_");

  const action = parts[1];
  const id =
    parts.slice(2).join("_");

  const applications =
    load(APPLICATIONS_FILE, []);

  const appeal =
    applications.find(
      x =>
        x.type === "ban_appeal" &&
        x.id === id
    );

  if (!appeal) {
    await interaction.reply({
      content:
        "That ban appeal could not be found.",
      ephemeral: true
    });
    return;
  }

  if (
    !isHR(interaction.member)
  ) {
    await interaction.reply({
      content:
        "You don't have permission to review ban appeals. HR+ only.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  const approved =
    action === "approve";

  appeal.status =
    approved
      ? "Approved"
      : "Denied";

  appeal.reviewerId =
    interaction.user.id;

  appeal.reviewedAt =
    new Date().toISOString();

  save(
    APPLICATIONS_FILE,
    applications
  );

  const embed =
    EmbedBuilder
      .from(
        interaction.message.embeds[0]
      )
      .setColor(
        approved
          ? COLORS.APPROVED
          : COLORS.DENIED
      )
      .setDescription(
        `**Appeal ID:** ${appeal.id}\n` +
        `**Applicant:** <@${appeal.userId}>\n` +
        `**Status:** ${appeal.status}\n` +
        `**Reviewed By:** <@${interaction.user.id}>`
      )
      .setTimestamp();

  await interaction.message.edit({
    embeds: [embed],
    components: []
  });

  try {
    const user =
      await clientRef.users.fetch(
        appeal.userId
      );

    await user.send(
      approved
        ? "Your Missouri State Roleplay ban appeal has been approved."
        : "Your Missouri State Roleplay ban appeal has been denied."
    );
  } catch {}

  await interaction.editReply(
    approved
      ? "Ban appeal approved."
      : "Ban appeal denied."
  );
}

// ============================================================
// MAIN EVENT SETUP
// ============================================================

export function setupApplications(
  client
) {
  clientRef = client;

  // ----------------------------------------------------------
  // BUTTONS + MODALS
  // ----------------------------------------------------------

  client.on(
    Events.InteractionCreate,
    async interaction => {
      try {
        // BUTTONS
        if (interaction.isButton()) {
          if (
            interaction.customId ===
            "staff_application_start"
          ) {
            await startStaffApplication(
              interaction
            );
            return;
          }

          if (
            interaction.customId ===
            "staff_application_confirm"
          ) {
            await beginStaffApplication(
              interaction
            );
            return;
          }

          if (
            interaction.customId ===
            "staff_application_cancel"
          ) {
            const timer =
              countdowns.get(
                interaction.user.id
              );

            if (timer) {
              clearInterval(timer);
              countdowns.delete(
                interaction.user.id
              );
            }

            await interaction.update({
              content:
                "Your staff application has been cancelled.",
              embeds: [],
              components: []
            });

            return;
          }

          if (
            interaction.customId ===
            "ban_appeal_start"
          ) {
            await openBanAppeal(
              interaction
            );
            return;
          }

          if (
            interaction.customId.startsWith(
              "app_approve_"
            ) ||
            interaction.customId.startsWith(
              "app_deny_"
            ) ||
            interaction.customId.startsWith(
              "app_blacklist_"
            )
          ) {
            await handleStaffDecision(
              interaction
            );
            return;
          }

          if (
            interaction.customId.startsWith(
              "appeal_approve_"
            ) ||
            interaction.customId.startsWith(
              "appeal_deny_"
            )
          ) {
            await handleAppealDecision(
              interaction
            );
            return;
          }
        }

        // MODAL
        if (
          interaction.isModalSubmit() &&
          interaction.customId ===
            "ban_appeal_modal"
        ) {
          await submitBanAppeal(
            interaction
          );
        }
      } catch (error) {
        console.error(
          "Application interaction error:",
          error
        );

        if (
          !interaction.replied &&
          !interaction.deferred
        ) {
          try {
            await interaction.reply({
              content:
                "Something went wrong while processing that action.",
              ephemeral: true
            });
          } catch {}
        }
      }
    }
  );

  // ----------------------------------------------------------
  // STAFF APPLICATION DMs
  // ----------------------------------------------------------

  client.on(
    Events.MessageCreate,
    async message => {
      if (
        !message.channel.isDMBased() ||
        message.author.bot
      ) {
        return;
      }

      const session =
        activeApplications.get(
          message.author.id
        );

      if (!session) {
        return;
      }

      const answer =
        message.content.trim();

      if (
        answer.toLowerCase() ===
        "cancel"
      ) {
        activeApplications.delete(
          message.author.id
        );

        await message.channel.send(
          "Your staff application has been cancelled."
        );

        return;
      }

      session.answers.push(answer);
      session.questionIndex++;

      if (
        session.questionIndex >=
        STAFF_QUESTIONS.length
      ) {
        await message.channel.send(
          "Your application has been completed and submitted. Thank you!"
        );

        await finishStaffApplication(
          message.author.id
        );

        return;
      }

      await askNextQuestion(
        message.author.id
      );
    }
  );

  // ----------------------------------------------------------
  // APPLICATION CENTER
  // ----------------------------------------------------------

  client.once(
    Events.ClientReady,
    async () => {
      await ensureApplicationCenter();
    }
  );
}