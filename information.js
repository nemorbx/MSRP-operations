const {
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const INFORMATION_CHANNEL_ID = "1527394530427666452";
const INFORMATION_IMAGE_SOURCE = "information.png";
const WEBSITE_URL = "https://nemorbx.github.io/msrp/";
// Keep the supplied Roblox group destinations here when available.
const WHITELISTED_GROUP_URL = "https://www.roblox.com/communities/";
const ROBLOX_GROUP_URL = "https://www.roblox.com/communities/";
const INFORMATION_IMAGE_NAME = "information.png";
const INFORMATION_PANEL_VERSION = 12;
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
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function addBanner(container, filename) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${filename}`)
    )
  );
}

function informationPanel(guild) {
  const container = new ContainerBuilder();

  // The banner and footer are both inside the same Components V2 container.
  addBanner(container, INFORMATION_IMAGE_NAME);

  container.addTextDisplayComponents(
    display("> **Los Angeles Roleplay** re-opened on the 3rd of September, 2025, we set to bring a realistic roleplay experience to all of our server members. Through our Discord to our in-game server, we\'re always here to help with your roleplay needs!")
  );

  // Keep the existing divider below the timer, with minimal spacing above it.
  container.addTextDisplayComponents(
    display("> <:caution:1560140490823835689> **Default kick timer:** `30 Minutes` " + INFORMATION_PANEL_MARKER)
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Whitelisted Group").setStyle(ButtonStyle.Link).setURL(WHITELISTED_GROUP_URL),
      new ButtonBuilder().setLabel("Roblox Group").setStyle(ButtonStyle.Link).setURL(ROBLOX_GROUP_URL),
      new ButtonBuilder().setLabel("Website").setStyle(ButtonStyle.Link).setURL(WEBSITE_URL)
    )
  );

  container.addSeparatorComponents(divider());
  addBanner(container, "banner.png");
  return container;
}

async function postOrRefreshInformationPanel(client) {
  const channel = await client.channels.fetch(INFORMATION_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.messages) {
    console.error(`Information channel ${INFORMATION_CHANNEL_ID} could not be found or is not text-based.`);
    return;
  }

  const fs = require("fs");
  const path = require("path");
  const imagePath = path.join(__dirname, INFORMATION_IMAGE_SOURCE);
  const footerPath = path.join(__dirname, "banner.png");

  if (!fs.existsSync(imagePath) || !fs.existsSync(footerPath)) {
    console.error(`Information panel images missing: ${!fs.existsSync(imagePath) ? INFORMATION_IMAGE_SOURCE : "banner.png"}`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the Information channel to replace the existing panel.");
    return;
  }

  const botPanels = messages.filter(message =>
    message.author?.id === client.user.id &&
    message.components?.length &&
    message.attachments?.some(attachment => attachment.name === INFORMATION_IMAGE_NAME)
  );

  const existingPanel = botPanels.first();
  const payload = {
    components: [informationPanel(channel.guild)],
    files: [
      { attachment: imagePath, name: INFORMATION_IMAGE_NAME },
      { attachment: footerPath, name: "banner.png" },
    ],
    attachments: [],
    flags: MessageFlags.IsComponentsV2,
  };

  if (existingPanel) {
    await existingPanel.edit(payload);
    for (const duplicate of botPanels.filter(message => message.id !== existingPanel.id).values()) {
      await duplicate.delete().catch(error => console.error("Failed to remove duplicate Information panel:", error));
    }
    console.log("Information V2 panel updated in place; duplicates cleaned up.");
  } else {
    await channel.send(payload);
    console.log("Information V2 panel posted because none was detected.");
  }
}

function setup(client) {}

module.exports = { setup, postOrRefreshInformationPanel };
