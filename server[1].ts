import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const dbPath = path.join(process.cwd(), 'db.json');

// Ensure database file exists on startup
function getDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      const defaultDb = {
        sensitivities: [],
        controls: [],
        news: [],
        ucCodes: [],
        adminPin: "123456"
      };
      fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2), 'utf-8');
      return defaultDb;
    }
    const content = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error("Database read error:", err);
    return { sensitivities: [], controls: [], news: [], ucCodes: [], adminPin: "123456" };
  }
}

function saveDb(data: any) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Database write error:", err);
  }
}

// Enable JSON body parsing
app.use(express.json());

// Logger middleware for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Admin validation middleware
function validateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const incomingPin = req.headers['x-admin-pin'] || req.body.pin;
  const db = getDb();
  if (incomingPin && String(incomingPin) === String(db.adminPin)) {
    next();
  } else {
    res.status(401).json({ error: "غير مصرح: رمز الأدمن السري غير صحيح" });
  }
}

// --- API Endpoints ---

// 1. Get entire public data
app.get('/api/data', (req, res) => {
  const db = getDb();
  // Strip adminPin for security before sending to client
  const { adminPin, ...publicData } = db;
  res.json(publicData);
});

// 2. Admin Pin Verification
app.post('/api/admin/verify', (req, res) => {
  const { pin } = req.body;
  const db = getDb();
  if (String(pin) === String(db.adminPin)) {
    res.json({ success: true, message: "تم التحقق بنجاح" });
  } else {
    res.status(401).json({ success: false, error: "رمز الأدمن المدخل غير صحيح!" });
  }
});

// 3. Admin Pin Update
app.post('/api/admin/change-pin', validateAdmin, (req, res) => {
  const { newPin } = req.body;
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ error: "يجب أن يتكون الرمز الجديد من 4 أرقام أو حروف على الأقل" });
  }
  const db = getDb();
  db.adminPin = String(newPin).trim();
  saveDb(db);
  res.json({ success: true, message: "تم تغيير رمز الأدمن السري بنجاح" });
});

// 4. Claim a PUBG UC Redeem Code (Public action)
app.post('/api/uc-codes/claim', (req, res) => {
  const { codeId } = req.body;
  if (!codeId) {
    return res.status(400).json({ error: "معرف الكود مطلوب" });
  }
  
  const db = getDb();
  const codeIndex = db.ucCodes.findIndex((c: any) => c.id === codeId);
  
  if (codeIndex === -1) {
    return res.status(404).json({ error: "هذا الكود غير موجود!" });
  }
  
  if (!db.ucCodes[codeIndex].isAvailable) {
    return res.status(400).json({ error: "تم استخدام هذا الكود بالفعل مسبقاً!" });
  }
  
  db.ucCodes[codeIndex].isAvailable = false;
  db.ucCodes[codeIndex].claimedAt = new Date().toISOString();
  saveDb(db);
  
  res.json({
    success: true,
    message: "تم الحصول على الكود بنجاح! انسخه واستخدمه في موقع ببجي الرسمي.",
    claimedCode: db.ucCodes[codeIndex]
  });
});

// --- Admin CRUD Operations ---

// A. Sensitivities CRUD
app.post('/api/sensitivities', validateAdmin, (req, res) => {
  const { title, deviceType, code, description, isGyro, stats } = req.body;
  if (!title || !code || !deviceType) {
    return res.status(400).json({ error: "يرجى ملء جميع الحقول المطلوبة" });
  }
  
  const db = getDb();
  const newSens = {
    id: `sens-${Date.now()}`,
    title,
    deviceType,
    code,
    description: description || "",
    isGyro: !!isGyro,
    stats: stats || { camera: "100%", ads: "100%", gyro: "100%" },
    dateAdded: new Date().toISOString().split('T')[0]
  };
  
  db.sensitivities.unshift(newSens); // Add to beginning of array
  saveDb(db);
  res.status(201).json({ success: true, item: newSens });
});

app.put('/api/sensitivities/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const { title, deviceType, code, description, isGyro, stats } = req.body;
  
  const db = getDb();
  const index = db.sensitivities.findIndex((s: any) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "الحساسية غير موجودة" });
  }
  
  db.sensitivities[index] = {
    ...db.sensitivities[index],
    title: title || db.sensitivities[index].title,
    deviceType: deviceType || db.sensitivities[index].deviceType,
    code: code || db.sensitivities[index].code,
    description: description !== undefined ? description : db.sensitivities[index].description,
    isGyro: isGyro !== undefined ? !!isGyro : db.sensitivities[index].isGyro,
    stats: stats || db.sensitivities[index].stats
  };
  
  saveDb(db);
  res.json({ success: true, item: db.sensitivities[index] });
});

app.delete('/api/sensitivities/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const filtered = db.sensitivities.filter((s: any) => s.id !== id);
  if (filtered.length === db.sensitivities.length) {
    return res.status(404).json({ error: "الحساسية غير موجودة" });
  }
  db.sensitivities = filtered;
  saveDb(db);
  res.json({ success: true, message: "تم حذف الحساسية بنجاح" });
});

