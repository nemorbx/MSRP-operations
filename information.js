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

const CHANNELS = {
  shouts: "1527178204299788389",
  sessions: "1527179992398692353",
  regulations: "1527395795035357376",
  applications: "1551975176084656209",
};

function display(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function informationPanel() {
  const container = new ContainerBuilder();

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${INFORMATION_IMAGE_NAME}`)
        .setDescription("Missouri State Roleplay Information")
    )
  );

  container.addTextDisplayComponents(
    display(
      "<:unknown:1552141993768132668> Founded on **August 10th, 2026**, **Missouri State Roleplay (MSRP)** provides a fun, realistic, and immersive ERLC experience based in Missouri. Players can take on roles such as police officers, firefighters, medics, or civilians while creating realistic scenarios and experiences."
    ),
    display(
      "Whether you're responding to emergencies, patrolling the streets, or simply enjoying the game as a civilian, there is something for everyone. Our goal is to provide a welcoming and organized community where players can enjoy realistic roleplay and make their own experiences."
    ),
    display("**Missouri State Roleplay — Experience Missouri With Us.**")
  );

  container.addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    display("## Important Channels:"),
    display(
      `<#${CHANNELS.shouts}>\\n<#${CHANNELS.sessions}>\\n<#${CHANNELS.regulations}>\\n<#${CHANNELS.applications}>`
    )
  );

  container.addSeparatorComponents(divider());

  container.addTextDisplayComponents(
    display("## Important Links:"),
    display("Moderation Logs\\nMain Group\\nWhitelisted Group")
  );

  return container;
}

async function postOrRefreshInformationPanel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = await guild.channels.fetch(INFORMATION_CHANNEL_ID).catch(() => null);
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
    console.error("Could not read the Information channel to refresh the panel.");
    return;
  }

  const oldPanels = messages.filter(
    message =>
      message.author?.id === client.user.id &&
      message.components?.length
  );

  for (const panel of oldPanels.values()) {
    await panel.delete().catch(error => {
      console.error("Failed to delete old Information panel:", error);
    });
  }

  await channel.send({
    components: [informationPanel()],
    files: [
      {
        attachment: imagePath,
        name: INFORMATION_IMAGE_NAME,
      },
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  console.log(
    `Information panel refreshed. Deleted ${oldPanels.size} existing panel(s) and posted one replacement.`
  );
}

function setup(client) {}

module.exports = { setup, postOrRefreshInformationPanel };
