# teams-chat-exporter-browser-console

Export a Microsoft Teams web chat to **Markdown (with an images folder)** or to **one self-contained HTML file**.
You paste one script into the browser console. No extension, no app registration, no tokens.

- [Status](#status)
- [Quick start](#quick-start)
- [Before you run (30 seconds)](#before-you-run-30-seconds)
- [While it runs](#while-it-runs)
- [Configuration](#configuration)
- [Output](#output)
- [Checking the result](#checking-the-result)
- [Images and archiving](#images-and-archiving)
- [Using the export with GitHub Copilot or other AI tools](#using-the-export-with-github-copilot-or-other-ai-tools)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [How this compares to other approaches](#how-this-compares-to-other-approaches)
- [Privacy and security](#privacy-and-security)
- [Reporting a problem](#reporting-a-problem)

## Status

Tested against a **simulated** chat page: lazy loading of older messages, off-screen messages removed from the page,
formatting (bold, italics, links, lists), images, emoji, the date and message-count limits, and zip integrity.

**Not yet confirmed on live Teams.** Teams can rename the page attributes this script relies on, so run the
[pre-flight check](#before-you-run-30-seconds) first.

Verified on live Teams: _not yet. Fill in browser + version, Teams web address, and date once you have run it._

## Quick start

1. Open **one** chat in Teams web, in your browser.
2. Optional: edit the `CONFIG` block at the top of [`teams-export.js`](teams-export.js).
3. Press `F12`, open **Console**, paste the whole script, and press `Enter`.
   If the browser blocks the paste, type `allow pasting`, press `Enter`, then paste again.
4. Wait while it scrolls up on its own. It logs `messages collected: N`.
5. A file downloads, and the console prints a `DONE.` summary line.

## Before you run (30 seconds)

The script depends on attributes in the Teams page. Check that they are present before a long export.
With a chat open, paste this in the console. You should see `chat-pane-message`, `message-body` and
`message-author-name` in the table:

```js
const c={};document.querySelectorAll('[data-tid]').forEach(e=>{const k=e.getAttribute('data-tid');c[k]=(c[k]||0)+1});console.table(c)
```

For timestamps, this should print a 13-digit number in at least one of the three values (for example `1712345678901`):

```js
const m=document.querySelector('[data-tid="chat-pane-message"]');console.log(m.getAttribute('data-mid'),m.closest('[data-mid]')?.getAttribute('data-mid'),[...m.querySelectorAll('[id]')].map(x=>x.id))
```

If either check fails, see [Troubleshooting](#troubleshooting) and [Reporting a problem](#reporting-a-problem).

## While it runs

- **Do not touch the tab.** No scrolling, clicking, switching chats or resizing. The script scrolls for you, and
  interference can cause skipped messages.
- **Keep the tab visible and in the foreground.** Browsers slow down background tabs.
- **There is no cancel button.** To stop, reload the tab.
- **How long it takes:** roughly one minute per 1,000 messages, plus waiting for older messages to load.
  This is an estimate from simulation, not a measurement on real Teams. Long histories can take many minutes.
- **How it scrolls:** it moves up about one screen at a time and reads the messages at every step. At the top it
  waits up to 8 seconds for Teams to load older messages. It stops after two such waits with nothing new, or as soon
  as your limit is reached.

## Configuration

Edit the `CONFIG` block at the top of the script before pasting it.

| Option        | Default | Meaning |
| ------------- | ------- | ------- |
| `format`      | `'md'`  | `'md'`: Markdown. If the chat has images you get a `.zip` containing the `.md` and an `images/` folder; otherwise a plain `.md`. `'html'`: one HTML file with images embedded. `'both'`: both outputs as separate downloads (your browser may ask to allow multiple downloads). |
| `since`       | `''`    | Oldest day to include, for example `'2026-01-01'`. |
| `until`       | `''`    | Newest day to include, for example `'2026-03-31'`. |
| `maxMessages` | `0`     | Keep only the newest N messages. `0` means no limit. |
| `fileName`    | `''`    | Output name without extension. Empty uses the chat title (letters, digits, `.`, `_` and `-` are kept, the rest becomes `_`). |
| `pickFolder`  | `false` | `true` opens a folder picker and writes the files there directly, with no zip (Chrome and Edge only). |

**How the limits behave**

- `since` and `until` are inclusive and use your browser's local timezone. Use the format `YYYY-MM-DD`.
- `maxMessages` is applied after the date filter and keeps the newest N.
- Scrolling stops as soon as a limit is reached, so a small export does not load the whole history.
- Date limits need message timestamps. If none are found, the console warns that the dates were ignored.

**Common setups**

```js
// Everything, as Markdown
format: 'md',

// Only March 2026
since: '2026-03-01', until: '2026-03-31',

// The newest 500 messages, as both formats
maxMessages: 500, format: 'both',
```

**Choosing where files are saved**

Web pages cannot write to an arbitrary path silently. That is a browser security rule. You have two options:

- Set `pickFolder: true`. The folder picker must run right after your `Enter` key press, so it is the first thing the
  script does. Browsers reject system folders such as Documents or Downloads, so pick or create a subfolder.
  If the picker is unavailable or cancelled, the script prints a warning and falls back to a normal download.
- Leave `pickFolder: false` and turn on "Ask where to save each file before downloading" in your browser settings.

## Output

**Markdown**

```markdown
# Project X chat

Exported: 2026-09-30 | Messages: 300 | Range: 1/1/2026, 9:00:00 AM → 1/9/2026, 4:20:00 PM

## 2026-01-01

**Bob** · 09:00
Here is the build error **again**, see [the ticket](https://example.com/ticket/1)

- first thing to try
- second thing to try

![screenshot](images/img-0001.png)

**Alice** · 09:40
Thanks, looking now.
```

- A heading per day, then `**Sender** · HH:MM` (24-hour, local time) above each message.
- Bold, italics, strikethrough, links, lists, quotes, code and tables are converted. The conversion is light, so
  complex formatting may be simplified.
- Emoji images become the emoji characters. Very small icons are dropped.
- Identical images are saved once. Files are named `images/img-0001.png`, `images/img-0002.jpg`, and so on.
- With images you get a `.zip`. Unzip it and **keep the folder structure** so the `images/` links keep working.
- Reactions, buttons and other interface elements are not exported.

**HTML**

One file with the same content, a heading per day, images embedded as data URLs, and a light/dark style.

**Senders:** Teams usually shows the sender name only on the first message of a run. The script carries the name
forward. If the first exported message has no visible sender and none was seen earlier, it is labelled `Unknown sender`.

## Checking the result

The `DONE.` line reports:

| Field | Meaning |
| ----- | ------- |
| `Messages` | How many messages were exported. |
| `range` | Oldest and newest message time. |
| `timestamps from message ids` | `true` means times and date limits worked. `false` means they did not. |
| `images fetched` | Images downloaded and saved with the export. |
| `not fetchable` | Images the browser refused to download. |
| `linked-only in markdown` | Images that stayed as remote links in the Markdown. |
| `hosts that refused` | Which image hosts refused (useful for a bug report). |
| `saved` | What was written. |

Then:

1. Compare `range` with the first message in the real chat. Scroll to the top in Teams to see it.
2. Roughly compare the message count with what you expect.
3. If the export starts later than the real chat, run it again. The loader may have stopped early on a slow connection.
4. Open a chat that contains images and confirm they show.

## Images and archiving

The script saves every image it is allowed to fetch. Images it cannot fetch stay as **remote links** to Teams.
Those links need a login and may expire, so in a long-term archive they will eventually break. Check
`not fetchable` and `hosts that refused` in the `DONE.` line. If it is not zero, treat the archive as incomplete for
those images.

## Using the export with GitHub Copilot or other AI tools

- The `.md` file carries the value. As far as I know, assistants read the text of Markdown files and do not read
  images linked from them. Check this in your own setup. If a screenshot contains important text, such as an error
  message, run OCR on it and paste the text into the Markdown.
- Long chats exceed context limits. Export in chunks with `since` and `until`, for example one month per file.
  The day headings make the chunks easy to follow.
- Once an assistant reads the file, the content leaves your machine. Check your organization's Copilot or AI data
  policy first, and consider removing names or secrets.
- Do not commit exports to a shared or public repository. Keep them in a folder listed in `.gitignore`.

## Troubleshooting

| Symptom | Likely cause and fix |
| ------- | -------------------- |
| Console shows `No messages found` | The page attributes changed, or no chat is open. Open a chat and run the [pre-flight check](#before-you-run-30-seconds). |
| `timestamps from message ids: false` | Message ids are not in the expected form. Date limits are ignored and times may be missing. Report it with the pre-flight output. |
| `Unknown sender` on the first message | The sender header was above the cut and not on screen. Harmless; widen the range slightly if it matters. |
| Many images `not fetchable` | The host refuses requests from the page. They stay as remote links. Report the host names. |
| Paste does nothing in the console | Type `allow pasting`, press `Enter`, paste again. |
| `F12` or DevTools is blocked | Your organization disabled it by policy. This approach cannot work there. |
| Folder picker did not open | It needs a fresh key press, is Chrome/Edge only, and rejects system folders. The script falls back to a normal download. |
| Export starts later than the real chat start | Loading stopped early on a slow connection. Run it again. |
| Browser asks to allow multiple downloads | Expected with `format: 'both'`. Allow it. |
| Tab becomes slow or crashes on a huge chat | Everything is held in memory. Split the export with `since` and `until`. |

## Limitations

- It depends on page attributes (`data-tid="chat-pane-message"` and similar). A Teams update can break it.
- Timestamps are inferred from message ids, which are normally epoch milliseconds. The pre-flight check confirms
  this on your Teams. Day dividers shown in Teams are not read directly.
- If timestamps are missing, messages are de-duplicated by sender, time text and the start of the text, so identical
  short messages in the same minute can merge. With timestamps, the message id is used and this does not happen.
- Some image hosts may refuse the download. Those images stay as remote links.
- One chat per run. Channel conversations, replies, edited and deleted messages are untested.
  Reactions, polls and other cards are not exported.
- Everything is built in memory. The zip is uncompressed and has no ZIP64 support, so very large exports should be split.
- It reads what Teams has loaded into the page. It cannot see messages your account cannot see, or history your
  organization has removed.

## How this compares to other approaches

As described in their own READMEs at the time of writing (check for updates):

| Approach | What you need | Trade-off |
| -------- | ------------- | --------- |
| [`teams-chats-export`](https://github.com/codeforkjeff/teams-chats-export) (Python) | An Entra ID app registration, which many tenants restrict. | Uses the Microsoft Graph API, so it does not depend on the page structure. |
| [`export-ms-teams-chats`](https://github.com/evenevan/export-ms-teams-chats) (PowerShell) | A device-code sign-in through an app registered by the script's author, which can require admin consent. | Also Graph-based. You grant a third-party app read access to your chats. |
| **This script** | Only your already signed-in browser tab. | Reads the rendered page, so it can break when Teams changes its markup. |

## Privacy and security

**What the script does**

- It runs only in your own logged-in tab. It does not read tokens and does not ask for any consent.
- It sends nothing anywhere. The only network requests are fetches of images that are already displayed in the chat.
  Your browser's cookies for that image host are included, exactly as when Teams displays the image.

**How to audit it (two minutes)**

- Search [`teams-export.js`](teams-export.js) for `fetch(`. It appears once, in the image download function.
  The script contains no other network, storage or cookie access.
- While it runs, open the browser's **Network** tab to see exactly which hosts are contacted.
- Never paste console code you have not read. Browsers warn about this for a reason.
- To be sure the script cannot change under you, use a tagged release or a specific commit instead of `main`.
  You can compare a downloaded copy with a published checksum on Windows with
  `certutil -hashfile teams-export.js SHA256`. Line endings can change the hash, so compare the file exactly as released.

**Your data**

The export contains your chat history. Store it according to your employer's data and retention rules, and think
before sharing it or feeding it to an AI tool.

## Reporting a problem

Open an issue and include (remove names and private content first):

1. Browser and version, and the address of the Teams web app you used.
2. The output of both [pre-flight checks](#before-you-run-30-seconds).
3. The full `DONE.` line, or the console error.
4. What you expected and what you got (for example, "range starts later than the real chat").
