const fs = require("fs");
const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, EmbedBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } = require("discord.js");

const MARKETPLACE_CHANNEL_ID = "1527179486737600572";
const MARKETPLACE_BANNER = "marketplace.png";
const FOOTER_BANNER = "banner.png";
const DEFAULT_LINK = "https://melonly.com/doc/7513073312516280320";
const PANEL_MARKER = "\u200B".repeat(3);

function media(container, filename) {
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://" + filename)));
}

function divider() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function buildMarketplacePanel() {
  const container = new ContainerBuilder();
  media(container, MARKETPLACE_BANNER);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("> We offer a range of products and services through the MSRP marketplace. All transactions are final. We do not offer refunds for purchases users no longer want. We only accept Robux payments; real-world money is not accepted at this time. " + PANEL_MARKER));
  container.addSeparatorComponents(divider());
  const menu = new StringSelectMenuBuilder().setCustomId("msrp_marketplace_select").setPlaceholder("View our marketplace...").addOptions(
    new StringSelectMenuOptionBuilder().setLabel("Donations").setDescription("View Robux donation options").setValue("donations"),
    new StringSelectMenuOptionBuilder().setLabel("Custom Roles").setDescription("View custom role details").setValue("custom_roles"),
    new StringSelectMenuOptionBuilder().setLabel("Paid Advertisement").setDescription("View advertisement details").setValue("paid_advertisement")
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("msrp_marketplace_claim").setLabel("Claim").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("msrp_marketplace_queue").setLabel("Queue").setStyle(ButtonStyle.Secondary).setDisabled(true)
  ));
  media(container, FOOTER_BANNER);
  return container;
}

async function ensureMarketplacePanel(client) {
  const channel = await client.channels.fetch(MARKETPLACE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.messages) { console.error("Marketplace channel could not be found or is not text-based."); return; }
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) { console.error("Could not read the marketplace channel to check its panel."); return; }
  const botPanels = messages.filter(message => message.author?.id === client.user.id && message.components?.length && message.attachments?.some(attachment => attachment.name === MARKETPLACE_BANNER));
  const existingPanel = botPanels.first();
  const bannerPath = path.join(__dirname, MARKETPLACE_BANNER);
  if (!fs.existsSync(bannerPath)) { console.error("Missing " + MARKETPLACE_BANNER + ". The Marketplace panel requires this image."); return; }
  const files = [{ attachment: bannerPath, name: MARKETPLACE_BANNER }];
  const footerPath = path.join(__dirname, FOOTER_BANNER);
  if (fs.existsSync(footerPath)) files.push({ attachment: footerPath, name: FOOTER_BANNER });
  const payload = { components: [buildMarketplacePanel()], files, attachments: [], flags: MessageFlags.IsComponentsV2 };
  if (existingPanel) {
    await existingPanel.edit(payload);
    for (const duplicate of botPanels.filter(message => message.id !== existingPanel.id).values()) await duplicate.delete().catch(error => console.error("Failed to remove duplicate Marketplace panel:", error));
    console.log("Existing Marketplace panel updated in place; duplicates cleaned up.");
  } else {
    await channel.send(payload);
    console.log("Marketplace panel posted because none was detected.");
  }
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== "msrp_marketplace_select") return;

    let embed;
    if (interaction.values[0] === "donations") {
      embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Robux Donations")
        .setDescription([
          "[Donation 100R$](" + DEFAULT_LINK + ")",
          "[Donation 250R$](" + DEFAULT_LINK + ")",
          "[Donation 350R$](" + DEFAULT_LINK + ")",
          "[Donation 500R$](" + DEFAULT_LINK + ")",
          "[Donation 750R$](" + DEFAULT_LINK + ")",
          "[Donation 1000R$](" + DEFAULT_LINK + ")",
          "[Donation 2000R$](" + DEFAULT_LINK + ")",
          "[Donation 2500R$](" + DEFAULT_LINK + ")",
          "[Donation 5000R$](" + DEFAULT_LINK + ")",
          "[Donation 10000R$](" + DEFAULT_LINK + ")"
        ].join("\\n"))
        .addFields(
          { name: "Cash Donations", value: "Coming soon..." },
          { name: "Purchase Notice", value: "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment." }
        );
    } else if (interaction.values[0] === "custom_roles") {
      embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Custom Roles")
        .setDescription("Obtain a custom role.\\nMust not contain NSFW content.\\nMust not include advertisements.\\nMust follow our server regulations.\\n\\n[Click here to purchase](" + DEFAULT_LINK + ")")
        .addFields({ name: "Purchase Notice", value: "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment." });
    } else {
      embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Paid Advertisement")
        .setDescription("Receive an everyone ping to promote your server.\\n\\n[Click here to purchase](" + DEFAULT_LINK + ")")
        .addFields({ name: "Purchase Notice", value: "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment." });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  });
}

module.exports = { setup, ensureMarketplacePanel };