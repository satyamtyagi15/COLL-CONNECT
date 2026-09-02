const fs = require('fs');
const code = fs.readFileSync('index-old.js', 'utf8');
const match = "io.on('connection'";
const start = code.indexOf(match);
if(start > -1) {
  fs.writeFileSync('sockets_logic.txt', code.substring(start));
}
