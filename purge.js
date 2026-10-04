const DAY_MS = 24 * 60 * 60 * 1000;
const BULK_DELETE_MAX_AGE_MS = 14 * DAY_MS;

/**
 * Deletes `amount` messages plus the prefix command itself when provided.
 * The command message is never counted toward `amount`.
 */
async function purgeMessages(channel, amount, commandMessage = null, onBeforeDelete = null) {
  let remaining = amount;
  let deletedOthers = 0;
  const deletedMessages = [];

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining + (commandMessage ? 1 : 0), 100);
    const messages = await channel.messages.fetch({ limit: fetchLimit });
    if (!messages.size) break;

    const candidates = [...messages.values()].filter(message =>
      !commandMessage || message.id !== commandMessage.id
    );

    const selected = candidates.slice(0, remaining);
    if (!selected.length) break;

    if (onBeforeDelete) {
      for (const message of selected) {
        try { onBeforeDelete(message); } catch {}
      }
    }

    const recent = selected.filter(
      message => Date.now() - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS
    );
    const old = selected.filter(
      message => Date.now() - message.createdTimestamp >= BULK_DELETE_MAX_AGE_MS
    );

    if (recent.length) {
      if (recent.length === 1) {
        try {
          await recent[0].delete();
          deletedMessages.push(recent[0]);
          deletedOthers++;
          remaining--;
        } catch {}
      } else {
        try {
          const deletedCollection = await channel.bulkDelete(recent, true);
          for (const message of recent) {
            if (deletedCollection.has(message.id)) deletedMessages.push(message);
          }
          deletedOthers += deletedCollection.size;
          remaining -= deletedCollection.size;
        } catch (error) {
          console.error("Purge bulk-delete error:", error);
        }
      }
    }

    for (const oldMessage of old) {
      if (remaining <= 0) break;
      try {
        await oldMessage.delete();
        deletedMessages.push(oldMessage);
        deletedOthers++;
        remaining--;
      } catch {}
    }

    if (selected.length < Math.min(remaining + (commandMessage ? 1 : 0), 100)) break;
  }

  // The command message is extra: !purge 2 deletes the command + 2 other messages.
  if (commandMessage) {
    try {
      if (onBeforeDelete) onBeforeDelete(commandMessage);
      await commandMessage.delete();
      deletedMessages.push(commandMessage);
    } catch {}
  }

  return {
    deleted: deletedOthers + (commandMessage ? 1 : 0),
    deletedMessages,
  };
}

module.exports = { purgeMessages };
