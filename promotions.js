const {
    SlashCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require("discord.js");

const path = require("path");

// ==========================================
// CONFIG
// ==========================================

const PROMOTION_CHANNEL_ID = "1529167049949970453";
const HR_ROLE_ID = "1551704115350999143";

// TOP IMAGE
const HEADER_PATH = path.join(__dirname, "promotion.png");
const HEADER_NAME = "promotion.png";

// BOTTOM IMAGE
const BANNER_PATH = path.join(__dirname, "banner.png");
const BANNER_NAME = "banner.png";

// Same color for BOTH embeds
const EMBED_COLOR = 0x00e5ff;

// ==========================================
// PROMOTABLE RANKS
// ==========================================

const RANKS = [
    { name: "Trial Mod", id: "1527383332093038755" },
    { name: "Junior Mod", id: "1528449495136731237" },
    { name: "Senior Mod", id: "1528449396860260503" },
    { name: "Head Mod", id: "1528449441827258531" },
    { name: "Lead Mod", id: "1551793867534114827" },

    { name: "Trial Admin", id: "1528449273644056666" },
    { name: "Junior Admin", id: "1528449153192169503" },
    { name: "Senior Admin", id: "1528435425373454366" },
    { name: "Head Admin", id: "1528449008668774541" },
    { name: "Lead Admin", id: "1528426018136920245" },

    { name: "Trial Internal Affairs", id: "1528426957962743989" },
    { name: "Junior Internal Affairs", id: "1528453585128390698" },
    { name: "Senior Internal Affairs", id: "1528453258568536314" },
    { name: "Head Internal Affairs", id: "1551797151229808671" },
    { name: "Internal Affairs Supervisor", id: "1528426796670914671" },
    { name: "Internal Affairs Director", id: "1528426646259105802" },

    { name: "Trial Management", id: "1528425767678247021" },
    { name: "Junior Management", id: "1528425691723595867" },
    { name: "Senior Management", id: "1527851704605868254" },
    { name: "Head Management", id: "1528425534600646860" },
    { name: "Lead Management", id: "1528425622047821875" }
];

// Team roles automatically synchronized by /promote.
const STAFF_TEAM_ROLE_ID = "1528242210871447672";
const TEAM_ROLE_IDS = {
    moderation: "1527381803617222676",
    administration: "1527381747791040522",
    internalAffairs: "1527381477975789668",
    management: "1528426569012609106"
};

function getTeamRoleId(rankName) {
    if (rankName.includes("Mod")) return TEAM_ROLE_IDS.moderation;
    if (rankName.includes("Admin")) return TEAM_ROLE_IDS.administration;
    if (rankName.includes("Internal Affairs")) return TEAM_ROLE_IDS.internalAffairs;
    if (rankName.includes("Management")) return TEAM_ROLE_IDS.management;
    return null;
}

// ==========================================
// /PROMOTE COMMAND
// ==========================================

const promoteCommand = new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a staff member.")
    .addUserOption(option =>
        option
            .setName("member")
            .setDescription("The staff member you want to promote.")
            .setRequired(true)
    );

// ==========================================
// SETUP
// ==========================================

function setup(client) {

// ==========================================
// INTERACTIONS
// ==========================================

client.on("interactionCreate", async interaction => {

    // ==========================================
    // /PROMOTE
    // ==========================================

    if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "promote"
    ) {

        const issuer = interaction.member;
        const target =
            interaction.options.getMember("member");

        if (!target) {
            return interaction.reply({
                content: "That member could not be found.",
                ephemeral: true
            });
        }

        const hrRole =
            interaction.guild.roles.cache.get(
                HR_ROLE_ID
            );

        if (!hrRole) {
            return interaction.reply({
                content: "The HR role could not be found.",
                ephemeral: true
            });
        }

        // HR ONLY
        if (
            issuer.roles.highest.position <
            hrRole.position
        ) {
            return interaction.reply({
                content:
                    "You don't have permission to use this command. High Rank (Internal Affairs Supervisor+) or Senior HR only.",
                ephemeral: true
            });
        }

        // ==========================================
        // FIND CURRENT STAFF ROLE
        // ==========================================

        const currentStaffRole =
            RANKS
                .map(rank => ({
                    rank,
                    role:
                        interaction.guild.roles.cache.get(
                            rank.id
                        )
                }))
                .filter(x => x.role)
                .filter(x =>
                    target.roles.cache.has(
                        x.role.id
                    )
                )
                .sort(
                    (a, b) =>
                        b.role.position -
                        a.role.position
                )[0];

        const targetRankPosition =
            currentStaffRole
                ? currentStaffRole.role.position
                : 0;

        // ==========================================
        // TARGET MUST BE BELOW ISSUER
        // ==========================================

        if (
            target.id === issuer.id ||
            target.roles.highest.position >= issuer.roles.highest.position
        ) {
            return interaction.reply({
                content:
                    "You don't have permission to promote this member. You must be above their rank. You cannot promote someone who is the same rank or higher than you.",
                ephemeral: true
            });
        }

        // ==========================================
        // AVAILABLE RANKS
        // ==========================================

        const availableRanks =
            RANKS
                .map(rank => ({
                    rank,
                    role:
                        interaction.guild.roles.cache.get(
                            rank.id
                        )
                }))
                .filter(x => x.role)
                .filter(x => {

                    // Must be higher than current rank
                    if (
                        x.role.position <=
                        targetRankPosition
                    ) {
                        return false;
                    }

                    // Cannot give own rank or higher
                    if (
                        x.role.position >=
                        issuer.roles.highest.position
                    ) {
                        return false;
                    }

                    return true;
                });

        if (availableRanks.length === 0) {
            return interaction.reply({
                content:
                    "There are no ranks you can promote this member to.",
                ephemeral: true
            });
        }

        // ==========================================
        // RANK SELECT
        // ==========================================

        const select =
            new StringSelectMenuBuilder()
                .setCustomId(
                    `promotion_rank_${target.id}`
                )
                .setPlaceholder(
                    "Select the new rank"
                )
                .addOptions(
                    availableRanks.map(
                        ({ rank }) => ({
                            label: rank.name,
                            value: rank.id
                        })
                    )
                );

        const row =
            new ActionRowBuilder()
                .addComponents(select);

        await interaction.reply({
            content:
                `Select the new rank for ${target}.`,
            components: [row],
            ephemeral: true
        });
    }

    // ==========================================
    // RANK SELECTED
    // ==========================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("promotion_rank_")
    ) {
        // Acknowledge the component immediately by opening the modal. Do not
        // perform lookups or other work before this response.
        const targetId = interaction.customId.slice("promotion_rank_".length);
        const newRoleId = interaction.values?.[0];

        if (!/^\d{17,20}$/.test(targetId) ||
            !RANKS.some(rank => rank.id === newRoleId)) {
            return interaction.update({
                content: "That promotion request is invalid. Please run /promote again.",
                components: []
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`promotion_notes_${targetId}_${newRoleId}`)
            .setTitle("Staff Promotion");

        const notesInput = new TextInputBuilder()
            .setCustomId("promotion_notes")
            .setLabel("Extra Notes")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Optional promotion notes...")
            .setRequired(false)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(notesInput)
        );

        try {
            await interaction.showModal(modal);
        } catch (error) {
            console.error("[Promotions] showModal failed:", {
                code: error?.code,
                message: error?.message,
                targetId,
                newRoleId
            });
            // Do not try a second acknowledgement if Discord has already
            // accepted the interaction callback.
        }
    }

    // ==========================================
    // PROMOTION MODAL
    // ==========================================

    if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
            "promotion_notes_"
        )
    ) {

        await interaction.deferReply({
            ephemeral: true
        });

        const parts =
            interaction.customId.split("_");

        const targetId = parts[2];
        const newRoleId = parts[3];

        const issuer = await interaction.guild.members
            .fetch(interaction.user.id)
            .catch(() => null);

        if (!issuer) {
            return interaction.editReply("Your server member profile could not be loaded. Please try again.");
        }

        const target =
            await interaction.guild.members
                .fetch(targetId)
                .catch(() => null);

        if (!target) {
            return interaction.editReply(
                "That member could not be found."
            );
        }

        const newRole =
            interaction.guild.roles.cache.get(
                newRoleId
            );

        if (!newRole) {
            return interaction.editReply(
                "The new rank could not be found."
            );
        }

        // ==========================================
        // FIND OLD ROLE
        // ==========================================

        const oldRoleData =
            RANKS
                .map(rank => ({
                    rank,
                    role:
                        interaction.guild.roles.cache.get(
                            rank.id
                        )
                }))
                .filter(x => x.role)
                .filter(x =>
                    target.roles.cache.has(
                        x.role.id
                    )
                )
                .sort(
                    (a, b) =>
                        b.role.position -
                        a.role.position
                )[0];

        const oldRole =
            oldRoleData
                ? oldRoleData.role
                : null;

        // ==========================================
        // PERMISSION CHECKS
        // ==========================================

        const hrRole =
            interaction.guild.roles.cache.get(
                HR_ROLE_ID
            );

        if (
            !hrRole ||
            (!issuer.roles.cache.has(HR_ROLE_ID) &&
             !issuer.roles.cache.has("1551704056991318191"))
        ) {
            return interaction.editReply(
                "You don't have permission to use this command. High Rank (Internal Affairs Supervisor+) or Senior HR only."
            );
        }

        if (
            target.id !== issuer.id &&
            target.roles.highest.position >=
            issuer.roles.highest.position
        ) {
            return interaction.editReply(
                "You don't have permission to promote this member. You must be above their rank. You cannot promote someone who is the same rank or higher than you."
            );
        }

        if (
            newRole.position >=
            issuer.roles.highest.position
        ) {
            return interaction.editReply(
                "You cannot give someone a role that is equal to or higher than your own."
            );
        }

        // ==========================================
        // BOT ROLE CHECK
        // ==========================================

        const botMember =
            interaction.guild.members.me;

        if (
            newRole.position >=
            botMember.roles.highest.position
        ) {
            return interaction.editReply(
                "I cannot assign that role because my bot role is not high enough in the server hierarchy."
            );
        }

        // ==========================================
        // SYNCHRONIZE STAFF AND TEAM ROLES
        // ==========================================

        const teamRoleId = getTeamRoleId(newRank.name);
        const teamRoleIds = Object.values(TEAM_ROLE_IDS);
        const requiredRoleIds = [
            newRole.id,
            STAFF_TEAM_ROLE_ID,
            ...(teamRoleId ? [teamRoleId] : [])
        ];
        const requiredRoles = requiredRoleIds.map(id =>
            interaction.guild.roles.cache.get(id)
        );

        if (requiredRoles.some(role => !role)) {
            return interaction.editReply(
                "Promotion stopped: one or more required staff/team roles could not be found. No roles were changed."
            );
        }

        if (requiredRoles.some(role =>
            role.position >= botMember.roles.highest.position
        )) {
            return interaction.editReply(
                "Promotion stopped: my bot role is not high enough to assign the rank, Staff Team, or required team role. No roles were changed."
            );
        }

        try {
            // Add the new rank and shared staff membership before removing old roles.
            const rolesToAdd = requiredRoles
                .filter(role => !target.roles.cache.has(role.id))
                .map(role => role.id);
            if (rolesToAdd.length) {
                await target.roles.add(rolesToAdd, "MSRP promotion: assign rank and team roles");
            }

            // Remove the previous rank and any mismatched team roles.
            const rolesToRemove = [];
            if (oldRole && oldRole.id !== newRole.id) {
                rolesToRemove.push(oldRole.id);
            }
            for (const roleId of teamRoleIds) {
                if (roleId !== teamRoleId && target.roles.cache.has(roleId)) {
                    rolesToRemove.push(roleId);
                }
            }
            if (rolesToRemove.length) {
                await target.roles.remove(
                    [...new Set(rolesToRemove)],
                    "MSRP promotion: synchronize team membership"
                );
            }
        } catch (error) {
            console.error("[Promotions] Failed to synchronize promotion roles:", error);
            return interaction.editReply(
                "I couldn't finish updating the rank and team roles. Please check my role permissions and hierarchy, then review the member's roles before retrying."
            );
        }

        // ==========================================
        // NOTES
        // ==========================================

        const notes =
            interaction.fields.getTextInputValue(
                "promotion_notes"
            ) ||
            "No additional notes.";

        // ==========================================
        // PROMOTION CHANNEL
        // ==========================================

        const channel =
            interaction.guild.channels.cache.get(
                PROMOTION_CHANNEL_ID
            );

        if (!channel) {
            return interaction.editReply(
                "The promotion channel could not be found."
            );
        }

        // ==========================================
        // COMPONENTS V2 — PROMOTION ANNOUNCEMENT
        // ==========================================

        const container = new ContainerBuilder();

        // TOP IMAGE — promotion.png
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(
                    `attachment://${HEADER_NAME}`
                )
            )
        );

        // TITLE / ISSUER + BOT LOGO
        // Components V2 Sections support a thumbnail accessory, which recreates
        // the bot-logo corner from the old embed without using a legacy embed.
        const titleSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## Staff Promotion\nPromoted by <@${issuer.id}>`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder()
                    .setURL(client.user.displayAvatarURL({ extension: "png", size: 256 }))
                    .setDescription("MSRP Automations bot icon")
            );

        container.addSectionComponents(titleSection);

        // TOP-TO-BOTTOM PROMOTION DETAILS
        // Keep the original information and order, but stack each field vertically.
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Promoted Staff**\n<@${target.id}>`
            ),
            new TextDisplayBuilder().setContent(
                `**Old Role**\n${oldRole ? `<@&${oldRole.id}>` : "No Previous Role"}`
            ),
            new TextDisplayBuilder().setContent(
                `**New Role**\n<@&${newRole.id}>`
            ),
            new TextDisplayBuilder().setContent(
                `**Extra Notes**\n${notes}`
            )
        );

        // FOOTER-STYLE INFORMATION
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**${target.displayName}**\n<t:${Math.floor(Date.now() / 1000)}:F>`
            )
        );

        // BOTTOM BANNER — banner.png
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(
                    `attachment://${BANNER_NAME}`
                )
            )
        );

        // ONE V2 MESSAGE — no legacy content/embed fields
        try {
            await channel.send({
                flags: MessageFlags.IsComponentsV2,
                components: [container],
                files: [
                    new AttachmentBuilder(HEADER_PATH, { name: HEADER_NAME }),
                    new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME })
                ]
            });
        } catch (error) {
            console.error("[Promotions] Role update succeeded but announcement failed:", error);
            return interaction.editReply(
                `The promotion roles were updated, but I couldn't post the announcement. Check the promotion channel permissions and bot logs.`
            );
        }

        // ==========================================
        // DONE
        // ==========================================

        await interaction.editReply(
            `Successfully promoted ${target} to ${newRole.name}.`
        );
    }
});
}

module.exports = { setup, promoteCommand };
