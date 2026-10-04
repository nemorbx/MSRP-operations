const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const REGULATIONS_CHANNEL_ID = "1527395795035357376";
const BANNER_NAME = "banner.png";
const REGULATIONS_BANNER_NAME = "regulations.png";
const JURISDICTION_NAME = "Jurisdiction.png";

const EMOJIS = {
  letter: "letter",
  bulletin: "bulletin",
  arrow: "arrow",
  info: "info",
  ticket: "ticket",
  bell: "bell",
  roblox: "roblox",
  shield: "shield",
  people: "people",
  pin: "pin",
  board: "board",
  discord: "discord",
  police: "police",
  stateLogo: "state_logo",
};

function findEmoji(guild, name) {
  const configured = EMOJIS[name];
  if (!configured) return null;

  const names = Array.isArray(configured) ? configured : [configured];
  return guild?.emojis.cache.find(e => names.includes(e.name)) || null;
}

function emoji(guild, name) {
  const found = findEmoji(guild, name);
  return found ? `<:${found.name}:${found.id}>` : "•";
}

function display(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function privateTextPage(title, body) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    display(`# ${title}`),
    display("*Missouri State Roleplay • Official Regulations*"),
  );
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(display(body));
  return container;
}

function regulationButton(guild, id, label, emojiName) {
  const builder = new ButtonBuilder()
    .setCustomId(`msrp_reg_${id}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);

  const found = findEmoji(guild, emojiName);
  if (found) builder.setEmoji(found.id);

  return builder;
}

function addBanner(container, assetName = REGULATIONS_BANNER_NAME) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${assetName}`)
    )
  );
}

function addBottomBanner(container) {
  container.addSeparatorComponents(divider());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${BANNER_NAME}`)
    )
  );
}

function mainPanel(guild) {
  const container = new ContainerBuilder();

  // TOP IMAGE — regulations.png
  addBanner(container);

  // MAIN TITLE — state logo + Rules
  container.addTextDisplayComponents(
    display(`## ${emoji(guild, "stateLogo")} Rules`),
    display("*Missouri State Roleplay*"),
    display(
      "Our regulations apply to both the MSRP Discord community and our ER:LC roleplay server. All members are expected to read and follow the applicable regulations while participating in Missouri State Roleplay."
    )
  );

  // RULES & STANDARDS
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display(`## ${emoji(guild, "stateLogo")} Rules & Standards`),
    display("*Standards that apply to members while participating in MSRP.*")
  );

  container.addTextDisplayComponents(
    display(`${emoji(guild, "discord")} **Discord Standards**`),
    display("*Community conduct, communication, moderation, and Discord requirements.*"),
    display(`${emoji(guild, "roblox")} **In-Game Standards**`),
    display("*ER:LC roleplay standards, realism, department conduct, and gameplay.*"),
    display(`${emoji(guild, "police")} **Priority Standards**`),
    display("*Priority calls, pursuits, emergency situations, and scene priorities.*")
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      regulationButton(guild, "discord", "Discord", "discord"),
      regulationButton(guild, "game", "Game", "roblox"),
      regulationButton(guild, "priorities", "Priorities", "police")
    )
  );

  // RESTRICTIONS
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display(`## ${emoji(guild, "shield")} Restrictions`),
    display("*Reference information for jurisdiction, vehicles, departments, and roleplay restrictions.*"),
    display(`${emoji(guild, "info")} **Jurisdiction**`),
    display("*Official Missouri State Roleplay jurisdiction information.*"),
    display(`${emoji(guild, "police")} **Vehicles**`),
    display("*Restricted and authorized vehicle information.*"),
    display(`${emoji(guild, "people")} **Departments**`),
    display("*Department restrictions, requirements, and authorization.*"),
    display(`${emoji(guild, "roblox")} **Roleplays**`),
    display("*Restricted or permission-based roleplay information.*")
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      regulationButton(guild, "jurisdiction", "Jurisdiction", "info"),
      regulationButton(guild, "vehicles", "Vehicles", "police"),
      regulationButton(guild, "departments", "Departments", "people"),
      regulationButton(guild, "roleplays", "Roleplays", "roblox")
    )
  );

  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display("*Staff members may exercise reasonable discretion when handling moderation cases. If you have a concern about how a case is handled, use the appropriate support process.*")
  );

  // BOTTOM IMAGE — banner.png
  addBottomBanner(container);
  return container;
}

