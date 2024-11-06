const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();

// Cấu hình ứng dụng
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(
  session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
  })
);

// Kết nối đến cơ sở dữ liệu
const dbConfig = {
  host: 'localhost',
  user: 'wpr',
  password: 'fit2024',
  database: 'wpr2201140110',
};

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// Trang đăng nhập
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/inbox');
  }
  res.render('sign-in', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const connection = await getConnection();

  const [rows] = await connection.execute(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    [email, password]
  );

  if (rows.length > 0) {
    req.session.user = rows[0];
    res.redirect('/inbox');
  } else {
    res.render('sign-in', { error: 'Sai thông tin đăng nhập!' });
  }
});

// Trang đăng ký
app.get('/sign-up', (req, res) => {
  res.render('sign-up', { error: null });
});

app.post('/sign-up', async (req, res) => {
  const { fullName, email, password, confirmPassword } = req.body;

  if (!fullName || !email || !password || !confirmPassword) {
    return res.render('sign-up', { error: 'Vui lòng điền đầy đủ thông tin!' });
  }
  if (password.length < 6) {
    return res.render('sign-up', { error: 'Mật khẩu phải dài ít nhất 6 ký tự!' });
  }
  if (password !== confirmPassword) {
    return res.render('sign-up', { error: 'Mật khẩu không khớp!' });
  }
  const connection = await getConnection();
  try {
    await connection.execute(
      'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
      [fullName, email, password]
    );
    res.render('sign-in', { error: 'Đăng ký thành công! Vui lòng đăng nhập.' });
  } catch (error) {
    res.render('sign-up', { error: 'Email đã tồn tại!' });
  }
});

// Trang hộp thư đến
app.get('/inbox', async (req, res) => {
  if (!req.session.user) {
    return res.status(403).render('403', { error: 'Truy cập bị từ chối!' });
  }
  try {
    const connection = await getConnection();
    const [emails] = await connection.execute(
      'SELECT e.*, u.full_name AS sender_name FROM emails e JOIN users u ON e.sender_id = u.id WHERE e.recipient_id = ? LIMIT 5',
      [req.session.user.id]
    );
    res.render('inbox', { emails, user: req.session.user, showNavbar: false }); // Truyền biến showNavbar vào đây
  } catch (error) {
    console.error('Lỗi khi truy vấn hộp thư đến:', error);
    res.status(500).send('Có lỗi xảy ra khi truy cập hộp thư đến.');
  }
});

// Chi tiết email
app.get('/email/:id', async (req, res) => {
  if (!req.session.user) {
    return res.status(403).render('403', { error: 'Truy cập bị từ chối!' });
  }
  const emailId = req.params.id;
  const connection = await getConnection();

  const [email] = await connection.execute(
    'SELECT e.*, u.full_name AS sender_name FROM emails e JOIN users u ON e.sender_id = u.id WHERE e.id = ? AND (e.sender_id = ? OR e.recipient_id = ?)',
    [emailId, req.session.user.id, req.session.user.id]
  );

  if (email.length > 0) {
    res.render('detail', { email: email[0], user: req.session.user });
  } else {
    res.status(404).send('Email không tìm thấy.');
  }
});

// Trang viết email
app.get('/compose', (req, res) => {
  // Kiểm tra xem người dùng có đăng nhập hay không
  if (!req.session.user) {
    return res.status(403).render('403', { error: 'Truy cập bị từ chối!' });
  }

  // Render trang compose.ejs và truyền dữ liệu nếu cần
  res.render('compose', { user: req.session.user });
});

// Route để xử lý gửi email
app.post('/compose', async (req, res) => {
  const { to, subject, body } = req.body; // Lấy thông tin từ form soạn thư
  const senderId = req.session.user.id; // Lấy ID của người gửi từ session

  // Kiểm tra nếu không có người nhận
  if (!to) {
    return res.render('compose', { error: 'Vui lòng nhập email người nhận!', user: req.session.user });
  }

  try {
    const connection = await getConnection();
    
    // Lấy ID của người nhận từ email của họ
    const [recipient] = await connection.execute('SELECT id FROM users WHERE email = ?', [to]);
    if (recipient.length === 0) {
      return res.render('compose', { error: 'Email người nhận không tồn tại!', user: req.session.user });
    }
    const recipientId = recipient[0].id;

    // Lưu thông tin email vào cơ sở dữ liệu
    await connection.execute(
      'INSERT INTO emails (sender_id, recipient_id, subject, body, time_sent) VALUES (?, ?, ?, ?, NOW())',
      [senderId, recipientId, subject || '(no subject)', body]
    );

    // Chuyển hướng tới trang Hộp Thư Đi sau khi lưu
    res.redirect('/outbox');
  } catch (error) {
    console.error('Lỗi khi gửi email:', error);
    res.status(500).send('Có lỗi xảy ra khi gửi email.');
  }
});

// Trang hộp thư đi
app.get('/outbox', async (req, res) => {
  if (!req.session.user) {
    return res.status(403).render('403', { error: 'Truy cập bị từ chối!' });
  }

  try {
    const connection = await getConnection();
    const [emails] = await connection.execute(
      'SELECT e.*, u.full_name AS recipient_name FROM emails e JOIN users u ON e.recipient_id = u.id WHERE e.sender_id = ? AND e.deleted = 0 ORDER BY e.time_sent DESC',
      [req.session.user.id]
    );
    res.render('outbox', { emails, user: req.session.user, showNavbar: false });
  } catch (error) {
    console.error('Lỗi khi truy vấn hộp thư đi:', error);
    res.status(500).send('Có lỗi xảy ra khi truy cập hộp thư đi.');
  }
});
app.post('/outbox/move-to-deleted/:id', async (req, res) => {
  const emailId = req.params.id;

  try {
    const connection = await getConnection();
    // Đánh dấu email là "Đã Xóa" với deleted = 1
    await connection.execute('UPDATE emails SET deleted = 1 WHERE id = ?', [emailId]);

    // Sau khi cập nhật, chuyển hướng lại về Hộp Thư Đi để làm mới danh sách
    res.redirect('/outbox');
  } catch (error) {
    console.error('Lỗi khi di chuyển email vào Đã Xóa:', error);
    res.status(500).send('Có lỗi xảy ra khi di chuyển email vào Đã Xóa.');
  }
});

//Trang xóa
app.get('/deleted', async (req, res) => {
  if (!req.session.user) {
    return res.status(403).render('403', { error: 'Truy cập bị từ chối!' });
  }

  try {
    const connection = await getConnection();
    const [emails] = await connection.execute(
      'SELECT e.*, u.full_name AS recipient_name FROM emails e JOIN users u ON e.recipient_id = u.id WHERE e.sender_id = ? AND e.deleted = 1 ORDER BY e.time_sent DESC',
      [req.session.user.id]
    );
    res.render('deleted', { emails, user: req.session.user });
  } catch (error) {
    console.error('Lỗi khi truy vấn Đã Xóa:', error);
    res.status(500).send('Có lỗi xảy ra khi truy cập Đã Xóa.');
  }
});

// Đăng xuất
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Khởi chạy máy chủ
app.listen(8000, () => {
  console.log('Ứng dụng đang chạy tại http://localhost:8000');
});