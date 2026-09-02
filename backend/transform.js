const fs = require('fs');

let code = fs.readFileSync('index.js', 'utf8');

// 1. Remove initial JSON loading
code = code.replace(/const usersDbPath = [^;]+;/g, '');
code = code.replace(/let usersDb = \[\];\s*if\s*\(fs\.existsSync\(usersDbPath\)\)\s*\{[\s\S]*?\}\s*const saveUsers = \(\) => \{[\s\S]*?\};\n/g, '');

code = code.replace(/const messagesDbPath = [^;]+;/g, '');
code = code.replace(/let messagesDb = \[\];\s*if\s*\(fs\.existsSync\(messagesDbPath\)\)\s*\{[\s\S]*?\}\s*const saveMessages = \(\) => \{[\s\S]*?\};\n/g, '');

code = code.replace(/const supportDbPath = [^;]+;/g, '');
code = code.replace(/let supportTicketsDb = \[\];\s*if\s*\(fs\.existsSync\(supportDbPath\)\)\s*\{[\s\S]*?\}\s*const saveSupportTickets = \(\) => \{[\s\S]*?\};\n/g, '');

code = code.replace(/const announcementsDbPath = [^;]+;/g, '');
code = code.replace(/let announcementsDb = \[\];\s*if\s*\(fs\.existsSync\(announcementsDbPath\)\)\s*\{[\s\S]*?\}\s*const saveAnnouncements = \(\) => \{[\s\S]*?\};\n/g, '');

code = code.replace(/const deletionRequestsPath = [^;]+;/g, '');
code = code.replace(/let deletionRequests = \[\];\s*if\s*\(fs\.existsSync\(deletionRequestsPath\)\)\s*\{[\s\S]*?\}\s*const saveDeletionRequests = \(\) => \{[\s\S]*?\};\n/g, '');

code = code.replace(/let analyticsData = \[\];\s*try\s*\{[\s\S]*?\} catch \(e\) \{[\s\S]*?\}/, '');

fs.writeFileSync('index-mongo.js', code);
console.log('Script done');
