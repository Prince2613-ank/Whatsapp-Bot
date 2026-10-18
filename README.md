# WhatsApp Task & Hourly Reminder Bot 🤖

A 100% free, local WhatsApp bot that allows you to manage tasks and scheduled reminders directly inside WhatsApp.

---

## 🌟 Features

- **Natural Language Parsing**: Just text `/task wake up at 3pm` or `/task call Harvinder tomorrow at 11am`.
- **Persistent Storage**: Tasks are automatically saved to `tasks.json` so you never lose tasks when restarting.
- **Hourly Follow-up Engine**: Once the task is due, the bot alerts you immediately. If you haven't marked it `done`, it sends an hourly follow-up reminder until you complete it!
- **Quoted Reply Support**: When you get a reminder, simply swipe right to reply `"done"` or send `/done`.
- **Zero API Costs**: Uses your WhatsApp account directly via local Web linking and offline date parsing.

---

## 🚀 Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `/task <desc> [time]` | Creates a personal reminder with date/time. | `/task wake up at 3pm` |
| `/followup <person> about <topic> [time]` | Creates a follow-up reminder for a contact. | `/followup Vaibhav Sir about spreadsheet tomorrow at 11am` |
| **Smart Auto-Detection** | Detects messages like *"Remind me tomorrow at 11am"* (especially when quoting a task) and automatically schedules it! | _"Remind me tomorrow at 11am"_ |
| `done`, `ok`, `ho gaya` or `/done` | Marks current active task as completed. | `done`, `ok`, `ho gaya`, or `/done 3` |
| `/tasks` | Lists all your active tasks and follow-ups. | `/tasks` |
| `/cancel <id>` | Cancels a scheduled task. | `/cancel 2` |
| `/help` | Shows available commands. | `/help` |

---

## ⚙️ How to Run

1. Open PowerShell or Command Prompt in this folder.
2. Install dependencies (first time only):
   ```bash
   npm install
   ```
3. Start the bot:
   ```bash
   npm start
   ```
4. A **QR code** will appear in the terminal.
5. On your phone: Open **WhatsApp** > **Settings** (or 3 dots) > **Linked Devices** > **Link a Device** > Scan the terminal QR code.
6. The bot is now live! Send yourself a test message: `/task wake up in 5 minutes`.
