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
    display("Use **Bloxlink** below to link and verify your Roblox account. " + MARKER)
  );
  container.addSeparatorComponents(divider());
  addImage(container, BANNER_IMAGE);
  return container;
}
async function postOrRefreshVerificationPanel(client, options = {}) {
  const forceRefresh = options.forceRefresh === true;
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
  const panels = [...messages.values()]
    .filter(message => message.author?.id === client.user.id && (
      JSON.stringify(message.components || []).includes(MARKER) ||
      message.attachments?.some(a => a.name === VERIFY_IMAGE) ||
      JSON.stringify(message.components || []).includes("verify.png")
    ))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (panels.length && !forceRefresh) {
    // Keep the oldest known panel and remove every later duplicate.
    const keep = panels[0];
    let failed = false;
    for (const duplicate of panels.slice(1)) {
      try { await duplicate.delete(); }
      catch (error) { failed = true; console.error("[Verification] Could not remove duplicate panel " + duplicate.id + ":", error); }
    }
    if (failed) {
      console.error("[Verification] Duplicate cleanup was incomplete; not posting another panel.");
      return;
    }
    console.log("[Verification] Existing panel " + keep.id + " retained; duplicates removed: " + (panels.length - 1) + ".");
    return;
  }

  if (forceRefresh) {
    for (const oldPanel of panels) {
      try { await oldPanel.delete(); }
      catch (error) {
        console.error("[Verification] Could not delete old panel " + oldPanel.id + "; replacement cancelled:", error);
        return;
      }
    }
  }

  await channel.send({
    components: [panel()],
    files: [{ attachment: verifyPath, name: VERIFY_IMAGE }, { attachment: bannerPath, name: BANNER_IMAGE }],
    flags: MessageFlags.IsComponentsV2,
  });
  console.log(forceRefresh ? "[Verification] Panel force-refreshed; one replacement posted." : "[Verification] Panel posted because no existing panel was found.");
}

module.exports = { postOrRefreshVerificationPanel };