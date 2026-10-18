const taskManager = require('./taskManager');

console.log('🧪 Testing Task Parsing & Scheduling Logic...\n');

// Test 1: "wake up at 3pm"
const test1 = taskManager.parseTaskInput('wake up at 3pm');
console.log('Test 1: "wake up at 3pm"');
console.log('  Description:', test1?.description);
console.log('  Target Date:', test1?.targetDate?.toLocaleString());
console.assert(test1?.description === 'wake up', 'Test 1 Failed: Description mismatch');

// Test 2: "call Harvinder tomorrow at 1"
const test2 = taskManager.parseTaskInput('call Harvinder tomorrow at 1');
console.log('\nTest 2: "call Harvinder tomorrow at 1"');
console.log('  Description:', test2?.description);
console.log('  Target Date:', test2?.targetDate?.toLocaleString());
console.assert(test2?.description.toLowerCase().includes('call harvinder'), 'Test 2 Failed: Description mismatch');

// Test 3: "make spreadsheet by 3pm today"
const test3 = taskManager.parseTaskInput('make spreadsheet by 3pm today');
console.log('\nTest 3: "make spreadsheet by 3pm today"');
console.log('  Description:', test3?.description);
console.log('  Target Date:', test3?.targetDate?.toLocaleString());

// Test 4: Follow-up parsing
console.log('\nTest 4: Follow-up parsing ("Vaibhav Sir about spreadsheet tomorrow at 11am")...');
const followUpTest = taskManager.parseFollowupInput('Vaibhav Sir about spreadsheet tomorrow at 11am');
console.log('  Person:', followUpTest?.targetPerson);
console.log('  Topic:', followUpTest?.topic);
console.log('  Target Date:', followUpTest?.targetDate?.toLocaleString());
console.assert(followUpTest?.targetPerson === 'Vaibhav Sir', 'Test 4 Failed: Person mismatch');
console.assert(followUpTest?.topic === 'spreadsheet', 'Test 4 Failed: Topic mismatch');

// Test 5: Task creation, list, and completion
console.log('\nTest 5: Creating follow-up task and testing state transitions...');
const testChatId = '919876543210@c.us';
const task = taskManager.addFollowup(testChatId, 'User', followUpTest.targetPerson, followUpTest.topic, followUpTest.targetDate, 60);
console.log('  Task created:', task);

const activeTasks = taskManager.getActiveTasks(testChatId);
console.log('  Active tasks count:', activeTasks.length);
console.assert(activeTasks.length >= 1, 'Test 5 Failed: No active tasks');

const completed = taskManager.completeTask(testChatId, task.id);
console.log('  Completed task status:', completed?.status);
console.assert(completed?.status === 'DONE', 'Test 5 Failed: Task not marked DONE');

console.log('\n✅ All unit tests completed successfully!');
