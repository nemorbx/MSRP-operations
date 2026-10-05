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
  trophy: "trophy",
  rocket: "rocket",
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
    display("## Rules"),
    display(`${emoji(guild, "info")} *Missouri State Roleplay*`),
    display(
      "Our regulations apply to both the MSRP Discord community and our ER:LC roleplay server. All members are expected to read and follow the applicable regulations while participating in Missouri State Roleplay."
    )
  );

  // RULES & STANDARDS
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display("## Rules & Standards"),
    display(`${emoji(guild, "board")} *Standards that apply to members while participating in MSRP.*`)
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
    display("## Restrictions"),
    display(`${emoji(guild, "shield")} *Reference information for jurisdiction, vehicles, departments, and roleplay restrictions.*`),
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
        "These rules apply to all members participating in MSRP roleplay. They are intended to keep roleplay realistic, fair, organized, and enjoyable.",
        [
          {
            title: "Fail Roleplay (FRP)",
            emoji: "roblox",
            body: arrows(guild, [
              "All actions taken by your character must remain realistic and appropriate for the situation.",
              "Ignoring injuries, crashes, or realistic consequences may be considered Fail Roleplay.",
            ]),
          },
          {
            title: "Random Deathmatch (RDM)",
            emoji: "shield",
            body: arrows(guild, [
              "Do not intentionally injure or kill another player without a valid roleplay reason.",
              "Randomly attacking players without legitimate roleplay intent is prohibited.",
            ]),
          },
          {
            title: "Vehicle Deathmatch (VDM)",
            emoji: "police",
            body: arrows(guild, [
              "Do not intentionally use a vehicle to damage, ram, or run over another player or vehicle without a valid roleplay reason.",
            ]),
          },
          {
            title: "Metagaming",
            emoji: "info",
            body: arrows(guild, [
              "Do not use information obtained outside of roleplay to gain an in-game advantage.",
            ]),
          },
          {
            title: "Cop Baiting",
            emoji: "police",
            body: arrows(guild, [
              "Do not intentionally provoke law enforcement into an interaction or pursuit without a legitimate roleplay reason.",
            ]),
          },
          {
            title: "Unrealistic Driving",
            emoji: "roblox",
            body: arrows(guild, [
              "Vehicles must be driven realistically.",
              "Do not drive erratically, recklessly, or unrealistically unless you have a valid roleplay reason.",
            ]),
          },
          {
            title: "New Life Rule (NLR)",
            emoji: "info",
            body: arrows(guild, [
              "After your character dies, you must forget the events leading up to their death.",
              "You may not immediately return to the scene where you died or use your previous knowledge to influence the scene.",
            ]),
          },
          {
            title: "Fear Roleplay",
            emoji: "shield",
            body: arrows(guild, [
              "When your character's life is reasonably threatened, you must act as though you value your life.",
            ]),
          },
          {
            title: "No Intent To Roleplay (NITRP)",
            emoji: "board",
            body: arrows(guild, [
              "Players who intentionally troll, disrupt, or show a complete disregard for the roleplay environment may be punished.",
              "Repeated RDM, VDM, unrealistic driving, or other disruptive behavior may be treated as NITRP.",
            ]),
          },
          {
            title: "Pointless Pursuits",
            emoji: "police",
            body: arrows(guild, [
              "You must have a valid roleplay reason to flee from law enforcement.",
              "Do not start or extend pursuits simply to create a chase.",
            ]),
          },
          {
            title: "Group Sizes",
            emoji: "people",
            body: arrows(guild, [
              "Groups must remain within reasonable limits for the situation.",
              "Large-scale or organized scenarios may require prior staff approval.",
            ]),
          },
          {
            title: "Roleplay Scenario Requirements",
            emoji: "ticket",
            body: arrows(guild, [
              "Major scenarios may require approval from an in-game staff member before they begin.",
              "This may include hostage situations, kidnappings, jewelry store robberies, bank robberies, and other large-scale scenarios.",
              "Fire and EMS personnel may not be kidnapped or taken hostage unless a specific scenario has been approved by staff.",
            ]),
          },
          {
            title: "Priorities & Peacetimes",
            emoji: "pin",
            body: arrows(guild, [
              "Follow all active priority and peacetime restrictions.",
              "Do not start a restricted scenario during an active priority timer or peacetime.",
              "If you are planning to start a priority, review the applicable priority rules first.",
            ]),
          },
          {
            title: "Safe Zones",
            emoji: "shield",
            body: arrows(guild, [
              "Violent or criminal roleplay is prohibited within designated safe zones.",
              "Safe zones may include police stations, fire stations, hospitals, courthouses, jails, civilian spawn areas, and other areas designated by staff.",
            ]),
          },
          {
            title: "Alternate Agencies & Impersonation",
            emoji: "people",
            body: arrows(guild, [
              "Do not roleplay as an agency or department that is not represented in MSRP.",
              "Do not impersonate law enforcement, fire, EMS, DOT, or other official personnel without authorization.",
              "Legitimate civilian businesses and civilian roleplays are permitted when they follow MSRP rules.",
            ]),
          },
          {
            title: "Unrealistic Avatars",
            emoji: "people",
            body: arrows(guild, [
              "Avatars must remain reasonably realistic for the roleplay environment.",
              "Civilians may not use excessive tactical equipment unless their civilian roleplay reasonably requires it.",
              "Unrealistic accessories, appearances, and animal/furry avatars are prohibited.",
            ]),
          },
          {
            title: "Restricted Communications",
            emoji: "bell",
            body: arrows(guild, [
              "Civilians may not intentionally listen to restricted law-enforcement communications.",
              "Restricted communications may not be used to gain an in-game roleplay advantage.",
            ]),
          },
          {
            title: "Leaving To Avoid Punishment (LTAP)",
            emoji: "arrow",
            body: arrows(guild, [
              "Leaving the game to avoid a moderator interaction, punishment, arrest, or roleplay consequence is prohibited.",
            ]),
          },
          {
            title: "Common Sense",
            emoji: "info",
            body: arrows(guild, [
              "Use common sense in all roleplay situations.",
              "If an action would not realistically occur in real life, do not do it in MSRP.",
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
        "This section outlines vehicles that are restricted within MSRP. Restrictions may be based on department, rank, assignment, VIP/Premium membership, Server Booster status, or staff authorization.",
        [
          {
            title: "Law Enforcement Restrictions",
            emoji: "shield",
            body: arrows(guild, [
              "Unmarked / Undercover Vehicles",
              "Slicktop Vehicles",
              "Supervisor Vehicles",
              "Command Vehicles",
              "SWAT / Tactical Vehicles",
              "Specialty Unit Vehicles",
              "Mobile Command Vehicles",
              "ATVs / Utility Vehicles",
              "Marine Vehicles",
              "Any vehicle designated RANKED is restricted to authorized ranked members.",
            ]),
          },
          {
            title: "Fire & EMS Restrictions",
            emoji: "bell",
            body: arrows(guild, [
              "Specialty / Critical Care Ambulances",
              "Rescue Vehicles",
              "Heavy Rescue",
              "Ladder / Aerial Vehicles",
              "Command Vehicles",
              "Hazmat Vehicles",
              "Brush / Wildland Vehicles",
              "Special Operations Vehicles",
              "Marine Rescue Vehicles",
              "Any vehicle designated RANKED is restricted to authorized ranked members.",
            ]),
          },
          {
            title: "DOT Restrictions",
            emoji: "board",
            body: arrows(guild, [
              "Heavy Tow Trucks",
              "Flatbed Trucks",
              "Specialty Tow Vehicles",
              "Traffic Control Vehicles",
              "Maintenance Vehicles",
              "Utility Vehicles",
              "HAZMAT / Specialty Vehicles",
              "Any vehicle designated RANKED is restricted to authorized ranked members.",
            ]),
          },
          {
            title: "Civilian Restrictions",
            emoji: "people",
            body: [
              `${emoji(guild, "trophy")} **VIP / Premium Members** — Vehicles marked with the Trophy emoji may only be used by members with an active VIP / Premium membership.`,
              `${emoji(guild, "rocket")} **Server Boosters** — Vehicles marked with the Rocket emoji may only be used by members who are actively boosting the MSRP Discord server.`,
              "",
              "**Restricted Vehicles**",
              `${emoji(guild, "trophy")} **Strugatti Ettore**`,
              `${emoji(guild, "trophy")} **Kovac Helladara**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Falcon Heritage**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Falcon Heritage Track**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Takao Experience**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Navarra Horizon**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Averon LMR 2020**`,
              `${emoji(guild, "rocket")} ${emoji(guild, "trophy")} **Surrey 650S**`,
            ].join("\n")
          },
          {
            title: "Vehicle Usage",
            emoji: "info",
            body: arrows(guild, [
              "Do not use a restricted vehicle without meeting its requirements.",
              "Restricted vehicles may not be used to gain an unfair roleplay advantage.",
              "Do not use department-only or specialty vehicles while roleplaying as an unauthorized civilian.",
              "Access to a restricted vehicle does not exempt you from any MSRP rule or staff instruction.",
              "Vehicle access may be revoked if a vehicle is misused or used outside its intended purpose.",
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
    console.error("Could not read the regulations channel to refresh the panel.");
    return;
  }

  const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);
  const bannerPath = path.join(__dirname, BANNER_NAME);

  if (!fs.existsSync(regulationsBannerPath)) {
    console.error(`Missing ${REGULATIONS_BANNER_NAME}. The regulations panel requires this top image.`);
    return;
  }

  // This is the dedicated Regulations panel channel. Remove every message
  // sent by this bot before posting the new panel. This is more reliable for
  // Components V2 than inspecting nested component IDs.
  const oldPanels = messages.filter(message => message.author?.id === client.user.id);

  for (const panel of oldPanels.values()) {
    await panel.delete().catch(error => {
      console.error("Failed to delete old Regulations panel:", error);
    });
  }

  const files = [{ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME }];
  if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: BANNER_NAME });

  await channel.send({
    components: [mainPanel(guild)],
    files,
    flags: MessageFlags.IsComponentsV2,
  });

  console.log(`Regulations panel refreshed. Deleted ${oldPanels.size} old bot message(s).`);
}

function setup(client) {
  // The Regulations panel is persistent and is intentionally not recreated
  // during bot startup. This prevents duplicate panels and speeds up deployments.

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

module.exports = { setup, postOrRefreshPanel };
