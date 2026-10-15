const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const MARKETPLACE_CHANNEL_ID = "1527179486737600572";
const MARKETPLACE_BANNER = "marketplace.png";
const FOOTER_BANNER = "banner.png";
const DEFAULT_LINK = "https://melonly.com/doc/7513073312516280320";
const PANEL_MARKER = "\u200B".repeat(3);

function media(container, filename) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${filename}`)
    )
  );
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function buildMarketplacePanel() {
  const container = new ContainerBuilder();

  media(container, MARKETPLACE_BANNER);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "> We offer a range of products and services through the MSRP marketplace. All transactions are final. We do not offer refunds for purchases users no longer want. We only accept Robux payments; real-world money is not accepted at this time."
    )
  );

  container.addSeparatorComponents(divider());

  const menu = new StringSelectMenuBuilder()
    .setCustomId("msrp_marketplace_select")
    .setPlaceholder("View our marketplace...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Robux Donations").setDescription("View donation options").setValue("donations"),
      new StringSelectMenuOptionBuilder().setLabel("Custom Roles").setDescription("Request a custom role").setValue("custom_roles"),
      new StringSelectMenuOptionBuilder().setLabel("Sponsored Giveaway").setDescription("Promote your server").setValue("sponsored_giveaway"),
      new StringSelectMenuOptionBuilder().setLabel("Paid Advertisement").setDescription("Purchase an advertisement").setValue("paid_advertisement"),
      new StringSelectMenuOptionBuilder().setLabel("Instant Post").setDescription("Post an advertisement instantly").setValue("instant_post"),
      new StringSelectMenuOptionBuilder().setLabel("Queue Bypass").setDescription("Move your advertisement forward").setValue("queue_bypass"),
      new StringSelectMenuOptionBuilder().setLabel("Custom Channel").setDescription("Request a custom channel").setValue("custom_channel")
    );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("msrp_marketplace_claim").setLabel("Claim").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("msrp_marketplace_queue").setLabel("Queue").setStyle(ButtonStyle.Secondary).setDisabled(true)
    )
  );

  media(container, FOOTER_BANNER);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(PANEL_MARKER));
  return container;
}

async function ensureMarketplacePanel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = await guild.channels.fetch(MARKETPLACE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error("Marketplace channel could not be found or is not text-based.");
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.error("Could not read the marketplace channel to check its panel.");
    return;
  }

  const botPanels = messages.filter(message =>
    message.author?.id === client.user.id &&
    message.components?.length &&
    message.attachments?.some(attachment => attachment.name === MARKETPLACE_BANNER)
  );

  if (botPanels.some(message => JSON.stringify(message.components || []).includes(PANEL_MARKER))) {
    console.log("Current Marketplace panel detected. Leaving it in place.");
    return;
  }

  for (const panel of botPanels.values()) {
    await panel.delete().catch(error => console.error("Failed to replace old Marketplace panel:", error));
  }

  const bannerPath = path.join(__dirname, MARKETPLACE_BANNER);
  if (!fs.existsSync(bannerPath)) {
    console.error(`Missing ${MARKETPLACE_BANNER}. The Marketplace panel requires this image.`);
    return;
  }

  const files = [{ attachment: bannerPath, name: MARKETPLACE_BANNER }];
  const footerPath = path.join(__dirname, FOOTER_BANNER);
  if (fs.existsSync(footerPath)) files.push({ attachment: footerPath, name: FOOTER_BANNER });

  await channel.send({
    components: [buildMarketplacePanel()],
    files,
    flags: MessageFlags.IsComponentsV2,
  });
  console.log(botPanels.size
    ? "Outdated Marketplace panel replaced with the current layout."
    : "Marketplace panel posted because none was detected.");
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== "msrp_marketplace_select") return;
    await interaction.reply({
      content: `Marketplace links have not been created yet: ${DEFAULT_LINK}`,
      ephemeral: true,
    }).catch(() => {});
  });
}

module.exports = { setup, ensureMarketplacePanel };
