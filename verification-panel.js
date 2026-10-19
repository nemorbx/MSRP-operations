const fs = require("fs");
const path = require("path");
const {
  MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
} = require("discord.js");

const CHANNEL_ID = "1528566337394446456";
const VERIFY_IMAGE = "verify.png";
const BANNER_IMAGE = "banner.png";
const MARKER = "\u200B".repeat(3);

function display(content) { return new TextDisplayBuilder().setContent(content); }
function divider() { return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large); }
function addImage(container, filename) {
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://" + filename)));
}
function panel() {
  const container = new ContainerBuilder();
  addImage(container, VERIFY_IMAGE);
  container.addTextDisplayComponents(
    display("Welcome to **Missouri State Roleplay**! Please verify to get access to the rest of the server."),
    display("Use **Bloxlink** below to link and verify your Roblox account.")
  );
  container.addSeparatorComponents(divider());
  addImage(container, BANNER_IMAGE);
  return container;
}
async function postOrRefreshVerificationPanel(client) {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(error => { console.error("[Verification] Could not fetch channel:", error); return null; });
  if (!channel || !channel.isTextBased() || !channel.messages) { console.error("[Verification] Channel missing or not text-based:", CHANNEL_ID); return; }
  const verifyPath = path.join(__dirname, VERIFY_IMAGE);
  const bannerPath = path.join(__dirname, BANNER_IMAGE);
  if (!fs.existsSync(verifyPath) || !fs.existsSync(bannerPath)) {
    console.error("[Verification] Missing image asset:", !fs.existsSync(verifyPath) ? VERIFY_IMAGE : BANNER_IMAGE);
    return;
  }
  const messages = await channel.messages.fetch({ limit: 100 }).catch(error => { console.error("[Verification] Could not read channel history:", error); return null; });
  if (!messages) return;
  const panels = [...messages.values()].filter(message => message.author?.id === client.user.id && (JSON.stringify(message.components || []).includes(MARKER) || message.attachments?.some(a => a.name === VERIFY_IMAGE)));
  if (panels.length) {
    // Keep the existing panel untouched on startup. This prevents restarts from
    // re-uploading images or reposting an unchanged verification panel.
    for (const duplicate of panels.slice(1)) {
      await duplicate.delete().catch(error => console.error("[Verification] Could not remove duplicate panel:", error));
    }
    console.log("[Verification] Existing panel found; left unchanged.");
    return;
  }

  await channel.send({
    components: [panel()],
    files: [{ attachment: verifyPath, name: VERIFY_IMAGE }, { attachment: bannerPath, name: BANNER_IMAGE }],
    flags: MessageFlags.IsComponentsV2,
  });
  console.log("[Verification] Panel posted because no existing panel was found.");
}

module.exports = { postOrRefreshVerificationPanel };