function privatePage(guild, title, intro, sections) {
  const container = new ContainerBuilder();
  addBanner(container);

  container.addTextDisplayComponents(
    display(`# ${title}`),
    display("*Missouri State Roleplay*"),
    display(intro)
  );

  for (const section of sections) {
    container.addSeparatorComponents(divider());
    container.addTextDisplayComponents(
      display(`### ${emoji(guild, section.emoji || "bulletin")} ${section.title}`),
      display(`*${section.subtitle || "MSRP regulation and requirements"}*`),
      display(section.body)
    );
  }

  addBottomBanner(container);
  return container;
}

function arrows(guild, lines) {
  return lines.map(line => `${emoji(guild, "arrow")} ${line}`).join("\n");
}

function getPage(guild, id) {
  switch (id) {
    case "discord":
      return privatePage(
        guild,
        "DISCORD REGULATIONS",
        "While participating in the MSRP Discord community, you are required to follow the regulations listed below. Failure to follow them may result in moderation action.",
        [
          {
            title: "Prohibitions",
            emoji: "board",
            body: arrows(guild, [
              "Harassment, bullying, or targeted disruption is prohibited.",
              "Spam, flooding, or intentionally disruptive behavior is prohibited.",
              "Disrespect toward members or staff is not permitted.",
              "Unauthorized advertising or promotion is prohibited.",
              "Inappropriate or prohibited content is not allowed.",
              "Attempting to evade moderation through alternate accounts is prohibited.",
              "Intentionally creating drama or disrupting staff operations is prohibited.",
            ]),
          },
          {
            title: "Information",
            emoji: "info",
            body: arrows(guild, [
              "Members must follow Discord's Terms of Service and Community Guidelines.",
              "Report community concerns through the appropriate support process.",
              "Do not attempt to resolve staff matters through public arguments or disruption.",
              "Staff may take action when behavior negatively affects the MSRP community.",
            ]),
          },
        ]
      );

    case "game":
      return privatePage(
        guild,
        "IN-GAME REGULATIONS",
        "While playing ER:LC with Missouri State Roleplay, you are required to follow the regulations below. Failure to follow them may result in in-game moderation or server discipline.",
        [
          {
            title: "General Regulations",
            emoji: "roblox",
            body: arrows(guild, [
              "Random Deathmatch (RDM) and Vehicle Deathmatch (VDM) are prohibited.",
              "FearRP and realistic roleplay are required.",
              "Every member is expected to have a legitimate roleplay intention.",
              "Do not intentionally disrupt, troll, or ruin another member's roleplay.",
              "Tool abuse, exploiting, and intentionally abusing glitches are prohibited.",
              "Follow realistic traffic laws and driving practices while roleplaying.",
            ]),
          },
          {
            title: "Law Enforcement",
            emoji: "shield",
            body: arrows(guild, [
              "Missouri State Highway Patrol and St. Louis County Police must remain within their authorized jurisdiction and duties.",
              "Traffic stops, pursuits, arrests, and emergency responses must remain realistic.",
              "Do not use law-enforcement privileges for personal advantage or unnecessary disruption.",
              "Follow department-specific procedures and authorized staff direction.",
            ]),
          },
          {
            title: "Staff Regulations",
            emoji: "people",
            body: arrows(guild, [
              "Staff instructions during active moderation situations must be followed.",
              "Staff permissions may only be used for authorized staff duties.",
              "Staff members are expected to remain professional and impartial.",
              "Abuse of staff permissions may result in disciplinary action.",
            ]),
          },
        ]
      );

    case "priorities":
      return privatePage(
        guild,
        "PRIORITY REGULATIONS",
        "Priority situations require realistic coordination and consideration for active scenes.",
        [
          {
            title: "Priority Situations",
            emoji: "pin",
            body: arrows(guild, [
              "Active emergency scenes should be given appropriate priority.",
              "Do not intentionally interfere with another active scene.",
              "Emergency responses should remain realistic and proportional to the situation.",
              "Follow authorized staff direction when priority conflicts need to be resolved.",
              "Do not abuse priority situations to gain an unfair roleplay advantage.",
            ]),
          },
          {
            title: "Pursuits & Emergencies",
            emoji: "bell",
            body: arrows(guild, [
              "Units should coordinate appropriately during active pursuits and emergency responses.",
              "Do not intentionally create unnecessary emergency situations.",
              "Members should respect active scenes and avoid unrealistic interference.",
            ]),
          },
        ]
      );

    case "vehicles":
      return privatePage(
        guild,
        "VEHICLE RESTRICTIONS",
        "Vehicles may be restricted by department, role, rank, staff authorization, or server policy. Do not use a restricted vehicle without the required authorization.",
        [
          {
            title: "Restricted Vehicles",
            emoji: "shield",
            body: arrows(guild, [
              "Only use vehicles authorized for your department and role.",
              "Do not use restricted vehicles to gain an unfair roleplay advantage.",
              "Do not use department-only vehicles while roleplaying as an unauthorized civilian.",
              "Follow any vehicle-specific restrictions published by MSRP staff.",
            ]),
          },
          {
            title: "Authorization",
            emoji: "info",
            body: arrows(guild, [
              "If a vehicle requires staff, department, rank, or other authorization, obtain permission before using it.",
              "Authorization may be revoked if the vehicle is misused or used outside its intended roleplay purpose.",
            ]),
          },
        ]
      );

    case "departments":
      return privatePage(
        guild,
        "DEPARTMENT REGULATIONS",
        "Missouri State Roleplay currently centers its law-enforcement roleplay around the Missouri State Highway Patrol and St. Louis County Police Department, along with authorized staff operations.",
        [
          {
            title: "Missouri State Highway Patrol",
            emoji: "shield",
            body: arrows(guild, [
              "MSHP roleplay is primarily focused on statewide and highway law-enforcement operations.",
              "Members must remain within the duties and equipment authorized for their position.",
              "Troopers should maintain realistic traffic enforcement, pursuits, and emergency responses.",
            ]),
          },
          {
            title: "St. Louis County Police Department",
            emoji: "shield",
            body: arrows(guild, [
              "SLCPD roleplay is primarily focused on St. Louis County law-enforcement operations.",
              "Members must remain within the duties and equipment authorized for their position.",
              "Officers should maintain realistic patrol, traffic enforcement, pursuits, and emergency responses.",
            ]),
          },
          {
            title: "Staff Operations",
            emoji: "people",
            body: arrows(guild, [
              "Staff-only functions and permissions are restricted to authorized staff members.",
              "Staff should not use administrative permissions to interfere with roleplay unnecessarily.",
              "Follow the MSRP staff chain of command when handling staff matters.",
            ]),
          },
        ]
      );

    case "roleplays":
      return privatePage(
        guild,
        "ROLEPLAY RESTRICTIONS",
        "Certain roleplays may require additional authorization to keep sessions realistic, organized, and enjoyable for the community.",
        [
          {
            title: "Restricted Roleplays",
            emoji: "board",
            body: arrows(guild, [
              "Do not begin a restricted or permission-based roleplay without the required authorization.",
              "Roleplays must remain realistic and must not be used to disrupt other members.",
              "Do not intentionally create scenarios designed only to provoke or interfere with active roleplay.",
              "Follow any additional instructions provided by authorized MSRP staff.",
            ]),
          },
          {
            title: "Staff Authorization",
            emoji: "info",
            body: arrows(guild, [
              "If a roleplay requires staff approval, request permission through the appropriate support process before starting it.",
              "Staff may deny or stop a roleplay when it conflicts with current scenes, server rules, or community operations.",
            ]),
          },
        ]
      );

    default:
      return null;
  }
}

