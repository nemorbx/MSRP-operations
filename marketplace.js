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
  // Match the reference: generous divider spacing between the dropdown,
  // disabled buttons, and footer banner. Keep the top banner tight to the text.
  container.addSeparatorComponents(divider());
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("msrp_marketplace_claim").setLabel("Claim").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("msrp_marketplace_queue").setLabel("Queue").setStyle(ButtonStyle.Secondary).setDisabled(true)
  ));
  container.addSeparatorComponents(divider());
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

    let title;
    let body;
    let details = [];

    if (interaction.values[0] === "donations") {
      title = "Robux Donations";
      body = [
        "[Donation 100R$](https://www.roblox.com/game-pass/2037393622/Donation-100)",
        "[Donation 250R$](https://www.roblox.com/game-pass/2040609100/Donation-250)",
        "[Donation 350R$](https://www.roblox.com/game-pass/2037951588/Donation-350)",
        "[Donation 500R$](https://www.roblox.com/game-pass/2036661563/Donation-500)",
        "[Donation 750R$](https://www.roblox.com/game-pass/2040261141/Donation-750)",
        "[Donation 1000R$](https://www.roblox.com/game-pass/2037513620/Donation-1000)",
        "[Donation 2000R$](https://www.roblox.com/game-pass/2037855580/Donation-2000)",
        "[Donation 2500R$](https://www.roblox.com/game-pass/2037015565/Donation-2500)",
        "[Donation 5000R$](https://www.roblox.com/game-pass/2039739347/Donation-5000)",
        "[Donation 10000R$](https://www.roblox.com/game-pass/2039799354/Donation-10000)"
      ].join("\n");
      details = [
        ["Cash Donations", "Coming soon..."],
        ["Purchase Notice", "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment."]
      ];
    } else if (interaction.values[0] === "custom_roles") {
      title = "Custom Roles";
      body = "Obtain a custom role.\nMust not contain NSFW content.\nMust not include advertisements.\nMust follow our server regulations.\n\n[Click here to purchase](https://www.roblox.com/game-pass/2036823565)";
      details = [["Purchase Notice", "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment."]];
    } else {
      title = "Paid Advertisement";
      body = "Receive an everyone ping to promote your server.\n\n[Click here to purchase](https://www.roblox.com/game-pass/2040753089/Paid-Advertisement)";
      details = [["Purchase Notice", "Purchases must be redeemed within 24 hours. You must purchase the assets linked through this page; anything else will be denied as invalid payment."]];
    }

    const container = new ContainerBuilder();
    const bannerPath = path.join(__dirname, MARKETPLACE_BANNER);
    const footerPath = path.join(__dirname, FOOTER_BANNER);
    const files = [];
    if (fs.existsSync(bannerPath)) {
      files.push({ attachment: bannerPath, name: MARKETPLACE_BANNER });
      media(container, MARKETPLACE_BANNER);
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("## " + title));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    for (const [fieldTitle, fieldValue] of details) {
      container.addSeparatorComponents(divider());
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent("### " + fieldTitle + "\n" + fieldValue));
    }
    container.addSeparatorComponents(divider());
    if (fs.existsSync(footerPath)) {
      files.push({ attachment: footerPath, name: FOOTER_BANNER });
      media(container, FOOTER_BANNER);
    }

    await interaction.reply({
      components: [container],
      files,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    }).catch(error => console.error("Marketplace selection response failed:", error));
  });
}

module.exports = { setup, ensureMarketplacePanel };
