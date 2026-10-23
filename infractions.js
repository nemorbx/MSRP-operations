const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");

// ==============================
// CONFIGURATION
// ==============================

// ==============================
// SLASH COMMANDS
// ==============================

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if MSRP Automations is online."),

  new SlashCommandBuilder()
    .setName("infract")
    .setDescription("Issue a staff infraction.")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("The staff member receiving the infraction.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Select the infraction type.")
        .setRequired(true)
        .addChoices(
          { name: "Notice", value: "Notice" },
          { name: "Warning", value: "Warning" },
          { name: "Strike", value: "Strike" },
          { name: "Zero Tolerance Policy", value: "Zero Tolerance Policy" },
          { name: "Staff Blacklisted", value: "Staff Blacklisted" },
          { name: "Demotion", value: "Demotion" },
          { name: "Termination", value: "Termination" },
          { name: "Under Investigation", value: "Under Investigation" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("appeal_status")
        .setDescription("Can this infraction be appealed?")
        .setRequired(true)
        .addChoices(
          { name: "Yes — Appealable", value: "Appealable" },
          { name: "No — Unappealable", value: "Unappealable" }
        )
    ),
].map((command) => command.toJSON());


function setup(client) {

// MSRP
const INFRACTION_CHANNEL_ID = "1529167176119091341";

// Senior HR = Management+
const SENIOR_HR_ROLE_ID = "1551704056991318191";

// HR = Internal Affairs Supervisor+
const HR_ROLE_ID = "1551704115350999143";

// Staff Team role — assigned to staff after training. Trial Moderators do not receive it until training is passed.
const STAFF_TEAM_ROLE_ID = "1528242210871447672";

// Staff rank hierarchy used for automatic demotions.
const RANKS = [
  { name: "Trial Mod", id: "1527383332093038755", teamId: "1527381803617222676" },
  { name: "Junior Mod", id: "1528449495136731237", teamId: "1527381803617222676" },
  { name: "Senior Mod", id: "1528449396860260503", teamId: "1527381803617222676" },
  { name: "Head Mod", id: "1528449441827258531", teamId: "1527381803617222676" },
  { name: "Trial Admin", id: "1528449273644056666", teamId: "1527381747791040522" },
  { name: "Junior Admin", id: "1528449153192169503", teamId: "1527381747791040522" },
  { name: "Senior Admin", id: "1528435425373454366", teamId: "1527381747791040522" },
  { name: "Head Admin", id: "1528449008668774541", teamId: "1527381747791040522" },
  { name: "Trial Internal Affairs", id: "1528426957962743989", teamId: "1527381477975789668" },
  { name: "Junior Internal Affairs", id: "1528453585128390698", teamId: "1527381477975789668" },
  { name: "Senior Internal Affairs", id: "1528453258568536314", teamId: "1527381477975789668" },
  { name: "Head Internal Affairs", id: "1551797151229808671", teamId: "1527381477975789668" },
  { name: "Internal Affairs Supervisor", id: "1528426796670914671", teamId: "1527381477975789668" },
  { name: "Internal Affairs Director", id: "1528426646259105802", teamId: "1527381477975789668" },
  { name: "Trial Management", id: "1528425767678247021", teamId: "1528426569012609106" },
  { name: "Junior Management", id: "1528425691723595867", teamId: "1528426569012609106" },
  { name: "Senior Management", id: "1527851704605868254", teamId: "1528426569012609106" },
  { name: "Head Management", id: "1528425534600646860", teamId: "1528426569012609106" },
];

// Progressive infraction roles, ordered from first notice through blacklist.
const INFRACTION_STAGES = [
  { name: "Notice 1", id: "1552174660311982180", category: "Notice" },
  { name: "Notice 2", id: "1552174704352034867", category: "Notice" },
  { name: "Warning 1", id: "1552174554850267147", category: "Warning" },
  { name: "Warning 2", id: "1552174629768929361", category: "Warning" },
  { name: "Strike 1", id: "1552174735893209128", category: "Strike" },
  { name: "Strike 2", id: "1552174776091680858", category: "Strike" },
  { name: "Zero Tolerance Policy", id: "1552174814972870828", category: "Zero Tolerance Policy" },
  { name: "Under Investigation", id: "1563118621159465003", category: "Under Investigation" },
  { name: "Staff Blacklisted", id: "1529726037032833096", category: "Staff Blacklisted" },
];

// Local banner
const BANNER_PATH = path.join(__dirname, "banner.png");
const BANNER_NAME = "banner.png";

// Infraction storage
const DATA_FILE = path.join(__dirname, "infractions.json");

// ==============================
// STORAGE
// ==============================

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

function loadInfractions() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveInfractions(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==============================
// ID GENERATORS
// ==============================

function randomSixDigits() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function randomFourDigits() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateCaseId(existing) {
  let id;

  do {
    id = `MSRP-${randomSixDigits()}`;
  } while (existing.some((x) => x.caseId === id));

  return id;
}

function generateProofId(existing) {
  let id;

  do {
    id = `Proof ID-${randomFourDigits()}`;
  } while (existing.some((x) => x.proofId === id));

  return id;
}

// ==============================
// ROLE CHECKS
// ==============================

// Management+ = Senior HR
function isSeniorHR(member) {
  return member.roles.cache.has(SENIOR_HR_ROLE_ID);
}

// Internal Affairs Supervisor+ = HR
function isHR(member) {
  return member.roles.cache.has(HR_ROLE_ID);
}

// High Rank and Senior High Rank may issue infractions.
function hasInfractionAuthority(member) {
  return isSeniorHR(member) || isHR(member);
}

// Permission check uses MSRP staff-rank order rather than unrelated Discord roles.
function canIssueInfraction(issuer, target) {
  if (isSeniorHR(issuer)) return true;
  if (!isHR(issuer)) return false;

  const issuerRankIndexes = RANKS
    .map((rank, index) => ({ rank, index }))
    .filter(({ rank }) => issuer.roles.cache.has(rank.id))
    .map(({ index }) => index);
  const targetRankIndexes = RANKS
    .map((rank, index) => ({ rank, index }))
    .filter(({ rank }) => target.roles.cache.has(rank.id))
    .map(({ index }) => index);

  // Only staff members with a recognized rank can be actioned by High Rank.
  if (!issuerRankIndexes.length || !targetRankIndexes.length) return false;
  const issuerHighestRank = Math.max(...issuerRankIndexes);
  const targetHighestRank = Math.max(...targetRankIndexes);

  // A higher rank index is more senior in the configured RANKS list.
  return targetHighestRank < issuerHighestRank;
}

// ==============================
// INTERACTIONS
// ==============================

client.on("interactionCreate", async (interaction) => {
  try {
    // ==========================================
    // /PING
    // ==========================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "ping"
    ) {
      await interaction.reply({
        content: "MSRP Automations is online.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // ==========================================
    // /INFRACT
    // ==========================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "infract"
    ) {
      const issuer = await interaction.guild.members.fetch(
        interaction.user.id
      );

      const targetUser = interaction.options.getUser("member");

      const target = await interaction.guild.members.fetch(
        targetUser.id
      );

      const infractionType =
        interaction.options.getString("type");
      const appealStatus = interaction.options.getString("appeal_status");

      // ------------------------------------------
      // HR CHECK
      // ------------------------------------------

      if (!hasInfractionAuthority(issuer)) {
        await interaction.reply({
          content:
            "You don't have permission to use this command. Internal Affairs+ only.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // ------------------------------------------
      // RANK CHECK
      // ------------------------------------------

      if (!canIssueInfraction(issuer, target)) {
        await interaction.reply({
          content:
            "You don't have permission to infract this member. You must be above their rank. You cannot infract someone who is the same rank or higher than you.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // ------------------------------------------
      // INFRACTION MODAL
      // ------------------------------------------

      const modal = new ModalBuilder()
        .setCustomId(`infraction_modal_${interaction.id}`)
        .setTitle("Staff Infraction");

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          "Enter the reason for this infraction."
        )
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
      );

      // ------------------------------------------
      // TEMPORARY DATA
      // ------------------------------------------

      if (!client.pendingInfractions) {
        client.pendingInfractions = new Map();
      }

      client.pendingInfractions.set(interaction.id, {
        issuerId: issuer.id,
        targetId: target.id,
        infractionType,
        appealStatus,
        guildId: interaction.guild.id,
      });

      await interaction.showModal(modal);

      return;
    }

    // ==========================================
    // MODAL SUBMISSION
    // ==========================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("infraction_modal_")
    ) {
      // Respond immediately so Discord does not expire
      // the interaction.
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const originalInteractionId =
        interaction.customId.replace(
          "infraction_modal_",
          ""
        );

      const pending =
        client.pendingInfractions?.get(
          originalInteractionId
        );

      if (!pending) {
        await interaction.editReply({
          content:
            "This infraction session expired. Please run `/infract` again.",
        });

        return;
      }

      client.pendingInfractions.delete(
        originalInteractionId
      );

      const reason =
        interaction.fields.getTextInputValue("reason");

      // Resolve the target again from the saved interaction data.
      // Modal submissions do not have the original /infract target in scope.
      const guild = await client.guilds.fetch(pending.guildId);
      const target = await guild.members.fetch(pending.targetId);

      // ==========================================
      // APPEAL + DEMOTION ROLE DROPDOWNS
      // ==========================================

      const appealMenu =
        new StringSelectMenuBuilder()
          .setCustomId(`appeal_status_${interaction.id}`)
          .setPlaceholder("Select appeal status")
          .addOptions(
            {
              label: "Appealable",
              description: "The affected staff member may appeal.",
              value: "Appealable",
            },
            {
              label: "Unappealable",
              description: "The affected staff member may not appeal.",
              value: "Unappealable",
            }
          );

      const components = [
        new ActionRowBuilder().addComponents(appealMenu),
      ];

      // If Demotion was selected as the /infract type, let the issuer
      // choose the exact lower staff rank to assign.
      if (pending.infractionType === "Demotion") {
        const currentRank = RANKS
          .map(rank => ({ rank, role: interaction.guild.roles.cache.get(rank.id) }))
          .filter(x => x.role && target.roles.cache.has(x.role.id))
          .sort((a, b) => b.role.position - a.role.position)[0];

        if (!currentRank) {
          await interaction.editReply({
            content: "That member does not have a recognized staff rank, so a demotion cannot be selected.",
            components: [],
          });
          return;
        }

        const currentIndex = RANKS.findIndex(rank => rank.id === currentRank.rank.id);
        const lowerRanks = RANKS
          .slice(0, currentIndex)
          .map(rank => ({ rank, role: interaction.guild.roles.cache.get(rank.id) }))
          .filter(x => x.role);

        if (!lowerRanks.length) {
          await interaction.editReply({
            content: "That staff member is already at the lowest staff rank and cannot be demoted.",
            components: [],
          });
          return;
        }

        const demotionMenu = new StringSelectMenuBuilder()
          .setCustomId(`infraction_demotion_role_${interaction.id}`)
          .setPlaceholder("Select the new staff rank")
          .addOptions(
            lowerRanks.map(({ rank }) => ({
              label: rank.name,
              description: `Demote to ${rank.name}.`,
              value: rank.id,
            }))
          );

        components.unshift(
          new ActionRowBuilder().addComponents(demotionMenu)
        );
      }

      if (!client.pendingAppeals) {
        client.pendingAppeals = new Map();
      }

      client.pendingAppeals.set(interaction.id, {
        issuerId: pending.issuerId,
        targetId: pending.targetId,
        infractionType: pending.infractionType,
        guildId: pending.guildId,
        reason,
        punishment: pending.infractionType,
        demotionRoleId: null,
      });

      await interaction.editReply({
        content:
          pending.infractionType === "Demotion"
            ? "Select the staff rank to demote this member to, then select the appeal status:"
            : "Select the appeal status for this infraction:",
        components,
      });

      return;
    }

    // ==========================================
    // DEMOTION ROLE SELECTED
    // ==========================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("infraction_demotion_role_")
    ) {
      await interaction.deferUpdate();

      const originalInteractionId = interaction.customId.replace(
        "infraction_demotion_role_",
        ""
      );
      const pending = client.pendingAppeals?.get(originalInteractionId);

      if (!pending) return;

      const selectedRoleId = interaction.values[0];
      const target = await interaction.guild.members
        .fetch(pending.targetId)
        .catch(() => null);

      if (!target) return;

      const currentRank = RANKS
        .map(rank => ({ rank, role: interaction.guild.roles.cache.get(rank.id) }))
        .filter(x => x.role && target.roles.cache.has(x.role.id))
        .sort((a, b) => b.role.position - a.role.position)[0];

      const currentIndex = currentRank
        ? RANKS.findIndex(rank => rank.id === currentRank.rank.id)
        : -1;
      const selectedIndex = RANKS.findIndex(rank => rank.id === selectedRoleId);

      if (
        currentIndex < 0 ||
        selectedIndex < 0 ||
        selectedIndex >= currentIndex
      ) {
        await interaction.followUp({
          content:
            "You can only select a staff rank below the member's current rank.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      pending.demotionRoleId = selectedRoleId;

      await interaction.followUp({
        content: `Demotion target selected: <@&${selectedRoleId}>.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});

      return;
    }

    // APPEAL STATUS
    // ==========================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(
        "appeal_status_"
      )
    ) {
      // Respond immediately.
      await interaction.deferUpdate();

      const originalInteractionId =
        interaction.customId.replace(
          "appeal_status_",
          ""
        );

      const pending =
        client.pendingAppeals?.get(
          originalInteractionId
        );

      if (!pending) {
        await interaction.editReply({
          content:
            "This infraction session expired. Please run `/infract` again.",
          components: [],
        });

        return;
      }

      const appealStatus = pending.appealStatus;
      let punishment = pending.punishment;

      if (punishment === "Demotion" && !pending.demotionRoleId) {
        await interaction.followUp({
          content:
            "Select the staff rank to demote the member to before selecting the appeal status.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      client.pendingAppeals.delete(originalInteractionId);

      const guild =
        await client.guilds.fetch(
          pending.guildId
        );

      const issuer =
        await guild.members.fetch(
          pending.issuerId
        );

      const target =
        await guild.members.fetch(
          pending.targetId
        );

      // ==========================================
      // AUTOMATIC PUNISHMENT
      // ==========================================

      let punishmentResult = punishment;

      // Existing stage determines progression; selected type can skip to a higher stage.
      const currentStageIndex = INFRACTION_STAGES.findIndex(stage => target.roles.cache.has(stage.id));
      const requestedStageIndex = {
        "Notice": 0,
        "Warning": 2,
        "Strike": 4,
        "Zero Tolerance Policy": 6,
        "Staff Blacklisted": 8,
      }[punishment];
      let stageToApply = null;
      if (requestedStageIndex !== undefined) {
        const nextIndex = requestedStageIndex === 8 ? 8 : (currentStageIndex >= 6 ? 7 : Math.max(requestedStageIndex, currentStageIndex + 1));
        stageToApply = INFRACTION_STAGES[Math.min(nextIndex, 8)];
        punishment = stageToApply.category;
      }

      if (stageToApply && !["Under Investigation", "Staff Blacklisted"].includes(stageToApply.category)) {
        const role = guild.roles.cache.get(stageToApply.id);
        const botMember = guild.members.me;
        if (!role || !botMember || role.position >= botMember.roles.highest.position) {
          throw new Error("The bot role must be above the infraction stage role: " + stageToApply.name);
        }
        const previousStageRoles = INFRACTION_STAGES
          .filter(stage => !["Under Investigation", "Staff Blacklisted"].includes(stage.category) && target.roles.cache.has(stage.id))
          .map(stage => stage.id);
        if (previousStageRoles.length) await target.roles.remove(previousStageRoles, "Advance progressive infraction stage");
        await target.roles.add(role, "Apply progressive infraction stage");
        punishmentResult = stageToApply.name;
      }

      if (punishment === "Under Investigation") {
        const botMember = guild.members.me;
        if (!botMember) throw new Error("Bot member could not be resolved.");
        let investigationRole = guild.roles.cache.find(role => role.name === "Under Investigation");
        if (!investigationRole) {
          investigationRole = await guild.roles.create({
            name: "Under Investigation",
            color: 0x808080,
            reason: "Created automatically for staff investigation infractions",
          });
        }
        if (investigationRole.position >= botMember.roles.highest.position) {
          await interaction.editReply({
            content: "I cannot assign Under Investigation because the bot's highest role must be above that role. Move the bot role higher and try again.",
            components: [],
          });
          return;
        }

        const savedStaffRoles = [
          ...RANKS.filter(rank => target.roles.cache.has(rank.id)).map(rank => rank.id),
          ...[...new Set(RANKS.map(rank => rank.teamId))].filter(roleId => target.roles.cache.has(roleId)),
          ...(target.roles.cache.has(STAFF_TEAM_ROLE_ID) ? [STAFF_TEAM_ROLE_ID] : []),
        ];
        for (const roleId of savedStaffRoles) {
          await target.roles.remove(roleId, "Staff placed under investigation").catch(error => console.error("[Infractions] Could not remove staff role:", roleId, error));
        }
        await target.roles.add(investigationRole, "Staff placed under investigation");
        pending.savedStaffRoles = savedStaffRoles;
        punishmentResult = "Under Investigation — staff rank/team roles removed and replaced with Under Investigation";
      } else if (punishment === "Staff Blacklisted") {
        const blacklistRole = guild.roles.cache.get("1529726037032833096");
        const botMember = guild.members.me;
        if (!blacklistRole || !botMember || blacklistRole.position >= botMember.roles.highest.position) {
          throw new Error("Staff Blacklisted role is missing or above the bot role.");
        }
        const staffRoleIds = [...new Set([
          ...RANKS.map(rank => rank.id),
          ...RANKS.map(rank => rank.teamId),
          STAFF_TEAM_ROLE_ID,
          ...INFRACTION_STAGES.filter(stage => stage.id !== blacklistRole.id).map(stage => stage.id),
        ])].filter(id => target.roles.cache.has(id));
        if (staffRoleIds.length) await target.roles.remove(staffRoleIds, "Staff blacklisted");
        await target.roles.add(blacklistRole, "Staff blacklisted");
        punishmentResult = "Staff Blacklisted — staff rank/team and infraction stage roles removed";
      } else if (punishment === "Demotion" || punishment === "Termination") {
        const currentRank = RANKS
          .map(rank => ({ rank, role: guild.roles.cache.get(rank.id) }))
          .filter(x => x.role && target.roles.cache.has(x.role.id))
          .sort((a, b) => b.role.position - a.role.position)[0];

        if (!currentRank) {
          await interaction.editReply({
            content:
              "That member does not have a recognized staff rank, so the automatic punishment could not be applied.",
            components: [],
          });
          return;
        }

        const botMember = guild.members.me;
        if (!botMember) throw new Error("Bot member could not be resolved.");

        if (punishment === "Demotion") {
          const selectedRank = RANKS.find(
            rank => rank.id === pending.demotionRoleId
          );
          const selectedRole = selectedRank
            ? guild.roles.cache.get(selectedRank.id)
            : null;

          if (!selectedRank || !selectedRole) {
            await interaction.editReply({
              content: "The selected demotion rank could not be found.",
              components: [],
            });
            return;
          }

          const currentIndex = RANKS.findIndex(
            rank => rank.id === currentRank.rank.id
          );
          const selectedIndex = RANKS.findIndex(
            rank => rank.id === selectedRank.id
          );

          if (selectedIndex < 0 || selectedIndex >= currentIndex) {
            await interaction.editReply({
              content:
                "The selected demotion rank must be below the member's current rank.",
              components: [],
            });
            return;
          }

          if (selectedRole.position >= botMember.roles.highest.position) {
            await interaction.editReply({
              content:
                "I cannot apply the demotion because my bot role is not high enough in the server hierarchy.",
              components: [],
            });
            return;
          }

          // Remove all recognized staff ranks, then assign the selected rank.
          for (const rank of RANKS) {
            if (target.roles.cache.has(rank.id)) {
              await target.roles.remove(rank.id).catch(() => {});
            }
          }
          await target.roles.add(selectedRole);

          // Keep team role synchronized with the selected rank.
          const teamIds = [...new Set(RANKS.map(rank => rank.teamId))];
          for (const teamId of teamIds) {
            if (
              target.roles.cache.has(teamId) &&
              teamId !== selectedRank.teamId
            ) {
              await target.roles.remove(teamId).catch(() => {});
            }
          }

          const teamRole = guild.roles.cache.get(selectedRank.teamId);
          if (
            teamRole &&
            teamRole.position < botMember.roles.highest.position &&
            !target.roles.cache.has(teamRole.id)
          ) {
            await target.roles.add(teamRole).catch(() => {});
          }

          punishmentResult =
            `Demotion — <@&${currentRank.role.id}> → <@&${selectedRole.id}>`;
        } else {
          // Termination removes all recognized staff rank and team roles.
          for (const rank of RANKS) {
            if (target.roles.cache.has(rank.id)) {
              await target.roles.remove(rank.id).catch(() => {});
            }
          }
          for (const teamId of [...new Set(RANKS.map(rank => rank.teamId))]) {
            if (target.roles.cache.has(teamId)) {
              await target.roles.remove(teamId).catch(() => {});
            }
          }

          // The Staff Team role is granted to trained staff. Termination must remove it too.
          if (target.roles.cache.has(STAFF_TEAM_ROLE_ID)) {
            await target.roles.remove(STAFF_TEAM_ROLE_ID).catch(() => {});
          }

          punishmentResult =
            "Termination — all staff rank/team roles removed";
        }
      }

      const infractionChannel =
        await guild.channels.fetch(
          INFRACTION_CHANNEL_ID
        );

      if (!infractionChannel) {
        await interaction.editReply({
          content:
            "I couldn't find the configured infraction channel.",
          components: [],
        });

        return;
      }

      // ==========================================
      // LOAD RECORDS
      // ==========================================

      const infractions =
        loadInfractions();

      const caseId =
        generateCaseId(infractions);

      const proofId =
        generateProofId(infractions);

      // ==========================================
      // CHECK BANNER
      // ==========================================

      if (!fs.existsSync(BANNER_PATH)) {
        await interaction.editReply({
          content:
            "The infraction banner is missing. Make sure `banner.png` is inside the MSRP Bot folder.",
          components: [],
        });

        return;
      }

      // ==========================================
      // BANNER ATTACHMENT
      // ==========================================

      const bannerAttachment =
        new AttachmentBuilder(
          BANNER_PATH,
          {
            name: BANNER_NAME,
          }
        );

      // ==========================================
      // AVATARS
      // ==========================================

      const botAvatar =
        client.user.displayAvatarURL({
          extension: "png",
          size: 256,
        });

      const issuerAvatar =
        issuer.user.displayAvatarURL({
          extension: "png",
          size: 256,
        });

      // ==========================================
      // COMPONENTS V2 — INFRACTION
      // ==========================================

      const container = new ContainerBuilder();

      // Keep the existing infraction information, but render it as
      // Components V2 instead of a legacy embed.
      // Bot logo in the top-right, matching the Promotions layout.
      const titleSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Staff Infraction\n` +
            `Infraction Issued by **${issuer.user.username}**\n\n` +
            `Our high-ranking team has decided to issue an infraction due to your actions.`
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(botAvatar)
            .setDescription("MSRP Automations bot icon")
        );

      container.addSectionComponents(titleSection);

      // Keep the two legacy inline fields together in V2.
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Staff Member**  <@${target.id}>     **Punishment**  ${punishmentResult}`
        )
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Infraction Type**  ${pending.infractionType}\n` +
          `**Reason**  ${pending.reason}`
        )
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Appeal Status**  ${appealStatus}     **Case ID**  ${caseId}`
        )
      );

      container.addSeparatorComponents(
        new (require("discord.js").SeparatorBuilder)().setSpacing(
          require("discord.js").SeparatorSpacingSize.Small
        )
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${proofId}** • ${new Date().toLocaleString()}`
        )
      );

      // Keep the existing banner as the bottom image.
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(
            `attachment://${BANNER_NAME}`
          )
        )
      );

      // ==========================================
      // SEND INFRACTION
      // ==========================================

      const infractionMessage =
        await infractionChannel.send({
          flags: MessageFlags.IsComponentsV2,
          components: [container],
          files: [bannerAttachment],
          // Infractions should display member/role references without notifying
          // every person who holds a mentioned role.
          allowedMentions: { parse: [] },
        });

      // ==========================================
      // CREATE PROOF THREAD
      // ==========================================

      const proofThread =
        await infractionMessage.startThread({
          name: proofId,
          autoArchiveDuration: 10080,
          reason:
            `Proof thread for ${caseId}`,
        });

      // ==========================================
      // INITIAL PROOF MESSAGE
      // ==========================================

      await proofThread.send(
        `<@${issuer.id}> — no proof was attached to this infraction. Please add any available evidence here.`
      );

      // ==========================================
      // SAVE INFRACTION
      // ==========================================

      infractions.push({
        caseId,
        proofId,

        guildId: pending.guildId,

        infractionChannelId:
          INFRACTION_CHANNEL_ID,

        infractionMessageId:
          infractionMessage.id,

        proofThreadId:
          proofThread.id,

        issuerId:
          issuer.id,

        targetId:
          target.id,

        issuerName:
          issuer.user.username,

        targetName:
          target.user.username,

        infractionType:
          pending.infractionType,

        reason:
          pending.reason,

        punishment:
          punishmentResult,

        savedStaffRoles:
          pending.savedStaffRoles || [],

        investigationCleared:
          false,

        appealStatus,

        createdAt:
          new Date().toISOString(),
      });

      saveInfractions(infractions);

      // ==========================================
      // FINISH
      // ==========================================

      await interaction.editReply({
        content:
          `Infraction ${caseId} created successfully.`,
        components: [],
      });

      console.log(
        `Infraction ${caseId} created successfully.`
      );

      return;
    }

  } catch (error) {
    console.error(
      "Interaction error:",
      error
    );

    try {
      if (
        interaction.isRepliable() &&
        !interaction.deferred &&
        !interaction.replied
      ) {
        await interaction.reply({
          content:
            "Something went wrong while processing this request. Check the bot console for the error.",
          flags: MessageFlags.Ephemeral,
        });
      } else if (
        interaction.isRepliable()
      ) {
        await interaction.editReply({
          content:
            "Something went wrong while processing this request. Check the bot console for the error.",
        });
      }
    } catch (responseError) {
      console.error(
        "Could not send error response:",
        responseError
      );
    }
  }
});

// ==============================
// PROOF THREAD MESSAGE CONTROL
// ==============================

client.on(
  "messageCreate",
  async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      // !clearinvestigation @user — Senior HR only; restores saved staff roles.
      const clearInvestMatch = message.content.trim().match(/^!clearinvestigation\s+(?:<@!?(\d+)>|(\d+))$/i);
      if (clearInvestMatch) {
        const actor = await message.guild.members.fetch(message.author.id);
        if (!isSeniorHR(actor)) {
          const warning = await message.reply("Only Senior HR can remove Under Investigation and restore staff roles.");
          setTimeout(() => warning.delete().catch(() => {}), 7000);
          return;
        }
        const targetId = clearInvestMatch[1] || clearInvestMatch[2];
        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) { await message.reply("I could not find that member in this server."); return; }
        const records = loadInfractions();
        const investigation = [...records].reverse().find(record => record.targetId === targetId && String(record.punishment || "").startsWith("Under Investigation") && !record.investigationCleared);
        if (!investigation) {
          await message.reply("No active Under Investigation infraction was found. Older investigations without a saved role snapshot must be restored manually.");
          return;
        }
        const botMember = message.guild.members.me;
        const investigationRole = message.guild.roles.cache.find(role => role.name === "Under Investigation");
        if (!botMember || (investigationRole && investigationRole.position >= botMember.roles.highest.position)) { await message.reply("The bot role must be above Under Investigation in the role hierarchy."); return; }
        const savedRoles = (investigation.savedStaffRoles || []).filter(roleId => message.guild.roles.cache.has(roleId));
        if (!savedRoles.length) { await message.reply("This case has no saved staff-role snapshot. Please restore the original roles manually."); return; }
        if (savedRoles.some(roleId => message.guild.roles.cache.get(roleId).position >= botMember.roles.highest.position)) { await message.reply("The bot role must be above all staff roles it needs to restore."); return; }
        if (investigationRole && target.roles.cache.has(investigationRole.id)) await target.roles.remove(investigationRole, "Investigation cleared by Senior HR");
        await target.roles.add(savedRoles, "Restore staff roles after investigation cleared");
        investigation.investigationCleared = true;
        investigation.investigationClearedBy = message.author.id;
        investigation.investigationClearedAt = new Date().toISOString();
        saveInfractions(records);
        await message.reply("Removed Under Investigation from <@" + target.id + "> and restored their saved staff roles: " + savedRoles.map(id => "<@&" + id + ">").join(", "));
        return;
      }

      // ==========================================
      // !void — SENIOR HR ONLY, PROOF THREAD ONLY
      // ==========================================
      if (message.content.trim().toLowerCase() === "!void") {
        if (!message.channel.isThread()) {
          const warning = await message.reply(
            "`!void` can only be used inside an infraction proof thread."
          );
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          return;
        }

        const member = await message.guild.members.fetch(message.author.id);

        if (!hasInfractionAuthority(member)) {
          const warning = await message.reply(
            "You don't have permission to void infractions. High Rank (Internal Affairs Supervisor+) or Senior HR only."
          );
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          return;
        }

        const infractions = loadInfractions();
        const infraction = infractions.find(
          (x) => x.proofThreadId === message.channel.id
        );

        if (!infraction) {
          const warning = await message.reply(
            "This thread is not linked to a valid infraction."
          );
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          return;
        }

        if (infraction.voided) {
          const warning = await message.reply(
            `Infraction **${infraction.caseId}** is already voided.`
          );
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          return;
        }

        infraction.voided = true;
        infraction.voidedBy = message.author.id;
        infraction.voidedByName = message.author.username;
        infraction.voidedAt = new Date().toISOString();
        saveInfractions(infractions);

        // Update the original infraction message so the record clearly shows it was voided.
        try {
          const channel = await message.guild.channels.fetch(
            infraction.infractionChannelId
          );
          const original = channel?.isTextBased()
            ? await channel.messages.fetch(infraction.infractionMessageId)
            : null;

          if (original) {
            await original.edit({
              content: `~~Infraction ${infraction.caseId}~~\n**VOIDED** by <@${message.author.id}>`,
            });
          }
        } catch (error) {
          console.error("Could not update voided infraction message:", error);
        }

        // Close the proof thread after the infraction is voided.
        try {
          await message.channel.setLocked(true, `Infraction ${infraction.caseId} voided`);
          await message.channel.setArchived(true, `Infraction ${infraction.caseId} voided`);
        } catch (error) {
          console.error("Could not close voided infraction thread:", error);
        }

        return;
      }

      if (!message.channel.isThread()) return;

      const infractions =
        loadInfractions();

      const infraction =
        infractions.find(
          (x) =>
            x.proofThreadId ===
            message.channel.id
        );

      if (!infraction) return;

      const member =
        await message.guild.members.fetch(
          message.author.id
        );

      const senior =
        hasInfractionAuthority(member);

      const issuer =
        message.author.id ===
        infraction.issuerId;

      const affectedStaff =
        message.author.id ===
        infraction.targetId;

      // High Rank and Senior HR can speak.
      if (senior) return;

      // Original issuer can speak.
      if (issuer) return;

      // Affected staff can speak only
      // when appealable.
      if (
        affectedStaff &&
        infraction.appealStatus ===
          "Appealable"
      ) {
        return;
      }

      // Everyone else gets deleted.
      await message.delete().catch(
        () => {}
      );

    } catch (error) {
      console.error(
        "Proof thread message error:",
        error
      );
    }
  }
);
}

module.exports = { setup, commands };
