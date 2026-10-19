const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
const REGULATIONS_PANEL_VERSION = 4;
const REGULATIONS_PANEL_MARKER = "\u200B".repeat(REGULATIONS_PANEL_VERSION);

function display(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  // Give each regulation section more breathing room, matching the reference layout.
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
}

function privateTextPage(title, body) {
  const container = new ContainerBuilder();
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
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${BANNER_NAME}`)
    )
  );
}

function mainPanel(guild) {
  const container = new ContainerBuilder();

  // Match the reference layout: banner first, with no title or divider above it.
  addBanner(container);
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(
    display("> Whilst engaging with anyone on our server or playing our in-game server, you're required to follow a strictly moderated set of regulations that **must not be broken**."),
    display("> The maximum amount of moderations that you can receive is **``75``**, in the event you reach this amount you will be banned from our community." + REGULATIONS_PANEL_MARKER)
  );

  // Keep the two categories in separate, emoji-free dropdown menus.
  container.addSeparatorComponents(divider());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("msrp_reg_select_server")
        .setPlaceholder("Server Regulations")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: "Discord Regulations", description: "View our Discord Regulations...", value: "discord" },
          { label: "In-game Regulations", description: "View our In-game Regulations...", value: "game" }
        )
    )
  );

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("msrp_reg_select_banned")
        .setPlaceholder("Banned Items")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: "Banned Weapons", description: "View our Banned Weapons...", value: "weapons" },
          { label: "Banned Vehicles", description: "View our Banned Vehicles...", value: "vehicles" },
          { label: "Banned Roleplays", description: "View our Banned Roleplays...", value: "roleplays" }
        )
    )
  );
  container.addSeparatorComponents(divider());
  addBottomBanner(container);
  return container;
}

function splitTextDisplay(content, maxLength = 3900) {
  const chunks = [];
  let remaining = String(content ?? "");

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length || chunks.length === 0) chunks.push(remaining);
  return chunks.map(display);
}

function privatePage(guild, title, intro, sections) {
  const container = new ContainerBuilder();
  // Keep each text display comfortably within Discord's component limits.
  container.addSeparatorComponents(divider());
  addBanner(container);
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(...splitTextDisplay(intro, 3500));
  for (const section of sections) {
    container.addSeparatorComponents(divider());
    const heading = String(section.title || "Regulations").slice(0, 40);
    // Keep the heading and body in the same text display to reduce the total
    // number of container components. Discord limits each container to 40.
    container.addTextDisplayComponents(
      ...splitTextDisplay("### " + heading + "\n" + String(section.body ?? ""), 3500)
    );
  }
  addBottomBanner(container);
  return container;
}

function bullets(lines) {
  return lines.map(line => "- " + line).join("\n");
}

function getPage(guild, id) {
  switch (id) {
    case "discord":
      return privatePage(guild, "DISCORD REGULATIONS",
        "Whilst engaging with anyone in our Discord server, you must follow these regulations.",
        [
          { title: "Display Names", body: "You are required to have your Discord display name match your Roblox username. You will be automatically loaded in-game if you do not link your account." },
          { title: "Respect Others", body: "Remain respectful to both members and staff inside our community. We will moderate you if we find you being disrespectful." },
          { title: "Hate Speech", body: "Racist, homophobic, or genderphobic comments are prohibited. Keep these comments outside of our community." },
          { title: "NSFW Content", body: "Sharing content made for adults will result in a permanent ban. We do not condone this inside our community." },
          { title: "Self Promotion", body: "DM advertising or advertising inside any of our channels will result in a ban from our communications." },
          { title: "Rule Enforcement", body: "Staff reserve the right to moderate you if you violate our server regulations." },
          { title: "Language", body: "Our community is English only. You are only permitted to speak English within our channels." },
          { title: "Alt Accounts", body: "You are allowed one account per person inside our server. If you are found to have multiple accounts, we will remove all accounts." },
          { title: "Common Sense", body: "Just because a rule is not written down does not mean we do not moderate it. Use common sense." },
          { title: "Voice Chat", body: "Do not abuse soundboards, voice calls, or voice filters inside our calls." },
          { title: "Causing Drama", body: "Keep drama outside of our server. This keeps our community clean without having outside drama constantly brought to our chats." },
          { title: "Terms of Service", body: "You are required to follow Discord's Terms of Service at all times whilst on our community." },
          { title: "Direct Message Moderation", body: "We do not moderate members' DMs unless it violates Discord's Terms of Service or involves a staff member. If DMs involve a staff member, staff may initiate an investigation." }
        ]);

    case "game":
      return privatePage(guild, "IN-GAME REGULATIONS",
        "These regulations apply to all members playing on the MSRP ER:LC server.",
        [
          { title: "Random Deathmatch", body: "You must only kill someone with valid reasoning or roleplay intent behind it." },
          { title: "Vehicle Deathmatch", body: "You must have a valid reason when pitting, damaging, ramming, or spiking a player's vehicle." },
          { title: "New Life Rule", body: "You cannot continue the same life after you die. You must forget all details and roleplay as a new person when you die. NLR can be voided after 5 minutes." },
          { title: "Fear Roleplay", body: "When a player is holding your character at gunpoint, you must roleplay some level of fear, even if you do not feel majorly threatened." },
          { title: "Meta-Gaming", body: "Using details obtained from staff or through outside means, such as Discord, cannot be used whilst inside your roleplay." },
          { title: "Safe Zones", body: "All spawn zones are classified as safe zones. Damaging players, vehicles, or roleplaying in these zones is strictly prohibited." },
          { title: "In-game Assets", body: "You are required to use the in-game assets provided by MSRP, not the basic ER:LC assets. Using unauthorized liveries or uniforms may result in moderation." },
          { title: "Unrealistic Avatars", body: "You must wear a realistic avatar whilst in-game. Extra-large avatars, animals, femboys, furries, and similar unrealistic avatars are not permitted." },
          { title: "Cuff Rushing", body: "You are required to say some form of “cuffs” before or shortly after detaining someone." },
          { title: "Restricted Roleplays", body: "You must have permission to conduct **Hostage**, **Bank**, **Jewellery**, and **Roadwork/Construction** roleplays. Request permission using `/roleplay request` before starting one." },
          { title: "Cuff Rushing / Cuff Motion", body: "MSRP no longer moderates **cuff rushing or cuff motion** following Roblox's age-group changes. These behaviors will not be moderated by our staff." },
          { title: "314 Cave", body: "Roleplaying inside the **314 cave** may result in a warning or further moderation because it creates unrealistic and unfair advantages over whitelisted members and others." },
          { title: "Terms of Service", body: "Violating Roblox's or the Police Roleplay Community's Terms of Service will result in a ban from our server." }
        ]);

    case "vehicles":
      return privatePage(guild, "VEHICLE REGULATIONS",
        "Vehicles inside MSRP are subject to separate sets of regulations. You must meet at least one of the applicable requirements to use a restricted vehicle; otherwise, you may be moderated and expected to change it.",
        [
          { title: "Whitelisted Vehicles", body: bullets([
            "Emergency Services Falcon Advance+",
            "SWAT Armored Truck",
            "Mobile Command Center"
          ]) },
          { title: "Booster Vehicles", body: bullets([
            "Falcon Heritage Track",
            "Surrey 650S",
            "Falcon Heritage",
            "Takeo Experience",
            "Chevlon Corbeta 8",
            "Averon LM/LM R",
            "Chevlon Corbeta RZR",
            "Chevlon Corbeta X08",
            "Strugatti Ettore (High Ranking members must also be boosters)",
            "Kovac Heledera (High Ranking members must also be boosters)"
          ]) },
          { title: "Banned Vehicles", body: bullets([
            "Poa Car",
            "Redline Rearmount Ladder",
            "Falcon Advance 600 Pumper",
            "Chevlon L15 Brush Truck",
            "Chevlon Corbeta 1M Edition",
            "Lawn Mower"
          ]) }
        ]);

    case "weapons":
      return privatePage(guild, "WEAPON REGULATIONS",
        "Weapons inside MSRP are subject to separate sets of regulations. You must meet at least one of the applicable requirements to use a restricted weapon; otherwise, you may be moderated and expected to change it.",
        [
          { title: "Whitelisted Weapons", body: bullets([
            "Orsis T 5000",
            "Benelli M4",
            "G36C",
            "Kahr CW9",
            "Fabarm FP6"
          ]) },
          { title: "Booster Weapons", body: bullets([
            "PPSH 41",
            "M14",
            "Remington 870",
            "Colt Python"
          ]) },
          { title: "Banned Weapons", body: bullets([
            "M249",
            "Remington MSR",
            "Remington 700",
            "SPAS 12"
          ]) }
        ]);

    case "roleplays":
      return privatePage(guild, "BANNED ROLEPLAYS",
        "Conducting any of the roleplays listed below will result in a permanent ban from MSRP. These roleplays are heavily restricted and will not be tolerated under any circumstances.",
        [
          { title: "Appealable Ban", body: bullets([
            "Animal Abuse Roleplay",
            "Suicide Roleplay",
            "ICE Roleplay",
            "Torture Roleplay",
            "Animal Roleplay",
            "DUI Roleplay"
          ]) },
          { title: "Un-appealable Ban", body: bullets([
            "Furry Roleplay",
            "Femboy Roleplay",
            "Drug Roleplay",
            "Bomb Roleplay",
            "Terrorism Roleplay",
            "NSFW Roleplay"
          ]) }
        ]);

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
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(display("Official MSRP jurisdiction map."));
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

async function ensureRegulationsPanel(client) {
  const channel = await client.channels.fetch(REGULATIONS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased() || typeof channel.messages?.fetch !== "function") {
    console.error("Regulations channel could not be found or is not a readable text channel.");
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(error => {
    console.error("Could not inspect the Regulations channel:", error);
    return null;
  });
  if (!messages) return;

  const isRegulationsPanel = message => {
    if (message.author?.id !== client.user.id || !message.components?.length) return false;
    const hasBanner = message.attachments?.some(attachment => attachment.name === REGULATIONS_BANNER_NAME);
    const hasRegulationsMenu = message.components.some(row =>
      (row.components || []).some(component => component.customId === "msrp_reg_select_server")
    );
    return Boolean(hasBanner || hasRegulationsMenu);
  };

  const panels = messages.filter(isRegulationsPanel);
  const keep = panels.first();
  const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);
  const bannerPath = path.join(__dirname, BANNER_NAME);

  if (!fs.existsSync(regulationsBannerPath)) {
    console.error(`Missing ${REGULATIONS_BANNER_NAME}; cannot create or update the Regulations panel.`);
    return;
  }

  const files = [{ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME }];
  if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: BANNER_NAME });

  if (keep) {
    // Persistent panel: leave the existing message untouched during startup.
    // Only the explicit panel-update command may replace it.
    for (const duplicate of panels.filter(message => message.id !== keep.id).values()) {
      await duplicate.delete().catch(error => console.error("Failed to remove duplicate Regulations panel:", error));
    }
    console.log("[Panel Startup] Regulations panel already exists; no panel sent or edited.");
    return;
  }

  await channel.send({
    components: [mainPanel(channel.guild)],
    files,
    flags: MessageFlags.IsComponentsV2,
  });
  console.log("Regulations panel was missing, so one panel was posted.");
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
    console.error("Could not read the regulations channel to update the panel.");
    return;
  }

  const regulationsBannerPath = path.join(__dirname, REGULATIONS_BANNER_NAME);
  const bannerPath = path.join(__dirname, BANNER_NAME);

  if (!fs.existsSync(regulationsBannerPath)) {
    console.error(`Missing ${REGULATIONS_BANNER_NAME}. The regulations panel requires this top image.`);
    return;
  }

  // THIS FUNCTION IS ONLY FOR AN EXPLICIT REGULATIONS UPDATE.
  // When updating, remove the existing bot panel(s), then post exactly one replacement.
  const oldPanels = messages.filter(message => {
    if (message.author?.id !== client.user.id || !message.components?.length) return false;
    const hasBanner = message.attachments?.some(attachment => attachment.name === REGULATIONS_BANNER_NAME);
    const hasRegulationsMenu = message.components.some(row =>
      (row.components || []).some(component =>
        component.customId === "msrp_reg_select_server" ||
        component.customId === "msrp_reg_select_banned"
      )
    );
    return Boolean(hasBanner || hasRegulationsMenu);
  });

  for (const panel of oldPanels.values()) {
    try {
      await panel.delete();
    } catch (error) {
      console.error("Failed to delete old Regulations panel " + panel.id + "; update cancelled to prevent stacking:", error);
      throw new Error("Could not remove every old Regulations panel. Check bot permissions in the regulations channel.");
    }
  }

  const files = [{ attachment: regulationsBannerPath, name: REGULATIONS_BANNER_NAME }];
  if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: BANNER_NAME });

  await channel.send({
    components: [mainPanel(guild)],
    files,
    flags: MessageFlags.IsComponentsV2,
  });

  console.log(`Regulations panel updated. Deleted ${oldPanels.size} existing panel(s) and posted one replacement.`);
}

function setup(client) {
  client.on("interactionCreate", async interaction => {
    if (
      !interaction.isButton() &&
      !interaction.isStringSelectMenu()
    ) return;
    if (!interaction.customId.startsWith("msrp_reg_")) return;

    try {
      const id = interaction.isStringSelectMenu()
        ? interaction.values[0]
        : interaction.customId.replace("msrp_reg_", "");

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
      console.error("[Regulations] Failed to render dropdown page", {
        selectedValue: interaction.isStringSelectMenu() ? interaction.values?.[0] : interaction.customId,
        error: error?.stack || error?.message || String(error)
      });

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

module.exports = { setup, ensureRegulationsPanel, postOrRefreshPanel };