// B. Control Layouts CRUD
app.post('/api/controls', validateAdmin, (req, res) => {
  const { title, layoutType, code, description } = req.body;
  if (!title || !code || !layoutType) {
    return res.status(400).json({ error: "يرجى ملء جميع الحقول المطلوبة" });
  }
  
  const db = getDb();
  const newLayout = {
    id: `ctrl-${Date.now()}`,
    title,
    layoutType,
    code,
    description: description || "",
    dateAdded: new Date().toISOString().split('T')[0]
  };
  
  db.controls.unshift(newLayout);
  saveDb(db);
  res.status(201).json({ success: true, item: newLayout });
});

app.put('/api/controls/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const { title, layoutType, code, description } = req.body;
  
  const db = getDb();
  const index = db.controls.findIndex((c: any) => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "مخطط التحكم غير موجود" });
  }
  
  db.controls[index] = {
    ...db.controls[index],
    title: title || db.controls[index].title,
    layoutType: layoutType || db.controls[index].layoutType,
    code: code || db.controls[index].code,
    description: description !== undefined ? description : db.controls[index].description
  };
  
  saveDb(db);
  res.json({ success: true, item: db.controls[index] });
});

app.delete('/api/controls/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const filtered = db.controls.filter((c: any) => c.id !== id);
  if (filtered.length === db.controls.length) {
    return res.status(404).json({ error: "المخطط غير موجود" });
  }
  db.controls = filtered;
  saveDb(db);
  res.json({ success: true, message: "تم حذف مخطط أزرار التحكم بنجاح" });
});

// C. News & Offers CRUD
app.post('/api/news', validateAdmin, (req, res) => {
  const { title, summary, content, category, badge } = req.body;
  if (!title || !content || !category) {
    return res.status(400).json({ error: "يرجى ملء جميع الحقول المطلوبة" });
  }
  
  const db = getDb();
  const newPost = {
    id: `news-${Date.now()}`,
    title,
    summary: summary || "",
    content,
    category,
    badge: badge || (category === 'offer' ? "عرض محدود" : "أخبار ببجي"),
    dateAdded: new Date().toISOString().split('T')[0]
  };
  
  db.news.unshift(newPost);
  saveDb(db);
  res.status(201).json({ success: true, item: newPost });
});

app.put('/api/news/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const { title, summary, content, category, badge } = req.body;
  
  const db = getDb();
  const index = db.news.findIndex((n: any) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "الخبر غير موجود" });
  }
  
  db.news[index] = {
    ...db.news[index],
    title: title || db.news[index].title,
    summary: summary !== undefined ? summary : db.news[index].summary,
    content: content || db.news[index].content,
    category: category || db.news[index].category,
    badge: badge !== undefined ? badge : db.news[index].badge
  };
  
  saveDb(db);
  res.json({ success: true, item: db.news[index] });
});

app.delete('/api/news/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const filtered = db.news.filter((n: any) => n.id !== id);
  if (filtered.length === db.news.length) {
    return res.status(404).json({ error: "المنشور غير موجود" });
  }
  db.news = filtered;
  saveDb(db);
  res.json({ success: true, message: "تم حذف المنشور بنجاح" });
});

// D. UC Codes CRUD
app.post('/api/uc-codes', validateAdmin, (req, res) => {
  const { code, value, isAvailable } = req.body;
  if (!code || !value) {
    return res.status(400).json({ error: "الكود وقيمة الشدات مطلوبان" });
  }
  
  const db = getDb();
  const newCode = {
    id: `uc-${Date.now()}`,
    code: String(code).trim().toUpperCase(),
    value: String(value).trim(),
    isAvailable: isAvailable !== undefined ? !!isAvailable : true,
    dateAdded: new Date().toISOString().split('T')[0]
  };
  
  db.ucCodes.unshift(newCode);
  saveDb(db);
  res.status(201).json({ success: true, item: newCode });
});

app.put('/api/uc-codes/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const { code, value, isAvailable } = req.body;
  
  const db = getDb();
  const index = db.ucCodes.findIndex((u: any) => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "كود الشحن غير موجود" });
  }
  
  db.ucCodes[index] = {
    ...db.ucCodes[index],
    code: code ? String(code).trim().toUpperCase() : db.ucCodes[index].code,
    value: value || db.ucCodes[index].value,
    isAvailable: isAvailable !== undefined ? !!isAvailable : db.ucCodes[index].isAvailable
  };
  
  saveDb(db);
  res.json({ success: true, item: db.ucCodes[index] });
});

app.delete('/api/uc-codes/:id', validateAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const filtered = db.ucCodes.filter((u: any) => u.id !== id);
  if (filtered.length === db.ucCodes.length) {
    return res.status(404).json({ error: "كود الشحن غير موجود" });
  }
  db.ucCodes = filtered;
  saveDb(db);
  res.json({ success: true, message: "تم حذف كود الشحن بنجاح" });
});


// --- Vite Middleware Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
