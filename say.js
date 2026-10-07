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
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "say") return;

    try {
      if (!interaction.guild || !interaction.member) {
        await interaction.reply({
          content: "This command can only be used inside the server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // /say is restricted to the bot owner.
      // You can optionally set SAY_USER_ID in .env to explicitly define the allowed user.
      let allowedUserId = process.env.SAY_USER_ID;

      if (!allowedUserId) {
        await client.application.fetch();
        const owner = client.application.owner;
        allowedUserId = owner && owner.id ? owner.id : null;
      }

      if (!allowedUserId || interaction.user.id !== allowedUserId) {
        await interaction.reply({
          content: "You don't have permission to use this command.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const message = interaction.options.getString("message", true);
      await interaction.channel.send({ content: message });

      await interaction.reply({
        content: "Message sent successfully.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("/say error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "I couldn't send that message. Make sure I have permission to send messages in this channel.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });
}

module.exports = { setup, command };
