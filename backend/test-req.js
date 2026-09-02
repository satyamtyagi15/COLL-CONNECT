const http = require('http');

const data = JSON.stringify({ email: 'shivamtyagiji15@gmail.com', password: 'knight@2656' });
const req = http.request('http://localhost:3001/api/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const { token } = JSON.parse(body);
    if (!token) return console.log("Login failed", body);
    
    // Now request deletion
    const req2 = http.request('http://localhost:3001/api/account/request-deletion', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res2) => {
      let body2 = '';
      res2.on('data', d => body2 += d);
      res2.on('end', () => {
        console.log("Deletion response:", res2.statusCode, body2);
      });
    });
    req2.end();
  });
});
req.write(data);
req.end();
