# teams-chat-exporter-browser-console

Export a Microsoft Teams web chat to Markdown (with an images folder) or to one
self-contained HTML file. You paste one script into the browser console. No
extension, no app registration, no tokens.

## How it works

The script runs in your own logged-in Teams tab. It scrolls up through the open
chat, reads the messages from the page, and saves them as a download. It sends
nothing anywhere. The only network requests are fetches of images already shown
in the chat, so they can be saved with the export.

## Usage

1. Open **one** chat in Teams web (teams.microsoft.com).
2. Optional: edit the `CONFIG` block at the top of [`teams-export.js`](teams-export.js).
3. Press `F12`, open **Console**, paste the whole script, and press `Enter`.
   If the browser blocks the paste, type `allow pasting` first.
4. Keep the tab in the foreground while it scrolls. It logs `messages collected: N`.
5. A file downloads, and the console prints a `DONE.` summary line.

## Configuration

| Option        | Default | Meaning |
| ------------- | ------- | ------- |
| `format`      | `'md'`  | `'md'`: Markdown. If the chat has images you get a `.zip` with the `.md` and an `images/` folder. `'html'`: one HTML file with images embedded. `'both'`: both. |
| `since`       | `''`    | Oldest day to include, for example `'2026-01-01'`. |
| `until`       | `''`    | Newest day to include, for example `'2026-03-31'`. |
| `maxMessages` | `0`     | Keep only the newest N messages. `0` means no limit. |
| `fileName`    | `''`    | Output name without extension. Empty uses the chat title. |
| `pickFolder`  | `false` | `true` opens a folder picker and writes files there directly (Chrome/Edge only). |

Scrolling stops as soon as a limit is reached. Date limits need message
timestamps; if they are not found, the console warns that the dates were ignored.

## Output

- Markdown: a heading per day, then `**Sender** · HH:MM` above each message.
  Bold, italics, links, lists, quotes, code and tables are converted. Emoji
  images become emoji characters. Identical images are saved once.
- HTML: one file with the same content, images embedded as data URLs, and a
  dark-mode style.

## Checking the result

The `DONE.` line reports the message count, the date range, whether timestamps
came from message ids, and how many images were fetched or refused. Compare the
range with the first message in the real chat. If the export starts later, run
it again; the loader may have stopped early on a slow connection.

## Limitations

- It depends on Teams DOM attributes (`data-tid="chat-pane-message"` and
  similar). A Teams UI update can break it.
- Timestamps come from message ids, which are normally epoch milliseconds.
  Times use the browser's local timezone.
- Some image hosts may refuse the fetch. Those images stay as remote links.
- It exports one chat per run. Reactions, polls and other cards are not exported.

## Privacy

The export contains your chat history. Store it according to your employer's
data and retention rules.
