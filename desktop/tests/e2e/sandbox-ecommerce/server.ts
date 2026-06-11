import express from 'express';
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/login', (_req, res) => {
  res.send(`
    <html><body>
      <form method="POST" action="/login">
        <input id="username" name="username" />
        <input id="password" name="password" type="password" />
        <button type="submit">登录</button>
      </form>
    </body></html>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.username === 'test' && req.body.password === 'pass') {
    res.redirect('/dashboard');
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.get('/dashboard', (_req, res) => {
  res.send('<h1>Welcome test</h1><a href="/products/new">发布产品</a>');
});

app.get('/products/new', (_req, res) => {
  res.send(`
    <html><body>
      <form method="POST" action="/products">
        <input name="title" placeholder="标题" />
        <textarea name="description" placeholder="描述"></textarea>
        <button type="submit">发布</button>
      </form>
    </body></html>
  `);
});

app.post('/products', (req, res) => {
  res.send(`<h1>已发布: ${req.body.title}</h1>`);
});

app.listen(3737, () => console.log('Sandbox on :3737'));
