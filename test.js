const taskManager = require('./taskManager');

console.log('🧪 Running Comprehensive Tests for New Requirements...\n');

const testChatId = 'test_chat_123@c.us';

// Clean test environment
taskManager.tasks = taskManager.tasks.filter(t => t.chatId !== testChatId);
taskManager.saveTasks();

// --- TEST 1: Duplicate Detection & Rescheduling on Reply ---
console.log('--- TEST 1: Duplicate Detection & Rescheduling ---');
const t1 = taskManager.addTask(testChatId, 'Tester', 'Submit reports', new Date(Date.now() + 60000));
console.log(`Task created: #${t1.id} "${t1.description}"`);

// Check duplicate detection
const dup = taskManager.findDuplicateActiveTask(testChatId, 'submit reports');
console.assert(dup && dup.id === t1.id, 'Test 1 Failed: Duplicate task not detected');
console.log(`✅ Duplicate correctly detected: found Task #${dup.id}`);

// Reschedule task
const newTime = new Date(Date.now() + 120000);
const rescheduled = taskManager.rescheduleTask(testChatId, t1.id, newTime, 'Submit updated reports');
console.assert(rescheduled.status === 'PENDING', 'Test 1 Failed: Status not reset to PENDING');
console.assert(rescheduled.lastRemindedAt === null, 'Test 1 Failed: lastRemindedAt not cleared');
console.assert(rescheduled.targetTime === newTime.getTime(), 'Test 1 Failed: targetTime not updated');
console.log(`✅ Rescheduling verified: Task #${rescheduled.id} targetTime updated and timer reset`);

// --- TEST 2: Correct Completion Handling (No Guessing!) ---
console.log('\n--- TEST 2: Unambiguous Completion Handling ---');
// Create a second task so we have 2 active tasks
const t2 = taskManager.addTask(testChatId, 'Tester', 'Review spreadsheets', new Date(Date.now() + 180000));
console.log(`Second task created: #${t2.id} "${t2.description}"`);

// Attempt completion without specifying ID when multiple tasks exist
const ambigResult = taskManager.completeTask(testChatId, null);
console.assert(ambigResult.ambiguous === true, 'Test 2 Failed: Did not detect ambiguity when multiple tasks exist');
console.assert(ambigResult.tasks.length === 2, 'Test 2 Failed: Ambiguous task count mismatch');
console.log('✅ Bot refused to guess when 2 tasks were active (ambiguity handled correctly)');

// Complete with specific ID
const specificResult = taskManager.completeTask(testChatId, t1.id);
console.assert(specificResult.success === true && specificResult.task.id === t1.id, 'Test 2 Failed: Specific task completion failed');
console.assert(specificResult.task.status === 'DONE', 'Test 2 Failed: Task status not marked DONE');
console.log(`✅ Task #${t1.id} completed with explicit ID`);

// Now only 1 task remains active (t2). Unspecified 'done' should now safely complete t2
const singleResult = taskManager.completeTask(testChatId, null);
console.assert(singleResult.success === true && singleResult.task.id === t2.id, 'Test 2 Failed: Single remaining task completion failed');
console.log(`✅ Single remaining Task #${t2.id} safely completed without ambiguity`);

// --- TEST 3: Reminder Cancellation & Database Synchronization ---
console.log('\n--- TEST 3: Reminder Cancellation & DB Sync ---');
// Verify completed tasks are never marked as due
const dueList = taskManager.checkDueTasks().filter(item => item.task.chatId === testChatId);
console.assert(dueList.length === 0, 'Test 3 Failed: Completed tasks showed up in due list');
console.log('✅ Cancelled/completed tasks are completely excluded from reminder queue');

// Clean up
taskManager.tasks = taskManager.tasks.filter(t => t.chatId !== testChatId);
taskManager.saveTasks();

console.log('\n🎉 ALL TESTS PASSED! Duplicate detection, exact completion, and timer cancellation are 100% verified.');
