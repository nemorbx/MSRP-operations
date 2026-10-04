const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');

const STAFF_TEAM_ROLE_ID = '1528242210871447672';
const FEEDBACK_CHANNEL_ID = '1527189028791910520';
const FILLED_STAR_EMOJI_NAME = 'star_filled';
const NONFILLED_STAR_EMOJI_NAME = 'star_nonfilled';
const DATA_FILE = path.join(__dirname, 'staff-feedback.json');

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));

function loadFeedback() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}
function saveFeedback(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getStaffMembers(guild) {
  return guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(STAFF_TEAM_ROLE_ID));
}

function parseTarget(input) {
  const match = String(input || '').match(/<@!?(\d{15,25})>|^(\d{15,25})$/);
  return match ? match[1] : null;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthsAgo(ts, months) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

function getStarEmoji(guild, name) {
  const emoji = guild.emojis.cache.find(e => e.name === name);
  return emoji ? { id: emoji.id, name: emoji.name } : null;
}

function renderStars(guild, rating) {
  const filled = getStarEmoji(guild, FILLED_STAR_EMOJI_NAME);
  const empty = getStarEmoji(guild, NONFILLED_STAR_EMOJI_NAME);
  if (filled && empty) {
    return Array.from({ length: 5 }, (_, i) => i < rating ? `<:${filled.name}:${filled.id}>` : `<:${empty.name}:${empty.id}>`).join('');
  }
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function buildRatingButtons(guild, id, disabled = false) {
  const filled = getStarEmoji(guild, FILLED_STAR_EMOJI_NAME);
  const empty = getStarEmoji(guild, NONFILLED_STAR_EMOJI_NAME);
  return new ActionRowBuilder().addComponents(
    ...[1,2,3,4,5].map(n => {
      const button = new ButtonBuilder()
        .setCustomId(`stafffeedback:rate:${id}:${n}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
      if (filled && empty) {
        button.setEmoji({ id: filled.id, name: filled.name });
      } else {
        button.setLabel(`${n} Star${n === 1 ? '' : 's'}`);
      }
      return button;
    })
  );
}

function buildFeedbackCard({ reviewer, target, rating, feedback, createdAt, id }) {
  const stars = renderStars(target.guild, rating);
  const bannerPath = path.join(__dirname, 'banner.png');

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '## Staff Review',
        '',
        `**Staff Member:** ${target}`,
        `**Rating:** ${stars}`,
        `**Reason:** ${feedback}`,
        `Reviewed by ${reviewer}`,
      ].join('\n')
    )
  );

  if (fs.existsSync(bannerPath)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://banner.png')
      )
    );
  }

  return container;
}

const staffRatingCommand = new SlashCommandBuilder()
  .setName('staff-rating')
  .setDescription('View a staff member’s public rating profile.')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The staff member whose rating you want to view.')
      .setRequired(true)
  );

const feedbackCommand = new SlashCommandBuilder()
  .setName('feedback')
  .setDescription('Rate a staff member and leave feedback.')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The staff member you want to rate.')
      .setRequired(true)
  );

function buildRatingProfileCard({ target, ratings }) {
  const guild = target.guild;
  const total = ratings.length;
  const totalPoints = ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  const average = total ? totalPoints / total : 0;
  const roundedAverage = total ? average.toFixed(1) : '0.0';
  const counts = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: ratings.filter(item => Number(item.rating) === star).length,
  }));
  const breakdown = counts
    .map(({ star, count }) => `${renderStars(guild, star)}  **${count}**`)
    .join('\n');
  const thumb = target.displayAvatarURL({ extension: 'png', size: 256 });
  const rank = target.roles.cache
    .filter(role => role.id !== guild.id && role.id !== STAFF_TEAM_ROLE_ID)
    .sort((a, b) => b.position - a.position)
    .first();

  const container = new ContainerBuilder();
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Staff Rating\n${target}\n${rank ? `-# ${rank.name}` : '-# Staff Team'}`
        )
      )
      .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: thumb } }))
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Overall Rating\n**${roundedAverage} / 5.0**\n${renderStars(guild, Math.round(average))}\n\n**${total}** ${total === 1 ? 'rating' : 'ratings'}`
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### Rating Breakdown\n${breakdown}`)
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Public staff rating profile • Ratings are submitted by server members')
  );
  return container;
}

