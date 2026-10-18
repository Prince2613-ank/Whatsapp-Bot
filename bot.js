const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const taskManager = require('./taskManager');

console.log('----------------------------------------------------');
console.log('🤖 Starting WhatsApp Task & Hourly Reminder Bot...');
console.log('----------------------------------------------------');

// Configure WhatsApp client with local persistent session
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '.wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Render QR Code in terminal
client.on('qr', (qr) => {
    console.log('\n📲 [ACTION REQUIRED] Scan this QR Code with WhatsApp:');
    console.log('👉 WhatsApp > Settings (or 3 dots) > Linked Devices > Link a Device\n');
    qrcode.generate(qr, { small: true });
});

let isClientReady = false;

// Authentication events
client.on('authenticated', () => {
    console.log('🔐 Session authenticated successfully!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

client.on('ready', () => {
    isClientReady = true;
    console.log('\n====================================================');
    console.log('🎉 BOT IS READY AND LISTENING ON YOUR WHATSAPP!');
    console.log('====================================================');
    console.log('Try sending in any chat or "Message Yourself":');
    console.log('  /task wake up at 3pm');
    console.log('  /tasks');
    console.log('  done');
    console.log('----------------------------------------------------\n');
});

client.on('disconnected', (reason) => {
    isClientReady = false;
    console.log('⚠️ Client disconnected:', reason);
});

// Helper to format 12-hour readable time
function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${time} on ${date}`;
}

// Handle both incoming and self-sent messages (so you can command the bot from your own phone!)
client.on('message_create', async (msg) => {
    try {
        const text = (msg.body || '').trim();
        if (!text) return;

        const chatId = msg.to === client.info?.wid?._serialized ? msg.from : (msg.fromMe ? msg.to : msg.from);
        const contact = await msg.getContact().catch(() => ({ pushname: 'You' }));
        const senderName = contact?.pushname || 'User';

        // 1. HELP COMMAND
        if (text === '/help' || text === '!help') {
            const helpMessage = 
                `📋 *WhatsApp Task & Follow-up Bot - Commands*\n\n` +
                `• */task <description with time>*\n` +
                `  _Example:_ \`/task wake up at 3pm\`\n` +
                `  _Example:_ \`/task call Harvinder tomorrow at 11am\`\n\n` +
                `• */followup <person> about <topic> <time>*\n` +
                `  _Example:_ \`/followup Vaibhav Sir about spreadsheet tomorrow at 11am\`\n` +
                `  _Example:_ \`/followup Harvinder for site update in 2 hours\`\n\n` +
                `• *Smart Auto-Detection:*\n` +
                `  Whenever someone texts _"Remind me tomorrow at 11am"_ (quoting a message), I automatically schedule that follow-up!\n\n` +
                `• *done*, *ok*, *ho gaya* or */done [id]*\n` +
                `  Mark task as complete and stop hourly reminders.\n\n` +
                `• */tasks*\n` +
                `  View all active tasks & follow-ups.\n\n` +
                `• */cancel <id>*\n` +
                `  Cancel a scheduled task.`;
            return await msg.reply(helpMessage);
        }

        // 2. CREATE FOLLOW-UP: /followup <person> about <topic> <time>
        if (text.startsWith('/followup ') || text.startsWith('!followup ')) {
            const input = text.substring(10).trim();
            if (!input) {
                return await msg.reply(
                    '⚠️ Please specify who, topic, and time.\n' +
                    '*Example:* `/followup Vaibhav Sir about spreadsheet tomorrow at 11am`\n' +
                    '*Example:* `/followup Harvinder for site update in 2 hours`'
                );
            }

            const parsed = taskManager.parseFollowupInput(input);
            if (!parsed || !parsed.targetDate) {
                return await msg.reply(
                    '❌ Could not detect the time for this follow-up.\n' +
                    '*Example:* `/followup Vaibhav Sir about spreadsheet tomorrow at 11am`'
                );
            }

            const task = taskManager.addFollowup(
                chatId,
                senderName,
                parsed.targetPerson || 'Contact',
                parsed.topic,
                parsed.targetDate,
                1
            );
            const scheduledFor = formatDateTime(task.targetTime);

            const confirmation = 
                `📌 *Follow-up Scheduled! (Task #${task.id})*\n\n` +
                `👤 *Person:* ${task.targetPerson}\n` +
                `📝 *Topic:* ${task.topic}\n` +
                `⏰ *Follow-up Time:* ${scheduledFor}\n` +
                `🔄 *Recurring:* Every 1 MINUTE (Test Mode) until completed\n\n` +
                `_I will alert you to follow up with ${task.targetPerson} when it's time!_`;

            return await msg.reply(confirmation);
        }

        // 3. SMART AUTO-DETECTION: e.g. "Remind me tomorrow at 11am" or "yaad dilana kal 11 baje"
        const remindMePattern = /^(?:please\s+)?(?:remind\s+me|yaad\s+dila(?:na|do)|remind\s+karna)\b/i;
        if (remindMePattern.test(text) && !text.startsWith('/')) {
            const parsed = taskManager.parseTaskInput(text);
            if (parsed && parsed.targetDate) {
                let targetPerson = senderName || 'Contact';
                let topic = parsed.description;

                // Check if quoting a message (like Vaibhav Sir quoting "Spreadsheets completed?")
                if (msg.hasQuotedMsg) {
                    const quotedMsg = await msg.getQuotedMessage().catch(() => null);
                    if (quotedMsg && quotedMsg.body) {
                        topic = quotedMsg.body.trim();
                    }
                }

                // Clean topic from "remind me" command phrases
                topic = topic.replace(/^(?:please\s+)?(?:remind\s+me|yaad\s+dila(?:na|do)|remind\s+karna)\s*(?:to|about|for)?\s*/i, '').trim();
                if (!topic) topic = 'Follow-up';

                const task = taskManager.addFollowup(
                    chatId,
                    senderName,
                    targetPerson,
                    topic,
                    parsed.targetDate,
                    1
                );
                const scheduledFor = formatDateTime(task.targetTime);

                const confirmation = 
                    `🤖 *Follow-up Auto-Detected! (Task #${task.id})*\n\n` +
                    `👤 *With:* ${targetPerson}\n` +
                    `📝 *Topic:* "${topic}"\n` +
                    `⏰ *Reminder Time:* ${scheduledFor}\n` +
                    `🔄 *Recurring:* Every 1 MINUTE (Test Mode) until completed\n\n` +
                    `_I have automatically scheduled this reminder for you!_`;

                return await msg.reply(confirmation);
            }
        }

        // 4. CREATE TASK: /task <description>
        if (text.startsWith('/task ') || text.startsWith('!task ')) {
            const input = text.substring(6).trim();
            if (!input) {
                return await msg.reply('⚠️ Please provide a description and time.\n*Example:* `/task wake up in 2 minutes`');
            }

            const parsed = taskManager.parseTaskInput(input);
            if (!parsed) {
                return await msg.reply(
                    '❌ Could not detect the time in your request.\n' +
                    'Please include a time, e.g.:\n' +
                    '• `/task wake up at 3pm`\n' +
                    '• `/task call Harvinder tomorrow at 1pm`\n' +
                    '• `/task make spreadsheet in 30 minutes`'
                );
            }

            const task = taskManager.addTask(chatId, senderName, parsed.description, parsed.targetDate, 1);
            const scheduledFor = formatDateTime(task.targetTime);

            const confirmation = 
                `✅ *Task #${task.id} Scheduled!*\n\n` +
                `📝 *Task:* ${task.description}\n` +
                `⏰ *First Reminder:* ${scheduledFor}\n` +
                `🔄 *Recurring:* Every 1 MINUTE (Test Mode) until completed\n\n` +
                `_Reply *done*, *ok*, or */done ${task.id}* when you finish!_`;

            return await msg.reply(confirmation);
        }

        // 5. MARK DONE: "done", "ok", "okay", "ho gaya", "kar diya", "completed", "/done", etc.
        const doneRegex = /^(\/done|!done|\b(done|completed|finished|ok|okay|k|ho\s*g(y|ay)a|kar\s*diya|thik\s*hai|theek\s*hai|theek\s*h|thik\s*h|yes|ha|haan)\b|👍)/i;
        
        let isDoneCommand = doneRegex.test(text);
        let taskId = null;

        // Check if explicitly passed an ID like "/done 3"
        const parts = text.split(/\s+/);
        if (parts.length > 1 && !isNaN(parts[1])) {
            taskId = parseInt(parts[1], 10);
        }

        // Check if the user replied/quoted a previous reminder message
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage().catch(() => null);
            if (quotedMsg) {
                const match = (quotedMsg.body || '').match(/Task #(\d+)/i);
                if (match) {
                    taskId = parseInt(match[1], 10);
                    // Any affirmative or short reply to a task reminder marks it done!
                    if (isDoneCommand || text.length <= 15) {
                        isDoneCommand = true;
                    }
                }
            }
        }

        if (isDoneCommand) {
            const completed = taskManager.completeTask(chatId, taskId);
            if (completed) {
                const label = completed.type === 'FOLLOWUP' ? 'Follow-up' : 'Task';
                return await msg.reply(
                    `🎉 *Great Job!*\n` +
                    `${label} #${completed.id} (*${completed.description}*) is now marked as *DONE*.\n` +
                    `All recurring reminders have been cancelled. ✨`
                );
            } else if (text.startsWith('/done')) {
                return await msg.reply('ℹ️ No active task found matching that ID to mark done.');
            }
        }

        // 6. LIST ACTIVE TASKS: /tasks
        if (text === '/tasks' || text === '!tasks') {
            const activeList = taskManager.getActiveTasks(chatId);
            if (activeList.length === 0) {
                return await msg.reply('🎉 You have no pending or active tasks! Everything is done.');
            }

            let response = `📋 *Active Tasks & Follow-ups (${activeList.length}):*\n\n`;
            activeList.forEach((t) => {
                const statusEmoji = t.status === 'ACTIVE' ? '🔔' : '⏳';
                const timeStr = formatDateTime(t.targetTime);
                const reminderInfo = t.reminderCount > 0 ? ` (_Reminded ${t.reminderCount}x_)` : '';
                
                if (t.type === 'FOLLOWUP') {
                    response += `${statusEmoji} *#${t.id} [Follow-up]:* ${t.targetPerson} - "${t.topic}"\n`;
                } else {
                    response += `${statusEmoji} *#${t.id}:* ${t.description}\n`;
                }
                response += `   ⏰ Time: ${timeStr} [${t.status}]${reminderInfo}\n\n`;
            });
            response += `_Reply *done*, *ok*, *ho gaya* or */done <id>* to mark complete._`;
            return await msg.reply(response);
        }

        // 7. CANCEL TASK: /cancel <id>
        if (text.startsWith('/cancel ') || text.startsWith('!cancel ')) {
            const parts = text.split(/\s+/);
            const taskId = parts[1] ? parseInt(parts[1], 10) : null;
            if (!taskId) {
                return await msg.reply('⚠️ Please specify the task ID: `/cancel 1`');
            }

            const cancelled = taskManager.cancelTask(chatId, taskId);
            if (cancelled) {
                return await msg.reply(`🚫 Task #${cancelled.id} (*${cancelled.description}*) has been cancelled.`);
            } else {
                return await msg.reply(`ℹ️ Task #${taskId} was not found or is already completed.`);
            }
        }

    } catch (err) {
        console.error('Error handling message:', err);
    }
});

