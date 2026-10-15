const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
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

const ROLEPERKS_CHANNEL_ID = "1560123150635630672";
const ROLEPERKS_IMAGE_SOURCE = "roleperks.png";
const ROLEPERKS_IMAGE_NAME = "roleperks.png";
const ROLEPERKS_PANEL_VERSION = 2;
const ROLEPERKS_PANEL_MARKER = "\u200B".repeat(ROLEPERKS_PANEL_VERSION);
const FOOTER_IMAGE_NAME = "banner.png";

function display(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function rolePerksPanel() {
  const container = new ContainerBuilder();
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${ROLEPERKS_IMAGE_NAME}`)
    )
  );
  container.addTextDisplayComponents(
    display(
      "> You can receive perks on our Discord and in-game server by having roles within our community. You are unable to purchase any roles listed here. We suggest looking at our marketplace if you wish to purchase perks for your Discord."
    ),
    display(ROLEPERKS_PANEL_MARKER)
  );
  container.addSeparatorComponents(divider());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("msrp_roleperks_select")
        .setPlaceholder("Select a role to view its perks")
        .addOptions(
          { label: "Server VIP Perks", description: "View the perks for being a VIP.", value: "vip" },
          { label: "Server Booster Perks", description: "View the perks of being a Supporter.", value: "booster" },
          { label: "Server Contributor Perks", description: "View the perks of being a Contributor.", value: "contributor" }
        )
    )
  );
  container.addSeparatorComponents(divider());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${FOOTER_IMAGE_NAME}`)
    )
  );
  return container;
}

function perksDetails(type) {
  const details = {
    vip: [
      "Access Booster Weapons.",
      "Access Booster Vehicles.",
      "Access whitelisted gear.",
      "Bypass anti-ping moderation.",
      "Permissions to stream in all voice calls.",
      "Access to exclusive chats.",
      "Image permissions in all channels.",
      "100,000 economy cash daily."
    ],
    booster: [
      "Access Booster Vehicles.",
      "Unlocks: Falcon Heritage Track, Surrey 650S, Falcon Heritage, Takeo Experience, Chevlon Corbeta 8, Averon LM/LR, Chevlon Corbeta RZR & Chevlon Corbeta X08.",
      "Access Booster Weapons.",
      "Unlocks: PPSH 41, M14, Remington 870 & Colt Python.",
      "Permissions to stream in all voice channels.",
      "75,000 economy cash."
    ],
    contributor: [
      "Access Booster Weapons.",
      "Access Booster Vehicles.",
      "Access whitelisted gear.",
      "Bypass anti-ping moderation.",
      "Permissions to stream in all voice calls.",
      "Access to exclusive chats.",
      "Image permissions in all channels.",
      "115,000 economy cash daily."
    ]
  };
  return details[type] || null;
}

function perksResponse(type) {
  const titles = {
    vip: "Server VIP Perks",
    booster: "Server Booster Perks",
    contributor: "Server Contributor Perks"
  };
  const container = new ContainerBuilder();
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${ROLEPERKS_IMAGE_NAME}`)
    )
  );
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display(`## ${titles[type]}`),
    display(perksDetails(type).map(item => `> ${item}`).join("\n"))
  );
  container.addSeparatorComponents(divider());
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${FOOTER_IMAGE_NAME}`)
    )
  );
  return container;
}

async function postOrRefreshRolePerksPanel(client) {
  const channel = await client.channels.fetch(ROLEPERKS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error(`Role Perks channel ${ROLEPERKS_CHANNEL_ID} could not be found or is not text-based.`);
    return;
  }

  const imagePath = path.join(__dirname, ROLEPERKS_IMAGE_SOURCE);
  const footerPath = path.join(__dirname, FOOTER_IMAGE_NAME);
  if (!fs.existsSync(imagePath)) {
    console.error(`Missing ${ROLEPERKS_IMAGE_SOURCE}. The Role Perks panel requires this image.`);
    return;
  }
  if (!fs.existsSync(footerPath)) {
    console.error(`Missing ${FOOTER_IMAGE_NAME}. The Role Perks panel requires the bottom banner.`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the Role Perks channel to check the panel.");
    return;
  }

  const botPanels = messages.filter(message =>
    message.author?.id === client.user.id && message.components?.length
  );
  const currentPanel = botPanels.find(message =>
    JSON.stringify(message.components || []).includes(ROLEPERKS_PANEL_MARKER)
  );
  if (currentPanel) {
    for (const duplicate of botPanels.values()) {
      if (duplicate.id !== currentPanel.id) await duplicate.delete().catch(() => {});
    }
    console.log("Role Perks panel is current. Leaving it unchanged.");
    return;
  }

  for (const panel of botPanels.values()) {
    await panel.delete().catch(error => console.error("Failed to delete old Role Perks panel:", error));
  }

  await channel.send({
    components: [rolePerksPanel()],
    files: [
      { attachment: imagePath, name: ROLEPERKS_IMAGE_NAME },
      { attachment: footerPath, name: FOOTER_IMAGE_NAME }
    ],
    flags: MessageFlags.IsComponentsV2
  });
  console.log("Role Perks panel posted or refreshed.");
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== "msrp_roleperks_select") return;
    const type = interaction.values[0];
    if (!perksDetails(type)) return;
    const imagePath = path.join(__dirname, ROLEPERKS_IMAGE_SOURCE);
    const footerPath = path.join(__dirname, FOOTER_IMAGE_NAME);
    if (!fs.existsSync(imagePath) || !fs.existsSync(footerPath)) {
      await interaction.reply({ content: "The Role Perks images are missing. Please notify staff.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    await interaction.reply({
      components: [perksResponse(type)],
      files: [
        { attachment: imagePath, name: ROLEPERKS_IMAGE_NAME },
        { attachment: footerPath, name: FOOTER_IMAGE_NAME }
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    }).catch(error => console.error("Role Perks selection error:", error));
  });
}

module.exports = { setup, postOrRefreshRolePerksPanel };
