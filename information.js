const {
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require("discord.js");

const INFORMATION_CHANNEL_ID = "1527394530427666452";
const INFORMATION_IMAGE_SOURCE = "Banner (1).png";
const INFORMATION_IMAGE_NAME = "information.png";
const INFORMATION_PANEL_VERSION = 4;
const INFORMATION_PANEL_MARKER = "\u200B".repeat(INFORMATION_PANEL_VERSION);

const CHANNELS = {
  shouts: "1527178204299788389",
  sessions: "1527179992398692353",
  regulations: "1527395795035357376",
  applications: "1551975176084656209",
};

function display(content) {
  return new TextDisplayBuilder().setContent(content);
}

function findEmoji(guild, name) {
  return guild?.emojis.cache.find(e => e.name === name) || null;
}

function emoji(guild, name) {
  const found = findEmoji(guild, name);
  return found ? `<:${found.name}:${found.id}>` : "";
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function informationPanel(guild) {
  const container = new ContainerBuilder();

  // Main Information banner. No description is supplied so Discord does not
  // display an ALT badge over the image.
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${INFORMATION_IMAGE_NAME}`)
    )
  );

  container.addTextDisplayComponents(
    display(
      `${emoji(guild, "msrpwhite")} **Founded August 10th, 2026**`
    ),
    display(
      "*Missouri State Roleplay is a fun, realistic, and immersive ERLC community based in Missouri. Players can take on roles such as police officers, firefighters, medics, or civilians while creating realistic scenarios and experiences.*"
    ),
    display(
      "*Whether you're responding to emergencies, patrolling the streets, or simply enjoying the game as a civilian, there is something for everyone. Our goal is to provide a welcoming and organized community where players can enjoy realistic roleplay and create their own experiences.*"
    ),
    display(`**Missouri State Roleplay — Experience Missouri With Us.**${INFORMATION_PANEL_MARKER}`)
  );

  container.addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    display(`## ${emoji(guild, "letter")} Important Channels`),
    display("*Quick access to the channels you will use most throughout MSRP.*"),
    display(
      [
        `${emoji(guild, "bulletin")} <#${CHANNELS.shouts}>`,
        `${emoji(guild, "bulletin")} <#${CHANNELS.sessions}>`,
        `${emoji(guild, "bulletin")} <#${CHANNELS.regulations}>`,
        `${emoji(guild, "bulletin")} <#${CHANNELS.applications}>`,
      ].join("\n")
    )
  );

  container.addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    display(`## ${emoji(guild, "info")} Important Links`),
    display("*Official resources and community access points for MSRP.*"),
    display([
      `${emoji(guild, "board")} Moderation Logs`,
      `${emoji(guild, "roblox")} Main Group`,
      `${emoji(guild, "shield")} Whitelisted Group`,
    ].join("\n"))
  );

  // Thin MSRP footer/banner at the bottom of the panel.
  container.addSeparatorComponents(divider());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL("attachment://banner.png")
    )
  );

  return container;
}

async function postOrRefreshInformationPanel(client) {
  const channel = await client.channels.fetch(INFORMATION_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error(`Information channel ${INFORMATION_CHANNEL_ID} could not be found or is not text-based.`);
    return;
  }

  const imagePath = require("path").join(__dirname, INFORMATION_IMAGE_SOURCE);
  const fs = require("fs");

  if (!fs.existsSync(imagePath)) {
    console.error(`Missing ${INFORMATION_IMAGE_SOURCE}. The Information panel requires this image.`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the Information channel to check the panel.");
    return;
  }

  const botPanels = messages.filter(
    message => message.author?.id === client.user.id && message.components?.length
  );

  const currentPanel = botPanels.find(message =>
    JSON.stringify(message.components || []).includes(INFORMATION_PANEL_MARKER)
  );

  if (currentPanel) {
    for (const duplicate of botPanels.values()) {
      if (duplicate.id !== currentPanel.id) {
        await duplicate.delete().catch(() => {});
      }
    }
    console.log("Information panel is current. Leaving it unchanged.");
    return;
  }

  for (const panel of botPanels.values()) {
    await panel.delete().catch(error => {
      console.error("Failed to delete old Information panel:", error);
    });
  }

  const footerPath = require("path").join(__dirname, "banner.png");
  if (!fs.existsSync(footerPath)) {
    console.error("Missing banner.png. The Information panel requires the bottom banner.");
    return;
  }

  await channel.send({
    components: [informationPanel(channel.guild)],
    files: [
      {
        attachment: imagePath,
        name: INFORMATION_IMAGE_NAME,
      },
      {
        attachment: footerPath,
        name: "banner.png",
      },
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  console.log("Information panel updated because its panel version changed or no current panel existed.");
}

function setup(client) {}

module.exports = { setup, postOrRefreshInformationPanel };
