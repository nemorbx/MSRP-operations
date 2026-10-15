const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const command = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Send a message as MSRP Automations.")
  .addStringOption(option =>
    option
      .setName("message")
      .setDescription("The message to send.")
      .setRequired(true)
  );

async function isBotOwner(client, userId) {
  try {
    let allowedUserId = process.env.SAY_USER_ID;

    if (!allowedUserId) {
      await client.application.fetch();
      const owner = client.application.owner;

      if (owner?.members) {
        return owner.members.has(userId);
      }

      allowedUserId = owner?.id || null;
    }

    return Boolean(allowedUserId && userId === allowedUserId);
  } catch (error) {
    console.error("Unable to verify say command owner:", error);
    return false;
  }
}

async function setup(client) {
  // !say is a bot-owner-only prefix command.
  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;
    const parts = message.content.trim().split(/\s+/);
    if (parts[0].toLowerCase() !== "!say") return;

    const content = message.content.trim().slice(parts[0].length).trim();
    if (!content) return;

    const isOwner = await isBotOwner(client, message.author.id);
    if (!isOwner) return;

    await message.delete().catch(() => {});
    await message.channel.send({ content }).catch(error => {
      console.error("!say error:", error);
    });
  });

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "say") return;

    // Acknowledge immediately so Discord does not time out while owner/permissions are checked.
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.inGuild() || !interaction.channel) {
        await interaction.editReply("This command can only be used inside the server.");
        return;
      }

      let allowedUserId = process.env.SAY_USER_ID;
      if (!allowedUserId) {
        await client.application.fetch();
        const owner = client.application.owner;
        allowedUserId = owner?.id || null;
      }

      if (!allowedUserId || interaction.user.id !== allowedUserId) {
        await interaction.editReply("You don't have permission to use this command.");
        return;
      }

      const message = interaction.options.getString("message", true).trim();
      if (!message) {
        await interaction.editReply("Please provide a message to send.");
        return;
      }

      await interaction.channel.send({ content: message });
      await interaction.editReply("Message sent successfully.");
    } catch (error) {
      console.error("/say error:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("I couldn't send that message. Check the bot's channel permissions and try again.").catch(() => {});
      } else {
        await interaction.reply({
          content: "I couldn't send that message. Check the bot's channel permissions and try again.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  });;
}

module.exports = { setup, command };
