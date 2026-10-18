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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'win32' 
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 
            : '/usr/bin/chromium'),
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

        // 0. DETECT QUOTED TASK MESSAGE
        let quotedTaskId = null;
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage().catch(() => null);
            if (quotedMsg && quotedMsg.body) {
                const match = quotedMsg.body.match(/Task #(\d+)/i);
                if (match) {
                    quotedTaskId = parseInt(match[1], 10);
                }
            }
        }

        // 1. RESCHEDULING VIA REPLY:
        // If quoting an existing task and providing a new time (e.g. "at 4pm", "kal 11am", "in 30 mins", "reschedule to 5pm")
        if (quotedTaskId) {
            const isDoneWord = /^(\/done|!done|\b(done|completed|finished|ok|okay|k|ho\s*g(y|ay)a|kar\s*diya|thik\s*h(ai)?|theek\s*h(ai)?|yes|ha|haan)\b|👍)/i.test(text);
            const parsedReschedule = taskManager.parseTaskInput(text);

            if (parsedReschedule && parsedReschedule.targetDate && !isDoneWord) {
                const rescheduled = taskManager.rescheduleTask(
                    chatId,
                    quotedTaskId,
                    parsedReschedule.targetDate,
                    parsedReschedule.description !== text ? parsedReschedule.description : null
                );

                if (rescheduled) {
                    const scheduledFor = formatDateTime(rescheduled.targetTime);
                    return await msg.reply(
                        `🔄 *Task #${rescheduled.id} Rescheduled!*\n\n` +
                        `📝 *Task:* ${rescheduled.description}\n` +
                        `⏰ *New Reminder Time:* ${scheduledFor}\n` +
                        `🛑 *Previous reminder timer cancelled.*\n\n` +
                        `_I will remind you at the updated time!_`
                    );
                }
            }
        }

        // 2. HELP COMMAND
        if (text === '/help' || text === '!help') {
            const helpMessage = 
                `📋 *WhatsApp Task & Follow-up Bot - Commands*\n\n` +
                `• */task <description with time>*\n` +
                `  _Example:_ \`/task wake up at 3pm\`\n` +
                `  _Example:_ \`/task call Harvinder tomorrow at 11am\`\n\n` +
                `• */followup <person> about <topic> <time>*\n` +
                `  _Example:_ \`/followup Vaibhav Sir about spreadsheet tomorrow at 11am\`\n` +
                `  _Example:_ \`/followup Harvinder for site update in 2 hours\`\n\n` +
                `• *Reschedule a Task:*\n` +
                `  Reply/quote any reminder with a new time (e.g. _"at 4pm"_ or _"kal 11 baje"_).\n\n` +
                `• *done*, *ok*, *ho gaya* or */done [id]*\n` +
                `  Mark task as complete and cancel reminders.\n\n` +
                `• */tasks*\n` +
                `  View all active tasks & follow-ups.\n\n` +
                `• */cancel <id>*\n` +
                `  Cancel a scheduled task.`;
            return await msg.reply(helpMessage);
        }

        // 3. CREATE FOLLOW-UP: /followup <person> about <topic> <time>
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

            // DUPLICATE DETECTION: Check if an active task for this topic already exists
            const existingDuplicate = taskManager.findDuplicateActiveTask(chatId, parsed.topic);
            if (existingDuplicate) {
                const rescheduled = taskManager.rescheduleTask(chatId, existingDuplicate.id, parsed.targetDate, parsed.topic);
                const scheduledFor = formatDateTime(rescheduled.targetTime);
                return await msg.reply(
                    `🔄 *Existing Task #${rescheduled.id} Rescheduled!*\n\n` +
                    `📝 *Topic:* ${rescheduled.topic || rescheduled.description}\n` +
                    `⏰ *Updated Follow-up Time:* ${scheduledFor}\n` +
                    `🛑 *Previous timer cancelled (No duplicate created).*`
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

        // 4. SMART AUTO-DETECTION: e.g. "Remind me tomorrow at 11am" or "yaad dilana kal 11 baje"
        const remindMePattern = /^(?:please\s+)?(?:remind\s+me|yaad\s+dila(?:na|do)|remind\s+karna)\b/i;
        if (remindMePattern.test(text) && !text.startsWith('/')) {
            const parsed = taskManager.parseTaskInput(text);
            if (parsed && parsed.targetDate) {
                // If quoting an existing task, reschedule it instead of creating a duplicate!
                if (quotedTaskId) {
                    const rescheduled = taskManager.rescheduleTask(chatId, quotedTaskId, parsed.targetDate);
                    if (rescheduled) {
                        const scheduledFor = formatDateTime(rescheduled.targetTime);
                        return await msg.reply(
                            `🔄 *Task #${rescheduled.id} Rescheduled!*\n\n` +
                            `📝 *Task:* ${rescheduled.description}\n` +
                            `⏰ *New Reminder Time:* ${scheduledFor}\n` +
                            `🛑 *Previous timer cancelled.*\n\n` +
                            `_I will remind you at ${scheduledFor}!_`
                        );
                    }
                }

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

                // Check for existing duplicate before creating
                const existingDuplicate = taskManager.findDuplicateActiveTask(chatId, topic);
                if (existingDuplicate) {
                    const rescheduled = taskManager.rescheduleTask(chatId, existingDuplicate.id, parsed.targetDate, topic);
                    const scheduledFor = formatDateTime(rescheduled.targetTime);
                    return await msg.reply(
                        `🔄 *Existing Task #${rescheduled.id} Rescheduled!*\n\n` +
                        `📝 *Topic:* "${rescheduled.topic || rescheduled.description}"\n` +
                        `⏰ *Updated Time:* ${scheduledFor}\n` +
                        `🛑 *Previous timer cancelled (No duplicate created).*`
                    );
                }

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

        // 5. CREATE TASK: /task <description>
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

            // DUPLICATE DETECTION: If an identical/similar active task already exists in this chat, reschedule it!
            const existingDuplicate = taskManager.findDuplicateActiveTask(chatId, parsed.description);
            if (existingDuplicate) {
                const rescheduled = taskManager.rescheduleTask(chatId, existingDuplicate.id, parsed.targetDate, parsed.description);
                const scheduledFor = formatDateTime(rescheduled.targetTime);
                return await msg.reply(
                    `🔄 *Existing Task #${rescheduled.id} Rescheduled!*\n\n` +
                    `📝 *Task:* ${rescheduled.description}\n` +
                    `⏰ *Updated Reminder Time:* ${scheduledFor}\n` +
                    `🛑 *Previous timer cancelled (No duplicate created).*`
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

        // 6. MARK DONE: "done", "ok", "okay", "ho gaya", "kar diya", "completed", "/done", etc.
        const doneRegex = /^(\/done|!done|\b(done|completed|finished|ok|okay|k|ho\s*g(y|ay)a|kar\s*diya|thik\s*hai|theek\s*hai|theek\s*h|thik\s*h|yes|ha|haan)\b|👍)/i;
        const isDoneCommand = doneRegex.test(text) || (quotedTaskId && text.length <= 15);

        if (isDoneCommand) {
            let targetTaskId = quotedTaskId;

            // Check if explicitly passed an ID like "/done 3", "done 3", "done #3", "3 done"
            const idMatch = text.match(/(?:^|\s)#?(\d+)(?:\s|$)/);
            if (idMatch) {
                targetTaskId = parseInt(idMatch[1], 10);
            }

            const res = taskManager.completeTask(chatId, targetTaskId);

            if (res.success) {
                const completed = res.task;
                const label = completed.type === 'FOLLOWUP' ? 'Follow-up' : 'Task';
                return await msg.reply(
                    `🎉 *Great Job!*\n` +
                    `${label} #${completed.id} (*${completed.description}*) is now marked as *DONE*.\n` +
                    `All reminder timers have been cancelled. ✨`
                );
            } else if (res.ambiguous) {
                // MULTIPLE TASKS EXIST & NOT SPECIFIED: DO NOT GUESS!
                let ambigMsg = `⚠️ *Which task did you finish?*\n` +
                               `You have ${res.tasks.length} active tasks:\n\n`;
                res.tasks.forEach(t => {
                    const time = formatDateTime(t.targetTime);
                    ambigMsg += `• *#${t.id}:* ${t.description} (Set for: ${time})\n`;
                });
                ambigMsg += `\n_Please reply with the task number (e.g. *done ${res.tasks[0].id}*), or quote the task reminder!_`;
                return await msg.reply(ambigMsg);
            } else if (res.noActive) {
                return await msg.reply('ℹ️ You have no active or pending tasks to complete.');
            } else if (res.notFound) {
                return await msg.reply(`ℹ️ Task #${res.taskId} was not found or is already completed.`);
            }
        }

        // 7. LIST ACTIVE TASKS: /tasks
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
            response += `_Reply *done <id>* or quote a reminder to complete._`;
            return await msg.reply(response);
        }

        // 8. CANCEL TASK: /cancel <id>
        if (text.startsWith('/cancel ') || text.startsWith('!cancel ')) {
            const parts = text.split(/\s+/);
            const taskId = parts[1] ? parseInt(parts[1], 10) : null;
            if (!taskId) {
                return await msg.reply('⚠️ Please specify the task ID: `/cancel 1`');
            }

            const cancelled = taskManager.cancelTask(chatId, taskId);
            if (cancelled) {
                return await msg.reply(`🚫 Task #${cancelled.id} (*${cancelled.description}*) has been cancelled.\nAll reminder timers stopped.`);
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
            // DATABASE CHECK BEFORE EVERY REMINDER:
            // Fetch fresh task directly from database to confirm it was not completed or rescheduled
            const freshTask = taskManager.getTaskById(item.task.id);
            if (!freshTask || freshTask.status === 'DONE' || freshTask.status === 'CANCELLED') {
                console.log(`[CANCELLED] Task #${item.task.id} is ${freshTask?.status}. Skipping reminder.`);
                continue;
            }

            // If task was rescheduled to a future time, skip sending reminder
            if (freshTask.targetTime > Date.now()) {
                console.log(`[RESCHEDULED] Task #${item.task.id} has new target time in future. Skipping old reminder.`);
                continue;
            }

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
                        `_(To reschedule, reply with a new time e.g. "at 4pm")_`;
                } else {
                    reminderText = 
                        `⏰ *TASK REMINDER (Task #${task.id})*\n\n` +
                        `👉 *${task.description}*\n\n` +
                        `_It is now time for this task!_\n` +
                        `_Reply *done*, *ok*, or */done ${task.id}* when completed._\n` +
                        `_(To reschedule, reply with a new time e.g. "at 4pm")_`;
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
                        `_Have you contacted them? Reply "done" to stop alerts, or reply with a new time to reschedule._`;
                } else {
                    followUpText = 
                        `🔔 *1-MIN REMINDER #${count} (Task #${task.id})*\n\n` +
                        `This task is still pending:\n` +
                        `👉 *${task.description}*\n\n` +
                        `_Have you finished it? Reply "done" to stop alerts, or reply with a new time to reschedule._`;
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