function attachmentFiles(includeJurisdiction = false) {
  const files = [];
  const bannerPath = path.join(__dirname, BANNER_NAME);
  const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);

  if (fs.existsSync(regulationsBannerPath)) {
    files.push({ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME });
  }

  if (fs.existsSync(bannerPath)) {
    files.push({ attachment: bannerPath, name: BANNER_NAME });
  }

  if (includeJurisdiction) {
    const jurisdictionPath = path.join(__dirname, JURISDICTION_NAME);
    if (fs.existsSync(jurisdictionPath)) {
      files.push({ attachment: jurisdictionPath, name: JURISDICTION_NAME });
    }
  }

  return files;
}

async function sendJurisdiction(interaction) {
  const jurisdictionPath = path.join(__dirname, JURISDICTION_NAME);

  if (!fs.existsSync(jurisdictionPath)) {
    await interaction.reply({
      components: [privateTextPage("JURISDICTION", `I couldn't find **${JURISDICTION_NAME}** in the MSRP Operations folder.`)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    return;
  }

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    display("# JURISDICTION"),
    display("*Missouri State Roleplay*"),
    display("Official MSRP jurisdiction map."),
  );
  container.addSeparatorComponents(divider());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${JURISDICTION_NAME}`),
    ),
  );

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });

  await interaction.editReply({
    components: [container],
    files: [{ attachment: jurisdictionPath, name: JURISDICTION_NAME }],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

async function postOrRefreshPanel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = await guild.channels.fetch(REGULATIONS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error(`Regulations channel ${REGULATIONS_CHANNEL_ID} could not be found or is not text-based.`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the regulations channel to post the panel.");
    return;
  }

  // Components V2 panels are not always exposed with their nested button
  // custom IDs when messages are fetched. Use the unique regulations.png
  // attachment as a reliable fallback so old panels are found and removed.
  const existing = messages.find(message =>
    message.author.id === client.user.id &&
    (
      message.components?.some(component =>
        component.components?.some(child => child.customId?.startsWith("msrp_reg_"))
      ) ||
      message.attachments?.some(attachment => attachment.name === "regulations.png")
    )
  );

  const bannerPath = path.join(__dirname, BANNER_NAME);
  const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);
  if (!fs.existsSync(regulationsBannerPath)) {
    console.error(`Missing ${REGULATIONS_BANNER_NAME}. The regulations panel requires this top image.`);
    return;
  }

  const files = [{ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME }];
  if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: BANNER_NAME });

  const payload = {
    components: [mainPanel(guild)],
    files,
    flags: MessageFlags.IsComponentsV2,
  };

  const existingPanels = messages.filter(message =>
    message.author?.id === client.user.id &&
    (
      message.components?.some(component =>
        component.components?.some(child => child.customId?.startsWith("msrp_reg_"))
      ) ||
      message.attachments?.some(attachment => attachment.name === "regulations.png")
    )
  );

  // Keep exactly one Regulations panel. Delete every old copy, then post the
  // current version so updates are applied without accumulating panels.
  for (const panel of existingPanels) {
    await panel.delete().catch(() => {});
  }

  await channel.send(payload);
  console.log(
    existingPanels.length
      ? `Regulations panel replaced in #${channel.name}.`
      : `Regulations panel posted in #${channel.name}.`
  );
}

function setup(client) {
  client.once("clientReady", async () => {
    try {
      await postOrRefreshPanel(client);
    } catch (error) {
      console.error("Failed to automatically post the regulations panel:", error);
    }
  });

  client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("msrp_reg_")) return;

    try {
      const id = interaction.customId.replace("msrp_reg_", "");

      if (!interaction.guild) {
        await interaction.reply({
          components: [privateTextPage("REGULATIONS", "This button can only be used in the server.")],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "jurisdiction") {
        await sendJurisdiction(interaction);
        return;
      }

      const page = getPage(interaction.guild, id);
      if (!page) {
        await interaction.reply({
          components: [privateTextPage("REGULATIONS", "That regulation page is unavailable.")],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
        return;
      }

      const bannerPath = path.join(__dirname, BANNER_NAME);
      const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);
      const files = [];

      if (fs.existsSync(regulationsBannerPath)) {
        files.push({ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME });
      }
      if (fs.existsSync(bannerPath)) {
        files.push({ attachment: bannerPath, name: BANNER_NAME });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });

      await interaction.editReply({
        components: [page],
        ...(files.length ? { files } : {}),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.error("Regulations button error:", error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            components: [privateTextPage("REGULATIONS", "I couldn't load that regulations page. Please try the button again.")],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
        } else {
          await interaction.reply({
            components: [privateTextPage("REGULATIONS", "I couldn't load that regulations page. Please try the button again.")],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
        }
      } catch (replyError) {
        console.error("Failed to send regulations error response:", replyError);
      }
    }
  });
}

module.exports = { setup };
