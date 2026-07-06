const { Client } = require('pg');

// Try multiple panmira servers
const servers = [
  {label: 'VMT', host: '43.162.93.177', user:'ubuntu', password:'metabot2025vmt', database:'metabot'},
  {label: 'Ruoshui', host: '43.164.0.122', user:'ubuntu', password:'metabot2025ruoshui', database:'metabot'},
  {label: 'Turtle', host: '43.153.24.96', user:'ubuntu', password:'metabot2025turtle', database:'metabot'},
];

(async () => {
  for (const s of servers) {
    try {
      const c = new Client({...s, connectionTimeoutMillis: 3000});
      await c.connect();
      const sess = await c.query("SELECT id, chat_id, created_at FROM sessions WHERE chat_id = 'oc_e9b29f05d9f1ca9f1c39aedbb16d2e8c' ORDER BY created_at DESC LIMIT 5");
      if (sess.rows.length > 0) {
        console.log(`FOUND on ${s.label}: ${sess.rows.length} sessions`);
        const ids = sess.rows.map(r => r.id);
        const msgs = await c.query("SELECT id, session_id, role, LEFT(text, 800) AS preview, timestamp FROM session_messages WHERE session_id = ANY($1) ORDER BY timestamp DESC LIMIT 10", [ids]);
        msgs.rows.forEach(r => console.log(`[${r.timestamp}] role=${r.role}\n${r.preview}\n---`));
      } else {
        console.log(`${s.label}: 0 sessions for chat oc_e9b29f05`);
      }
      await c.end();
    } catch (e) {
      console.log(`${s.label}: ${e.message}`);
    }
  }
})();
