DeadKernel: a quieter Discord (early build for a few friends; build date in the folder name)

Aditya's redesign of the Discord desktop app, built on Vesktop and Vencord. It changes how
Discord looks and is laid out. It doesn't send or store anything outside your machine.

ONE THING FIRST
This is a client mod. Mods are against Discord's terms of service. Bans for purely cosmetic mods
are rare, but you'd be running it on your real account, so decide for yourself. It doesn't do
anything on your account by itself: every action is a click you make.

INSTALL (about 2 minutes; tested on Windows, Mac untested)
1. Install Vesktop from https://vesktop.dev and log in as usual.
2. Download DeadKernel.zip from https://github.com/DeadKernel/Vencord/releases/latest and unzip
   it somewhere it can stay (e.g. Documents\DeadKernel).
3. In Vesktop: Settings > Vesktop Settings > Developer Options > Vencord Location > Change,
   pick the unzipped DeadKernel folder, and restart Vesktop.
To undo: the same setting > Reset, and restart. The regular Discord app is never touched.

UPDATES
New builds install themselves: when one is out you'll see "updated, click to restart". Now and
then a short announcement about a new build shows up as a notification.

TELEMETRY (only if you say yes)
Once, you'll be asked whether to share anonymous usage: which DeadKernel features you use, your
DeadKernel settings, and errors. Never names, IDs, servers, channels or messages. Settings >
Vencord > Plugins > DeadKernel shows exactly what would be sent, and switches it off.

YOUR FIRST FIVE MINUTES
- Home (top of the sidebar) is where you start: friends in voice, requests, who's online,
  recent DMs.
- The sidebar replaces the server list. Click a server and its channels open in a column beside
  it. The × on that column closes the column; your conversation stays open.
- Inside a server, only active channels show. "· N" after a category, or "Show all quiet
  channels", unfolds the rest. Click the server's name for invites, notification settings and
  leaving.
- Clicking a voice channel joins it.
- Right-click a person, group or channel > Add to Favorites (or the star in a conversation's
  header). Favorites are single things, not whole servers.
- Ctrl K jumps anywhere. Type ">" for actions (mark mentions read, mute this server, stop
  @everyone pings in big servers…). Ctrl U shows members. The inbox button is gone; Ctrl I still
  opens Discord's.

KNOWN GAPS
Discord's own Settings, Friends page and member list still look mostly like Discord. Threads
have no count in the header, and there's no "jump to new messages" bar yet.

IF SOMETHING LOOKS WRONG
Settings > Vencord > Plugins: "Sidebar" (the layout), "QuietLayout" (the chat), "Declutter"
(what's hidden), "HumanLayerTheme" (the look). Each can be switched off, and every option inside
switches live. If part of the layout breaks, it falls back to Discord's own.
Everything grows with the window; if it's too big or small for you, QuietLayout > Overall size.

FEEDBACK: DM Aditya (screenshots help; blur anything private)
- The first 10 minutes: what confused you, what you went looking for and couldn't find.
- Does the sidebar show what you actually care about, in the right order?
- Inside a server: are the right channels showing? Did you miss any?
- Home: useful, or do you skip it?
- Anything that felt slow, jumpy, or broke.