// Periodic reminder engine: checks every 10 seconds
setInterval(async () => {
    // Only process reminders when WhatsApp client is fully connected and ready
    if (!isClientReady) return;

    try {
        const dueItems = taskManager.checkDueTasks();

        for (const item of dueItems) {
            const { task, type } = item;

            if (type === 'INITIAL') {
                let reminderText;
                if (task.type === 'FOLLOWUP') {
                    reminderText = 
                        `🔔 *FOLLOW-UP ALERT! (Task #${task.id})*\n\n` +
                        `👤 *Follow up with:* ${task.targetPerson || 'Contact'}\n` +
                        `📝 *Regarding:* ${task.topic || task.description}\n\n` +
                        `👉 _Time to message or call them!_\n` +
                        `_Reply "done", "ok", or "ho gaya" once you've followed up._\n` +
                        `_(If not completed, I will remind you again in 1 minute.)_`;
                } else {
                    reminderText = 
                        `⏰ *TASK REMINDER (Task #${task.id})*\n\n` +
                        `👉 *${task.description}*\n\n` +
                        `_It is now time for this task!_\n` +
                        `_Reply *done*, *ok*, or */done ${task.id}* when completed._\n` +
                        `_(If not completed, I will remind you again in 1 minute.)_`;
                }

                await client.sendMessage(task.chatId, reminderText);
                taskManager.markReminded(task.id);
                console.log(`[ALERT] Sent initial reminder for Task #${task.id} to ${task.chatId}`);
            } 
            else if (type === 'RECURRING') {
                const count = (task.reminderCount || 0) + 1;
                let followUpText;

                if (task.type === 'FOLLOWUP') {
                    followUpText = 
                        `🔔 *1-MIN FOLLOW-UP #${count} (Task #${task.id})*\n\n` +
                        `Still pending follow-up with *${task.targetPerson}*:\n` +
                        `👉 *${task.topic}*\n\n` +
                        `_Have you contacted them? Reply "done", "ok", or "ho gaya" to stop alerts!_`;
                } else {
                    followUpText = 
                        `🔔 *1-MIN REMINDER #${count} (Task #${task.id})*\n\n` +
                        `This task is still pending:\n` +
                        `👉 *${task.description}*\n\n` +
                        `_Have you finished it? Reply "done", "ok", or "ho gaya" to stop these alerts!_`;
                }

                await client.sendMessage(task.chatId, followUpText);
                taskManager.markReminded(task.id);
                console.log(`[ALERT] Sent 1-min follow-up #${count} for Task #${task.id} to ${task.chatId}`);
            }
        }
    } catch (err) {
        console.error('Error in reminder scheduler:', err);
    }
}, 10 * 1000);

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection (recovered):', reason?.message || reason);
});

// Start the client
client.initialize().catch(err => {
    console.error('Client initialization error:', err?.message || err);
});