function setup(client) {
  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'feedback') {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in the server.', flags: MessageFlags.Ephemeral });
        const targetUser = interaction.options.getUser('user', true);
        const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!target || target.user.bot || !target.roles.cache.has(STAFF_TEAM_ROLE_ID)) {
          return interaction.reply({ content: 'You can only rate a member who has the Staff Team role.', flags: MessageFlags.Ephemeral });
        }
        if (target.id === interaction.user.id) {
          return interaction.reply({ content: 'You cannot rate yourself.', flags: MessageFlags.Ephemeral });
        }

        const now = Date.now();
        const all = loadFeedback();
        if (all.some(x => x.reviewerId === interaction.user.id && x.createdAt >= startOfDay(now))) {
          return interaction.reply({ content: 'You can only submit **one staff rating per day**.', flags: MessageFlags.Ephemeral });
        }
        if (all.some(x => x.reviewerId === interaction.user.id && x.targetId === target.id && x.createdAt >= monthsAgo(now, 1))) {
          return interaction.reply({ content: 'You can only rate the same staff member once per month.', flags: MessageFlags.Ephemeral });
        }

        const id = Math.random().toString(36).slice(2, 10).toUpperCase();
        pending.set(id, { reviewerId: interaction.user.id, targetId: target.id, createdAt: now });
        const stars = renderStars(interaction.guild, 5);
        const container = new ContainerBuilder();
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Staff Feedback\nRate ${target}\n\n${stars}`)
        );
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Select a rating from 1 to 5 stars.')
        );
        container.addActionRowComponents(buildRatingButtons(interaction.guild, id));
        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('stafffeedback:reason:')) {
        // Acknowledge the modal immediately so the Discord interaction does not
        // time out while the bot saves the feedback and posts the review card.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = interaction.customId.split(':')[2];
        const data = pending.get(id);
        if (!data) return interaction.editReply({ content: 'This feedback request has expired. Please run `/feedback @user` again.' });
        if (data.reviewerId !== interaction.user.id) return interaction.editReply({ content: 'Only the member who started this feedback can submit it.' });

        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!reason) return interaction.editReply({ content: 'A reason is required.' });

        const reviewer = await interaction.guild.members.fetch(data.reviewerId);
        const target = await interaction.guild.members.fetch(data.targetId).catch(() => null);
        if (!target || target.user.bot || !target.roles.cache.has(STAFF_TEAM_ROLE_ID)) {
          pending.delete(id);
          return interaction.editReply({ content: 'That staff member is no longer eligible to receive feedback.' });
        }
        const now = Date.now();
        const all = loadFeedback();
        if (all.some(x => x.reviewerId === reviewer.id && x.createdAt >= startOfDay(now))) {
          pending.delete(id);
          return interaction.editReply({ content: 'You already submitted a staff rating today.' });
        }
        if (all.some(x => x.reviewerId === reviewer.id && x.targetId === target.id && x.createdAt >= monthsAgo(now, 1))) {
          pending.delete(id);
          return interaction.editReply({ content: 'You already rated this staff member within the last month.' });
        }

        const record = { id, reviewerId: reviewer.id, targetId: target.id, rating: data.rating, feedback: reason, createdAt: now };
        all.push(record);
        saveFeedback(all);
        pending.delete(id);

        const channel = interaction.guild.channels.cache.get(FEEDBACK_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) return interaction.editReply({ content: 'Feedback was saved, but the configured staff feedback channel could not be found.' });
        const card = buildFeedbackCard({ reviewer: reviewer.user.username, target, rating: data.rating, feedback: reason, createdAt: now, id });
        await channel.send({
          components: [card],
          files: fs.existsSync(path.join(__dirname, 'banner.png'))
            ? [{ attachment: path.join(__dirname, 'banner.png'), name: 'banner.png' }]
            : [],
          flags: MessageFlags.IsComponentsV2
        });
        return interaction.editReply({ content: 'Your staff feedback has been submitted.' });
      }

      if (interaction.isButton() && interaction.customId.startsWith('stafffeedback:rate:')) {
        const [, , id, ratingText] = interaction.customId.split(':');
        const data = pending.get(id);
        if (!data) return interaction.reply({ content: 'This feedback request has expired. Please run `/feedback` again.', flags: MessageFlags.Ephemeral });
        if (data.reviewerId !== interaction.user.id) return interaction.reply({ content: 'Only the staff member who started this feedback can rate it.', flags: MessageFlags.Ephemeral });

        const reviewer = await interaction.guild.members.fetch(data.reviewerId);
        const target = await interaction.guild.members.fetch(data.targetId).catch(() => null);
        if (!target || !target.roles.cache.has(STAFF_TEAM_ROLE_ID)) {
          pending.delete(id);
          return interaction.update({ content: 'That staff member is no longer eligible to receive feedback.', components: [] });
        }

        const all = loadFeedback();
        const now = Date.now();
        if (all.some(x => x.reviewerId === reviewer.id && x.createdAt >= startOfDay(now))) {
          pending.delete(id);
          return interaction.update({ content: 'You already submitted a staff rating today.', components: [] });
        }
        if (all.some(x => x.reviewerId === reviewer.id && x.targetId === target.id && x.createdAt >= monthsAgo(now, 1))) {
          pending.delete(id);
          return interaction.update({ content: 'You already rated this staff member within the last month.', components: [] });
        }

        const rating = Number(ratingText);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return interaction.reply({ content: 'Please choose a rating from 1 to 5 stars.', flags: MessageFlags.Ephemeral });
        }

        pending.set(id, { ...data, rating });
        const modal = new ModalBuilder()
          .setCustomId(`stafffeedback:reason:${id}`)
          .setTitle(`Feedback • ${rating}/5 Stars`);
        const reason = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why are you giving this rating?')
          .setPlaceholder('Enter your feedback or reason...')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(1000)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reason));
        return interaction.showModal(modal);
      }
    } catch (error) {
      console.error('Staff feedback interaction error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Something went wrong while processing staff feedback.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

const pending = new Map();

module.exports = { setup, feedbackCommand, staffRatingCommand };
