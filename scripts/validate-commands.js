const assert = require("node:assert/strict");

const modules = {
  infractions: require("../infractions"),
  promotions: require("../promotions"),
  afk: require("../afk"),
  giveaway: require("../giveaway"),
  staffFeedback: require("../staff-feedback"),
  suggestions: require("../suggestions"),
  say: require("../say"),
  welcome: require("../welcome"),
  support: require("../support"),
  groupCommands: require("../group-commands"),
};

const rawCommands = [
  ...(modules.infractions.commands || []),
  ...(modules.promotions.promoteCommand ? [modules.promotions.promoteCommand] : []),
  ...(modules.afk.commands || []),
  ...(modules.giveaway.giveawayCommand ? [modules.giveaway.giveawayCommand] : []),
  ...(modules.staffFeedback.feedbackCommand ? [modules.staffFeedback.feedbackCommand] : []),
  ...(modules.staffFeedback.staffRatingCommand ? [modules.staffFeedback.staffRatingCommand] : []),
  ...(modules.suggestions.commands || []),
  ...(modules.say.command ? [modules.say.command] : []),
  ...(modules.welcome.commands || []),
  ...(modules.support.commands || []),
  ...(modules.groupCommands.commands || []),
];

const definitions = rawCommands.map(command =>
  typeof command?.toJSON === "function" ? command.toJSON() : command
);

assert.ok(definitions.length > 0, "No slash commands were exported.");

const names = definitions.map(command => command?.name);
assert.ok(names.every(name => typeof name === "string" && name.length > 0),
  "Every registered command must have a name.");

const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
assert.deepEqual([...new Set(duplicates)], [], "Slash command names must be unique.");

const requiredCommands = [
  "infract", "promote", "afk", "giveaway",
  "feedback", "staff-rating", "suggest", "say", "welcome", "escalate", "group",
];
for (const name of requiredCommands) {
  assert.ok(names.includes(name), `Required slash command is missing from registration: /${name}`);
}

for (const moduleName of Object.keys(modules)) {
  assert.equal(typeof modules[moduleName].setup, "function",
    `Module ${moduleName} must export a setup(client) function.`);
}

const afk = definitions.find(command => command.name === "afk");
const afkSubcommands = (afk.options || []).map(option => option.name);
for (const subcommand of ["set", "edit", "remove"]) {
  assert.ok(afkSubcommands.includes(subcommand),
    `/afk is missing the /${subcommand} subcommand.`);
}

console.log(`Validated ${definitions.length} unique slash commands and all registered setup modules.`);
console.log(names.map(name => `/${name}`).join(", "));
