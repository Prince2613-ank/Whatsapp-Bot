const fs = require('fs');
const path = require('path');
const chrono = require('chrono-node');

const TASKS_FILE = path.join(__dirname, 'tasks.json');

class TaskManager {
    constructor() {
        this.tasks = [];
        this.loadTasks();
    }

    loadTasks() {
        try {
            if (fs.existsSync(TASKS_FILE)) {
                const data = fs.readFileSync(TASKS_FILE, 'utf-8');
                this.tasks = JSON.parse(data);
            } else {
                this.tasks = [];
                this.saveTasks();
            }
        } catch (err) {
            console.error('Error loading tasks file:', err);
            this.tasks = [];
        }
    }

    saveTasks() {
        try {
            fs.writeFileSync(TASKS_FILE, JSON.stringify(this.tasks, null, 2), 'utf-8');
        } catch (err) {
            console.error('Error saving tasks file:', err);
        }
    }

    getNextId() {
        if (this.tasks.length === 0) return 1;
        return Math.max(...this.tasks.map(t => t.id || 0)) + 1;
    }

    /**
     * Parses a natural language task string.
     * e.g. "wake up at 3pm" -> { description: "wake up", targetDate: Date }
     */
    parseTaskInput(input) {
        const parsed = chrono.parse(input);
        if (!parsed || parsed.length === 0) {
            return null;
        }

        const dateComponent = parsed[0];
        const targetDate = dateComponent.start.date();

        // If parsed time is already in the past for today, advance by 24h if it had no explicit date
        const now = new Date();
        if (targetDate.getTime() <= now.getTime()) {
            // Check if the user didn't specify a date (just time like "3pm")
            if (!dateComponent.start.isCertain('day') && !dateComponent.start.isCertain('month')) {
                targetDate.setDate(targetDate.getDate() + 1);
            }
        }

        // Remove the matched time portion from the description
        let cleanDescription = input.replace(dateComponent.text, '').trim();
        // Clean up common leading/trailing prepositions (e.g. "at", "by", "on")
        cleanDescription = cleanDescription.replace(/^(at|by|on|for)\s+/i, '').replace(/\s+(at|by|on|for)$/i, '').trim();

        if (!cleanDescription) {
            cleanDescription = input;
        }

        return {
            description: cleanDescription,
            targetDate: targetDate,
            rawTimeText: dateComponent.text
        };
    }

    /**
     * Parses a natural language follow-up string.
     * e.g. "Vaibhav Sir about spreadsheet tomorrow at 11am"
     * e.g. "spreadsheet with Vaibhav Sir at 11am tomorrow"
     */
    parseFollowupInput(input) {
        const parsedTime = this.parseTaskInput(input);
        if (!parsedTime) return null;

        const cleanText = parsedTime.description;
        let targetPerson = null;
        let topic = cleanText;

        // Pattern 1: "<Person> about/for/regarding <Topic>"
        const matchAbout = cleanText.match(/^(.+?)\s+(?:about|for|regarding|on)\s+(.+)$/i);
        // Pattern 2: "<Topic> with/to <Person>"
        const matchWith = cleanText.match(/^(.+?)\s+(?:with|to)\s+(.+)$/i);

        if (matchAbout) {
            targetPerson = matchAbout[1].trim();
            topic = matchAbout[2].trim();
        } else if (matchWith) {
            topic = matchWith[1].trim();
            targetPerson = matchWith[2].trim();
        }

        return {
            targetPerson: targetPerson,
            topic: topic,
            targetDate: parsedTime.targetDate,
            rawTimeText: parsedTime.rawTimeText
        };
    }

    /**
     * Creates a new scheduled task
     */
    addTask(chatId, senderName, description, targetTime, intervalMinutes = 1, options = {}) {
        const task = {
            id: this.getNextId(),
            chatId: chatId,
            senderName: senderName || 'User',
            type: options.type || 'TASK', // 'TASK' | 'FOLLOWUP'
            targetPerson: options.targetPerson || null,
            topic: options.topic || null,
            description: description,
            targetTime: targetTime.getTime ? targetTime.getTime() : targetTime,
            intervalMinutes: intervalMinutes,
            status: 'PENDING', // 'PENDING' | 'ACTIVE' | 'DONE' | 'CANCELLED'
            createdAt: Date.now(),
            lastRemindedAt: null,
            reminderCount: 0
        };

        this.tasks.push(task);
        this.saveTasks();
        return task;
    }

    /**
     * Creates a follow-up task
     */
    addFollowup(chatId, senderName, targetPerson, topic, targetTime, intervalMinutes = 1) {
        const description = targetPerson 
            ? `Follow up with ${targetPerson} about ${topic}`
            : `Follow up: ${topic}`;

        return this.addTask(chatId, senderName, description, targetTime, intervalMinutes, {
            type: 'FOLLOWUP',
            targetPerson: targetPerson,
            topic: topic
        });
    }

    /**
     * Completes a task by ID, or completes the latest active/pending task in the chat
     */
    completeTask(chatId, taskId = null) {
        let task = null;

        if (taskId) {
            task = this.tasks.find(t => t.id === Number(taskId) && t.chatId === chatId);
        } else {
            // Pick the latest pending or active task for this chat
            const candidates = this.tasks
                .filter(t => t.chatId === chatId && (t.status === 'ACTIVE' || t.status === 'PENDING'))
                .sort((a, b) => b.id - a.id);
            task = candidates[0];
        }

        if (!task || task.status === 'DONE' || task.status === 'CANCELLED') {
            return null;
        }

        task.status = 'DONE';
        task.completedAt = Date.now();
        this.saveTasks();
        return task;
    }

    /**
     * Cancels a task
     */
    cancelTask(chatId, taskId) {
        const task = this.tasks.find(t => t.id === Number(taskId) && t.chatId === chatId);
        if (!task || task.status === 'DONE' || task.status === 'CANCELLED') {
            return null;
        }
        task.status = 'CANCELLED';
        task.cancelledAt = Date.now();
        this.saveTasks();
        return task;
    }

    /**
     * Gets all non-completed tasks for a chat
     */
    getActiveTasks(chatId) {
        return this.tasks.filter(t => t.chatId === chatId && (t.status === 'PENDING' || t.status === 'ACTIVE'));
    }

    /**
     * Returns list of tasks that require a reminder right now
     */
    checkDueTasks() {
        const now = Date.now();
        const dueList = [];

        for (const task of this.tasks) {
            if (task.status === 'DONE' || task.status === 'CANCELLED') continue;

            const intervalMs = (task.intervalMinutes || 60) * 60 * 1000;

            // 1. Initial reminder due
            if (task.status === 'PENDING' && now >= task.targetTime) {
                dueList.push({ task, type: 'INITIAL' });
            }
            // 2. Hourly recurring reminder due
            else if (task.status === 'ACTIVE' && task.lastRemindedAt && (now - task.lastRemindedAt >= intervalMs)) {
                dueList.push({ task, type: 'RECURRING' });
            }
        }

        return dueList;
    }

    /**
     * Updates task after sending a reminder
     */
    markReminded(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.status = 'ACTIVE';
        task.lastRemindedAt = Date.now();
        task.reminderCount = (task.reminderCount || 0) + 1;
        this.saveTasks();
    }
}

module.exports = new TaskManager();
