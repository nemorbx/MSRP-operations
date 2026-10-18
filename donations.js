const fs = require("fs");
const path = require("path");
const { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require("discord.js");
const FILE = path.join(__dirname, "data", "donations.json");
const LEADERBOARD = "1527179486737600572";
const SUPPORTERS = "1527194109494693938";
const DONATOR_ROLE = "1552174252093087784";
const STAFF_ROLE_NAME = "Senior High Rank";
const TOP_URL = "https://raw.githubusercontent.com/nemorbx/MSRP-operations/main/donor.png";
const FOOTER = path.join(__dirname, "donor-banner.png");
function load() { fs.mkdirSync(path.dirname(FILE), {recursive:true}); if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({donors:{}}, null, 2)); try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {donors:{}}; } }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }
function banner(url) { return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url)); }
function topThree(d) { return Object.entries(d.donors || {}).map(([id,v]) => ({id,amount:Number(v.amount)||0})).filter(x => x.amount > 0).sort((a,b) => b.amount-a.amount).slice(0,3); }
function makePanel(d) {
  const top = topThree(d);
  const lines = [1,2,3].map((n,i) => {
    const entry = top[i];
    return entry
      ? "> `` " + n + ". `` " + entry.amount.toLocaleString("en-US") + " Robux"
      : "> `` " + n + ". `` N/A (0 Robux)";
  }).join("\n");
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Donation Leaderboard"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("> We'd like to thank all of our donators, the people above are the **top three highest donators** to Missouri State Roleplay."))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addMediaGalleryComponents(banner("attachment://donor-banner.png"));
  return {components:[c],flags:MessageFlags.IsComponentsV2,files:[new AttachmentBuilder(FOOTER,{name:"donor-banner.png"})],allowedMentions:{parse:[]}};
}
async function refresh(client,guild) {
  const ch = await guild.channels.fetch(LEADERBOARD).catch(()=>null);
  if (!ch || !ch.isTextBased() || !fs.existsSync(FOOTER)) { console.error("[Donations] Leaderboard channel or donor-banner.png unavailable."); return; }
  const msgs = await ch.messages.fetch({limit:100}).catch(()=>null);
  const old = msgs?.find(m => m.author.id === client.user.id && JSON.stringify(m.components || []).includes("Donation Leaderboard"));
  const p = makePanel(load());
  if (old) await old.edit(p);
  else await ch.send(p);
}
async function runCommand(client,m) {
  const parts=m.content.trim().split(/\s+/);
  const target=m.mentions.members.first();
  const staff=m.guild.roles.cache.find(r=>r.name.toLowerCase()===STAFF_ROLE_NAME.toLowerCase());
  if(!staff||!m.member.roles.cache.has(staff.id)){await m.reply("You don't have permission to use donation commands.").catch(()=>{});return;}
  const d=load();
  if((parts[1]||"").toLowerCase()==="remove"){
    if(!target||parts.length!==3){await m.reply("Usage: !donate remove @user").catch(()=>{});return;}
    if(!d.donors[target.id]){await m.reply("That user is not on the donation leaderboard.").catch(()=>{});return;}
    delete d.donors[target.id];save(d);
    const role=m.guild.roles.cache.get(DONATOR_ROLE);
    if(role)await target.roles.remove(role,"Donation record removed").catch(e=>console.error("[Donations] Remove role failed",e));
    await refresh(client,m.guild);
    await m.reply("Removed them from the leaderboard and removed the Donator role.").catch(()=>{});
    return;
  }
  const amount=Number(parts[2]);
  if(!target||parts.length!==3||!Number.isSafeInteger(amount)||amount<1){await m.reply("Usage: !donate @user <Robux amount> or !donate remove @user").catch(()=>{});return;}
  d.donors[target.id]={amount:(Number(d.donors[target.id]?.amount)||0)+amount};save(d);
  const role=m.guild.roles.cache.get(DONATOR_ROLE);
  if(role)await target.roles.add(role,"Recorded donation").catch(e=>console.error("[Donations] Add role failed",e));
  if(fs.existsSync(FOOTER)){
    const ch=await m.guild.channels.fetch(SUPPORTERS).catch(()=>null);
    if(ch?.isTextBased()){
      const c=new ContainerBuilder()
        .addMediaGalleryComponents(banner(TOP_URL))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Thank You for Donating!\n<@"+target.id+"> donated **"+amount.toLocaleString("en-US")+" Robux** to Missouri State Roleplay!"))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
        .addMediaGalleryComponents(banner("attachment://donor-banner.png"));
      await ch.send({components:[c],flags:MessageFlags.IsComponentsV2,files:[new AttachmentBuilder(FOOTER,{name:"donor-banner.png"})],allowedMentions:{users:[target.id]}});
    }
  }
  await refresh(client,m.guild);
  await m.reply("Recorded "+amount.toLocaleString("en-US")+" Robux. Total: "+d.donors[target.id].amount.toLocaleString("en-US")+" Robux.").catch(()=>{});
}
function setup(client) {
  client.on("messageCreate", async m => {
    if(m.author.bot||!m.guild||!/^!donate(?:\s|$)/i.test(m.content.trim())) return;
    try { await runCommand(client,m); }
    catch(e) { console.error("[Donations] Command failed:",e); await m.reply("Donation command failed; check bot logs.").catch(()=>{}); }
  });
}
async function ensureDonationPanel(client) { const g=client.guilds.cache.first(); if(g) await refresh(client,g); }
module.exports = { setup, ensureDonationPanel };