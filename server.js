const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.init();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'server' });
});

// ===== DASHBOARD STATS =====
app.get('/api/dashboard', (req, res) => {
  try {
    res.json(db.getDashboardStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== FULLTEXT SEARCH =====
app.get('/api/search', (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);
    res.json(db.search(q));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== AUTO-NUMBERING =====
app.get('/api/next-number/:prefix', (req, res) => {
  try {
    res.json({ cislo: db.getNextNumber(req.params.prefix) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== AUDIT LOG =====
app.get('/api/audit-log', (req, res) => {
  try {
    res.json(db.getAuditLog(req.query.entityType, req.query.entityId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== NOTIFICATIONS =====
app.get('/api/notifications', (req, res) => {
  try {
    res.json(db.getNotifications(req.query.unread === '1'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/notifications/:id/read', (req, res) => {
  try {
    db.markNotificationRead(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/notifications/read-all', (req, res) => {
  try {
    db.markAllNotificationsRead();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BACKUP & RESTORE =====
app.get('/api/backup/json', (req, res) => {
  try {
    const data = db.getExportData();
    res.setHeader('Content-Disposition', 'attachment; filename=progresklima-backup-' + new Date().toISOString().split('T')[0] + '.json');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/restore/json', (req, res) => {
  try {
    const count = db.importData(req.body);
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generic CRUD routes for each entity
const entities = ['objednavky', 'faktury', 'zakazky', 'prijemky', 'zakaznici', 'cenik', 'sablony'];

entities.forEach(entity => {
  // List all
  app.get(`/api/${entity}`, (req, res) => {
    try {
      res.json(db.getAll(entity));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get one
  app.get(`/api/${entity}/:id`, (req, res) => {
    try {
      const item = db.getById(entity, req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create
  app.post(`/api/${entity}`, (req, res) => {
    try {
      const item = db.insert(entity, req.body);
      // Audit log
      db.addAuditLog(entity, req.body.id, 'create', req.body, req.body.createdBy || 'System');
      // Notification for new zakázky assigned to a technician
      if (entity === 'zakazky' && req.body.technik && req.body.technik !== 'Nepřiřazeno') {
        db.addNotification('zakazka_nova', 'Nová zakázka: ' + (req.body.cislo || ''),
          'Byla vám přiřazena zakázka ' + (req.body.cislo || '') + ' - ' + (req.body.popis || ''),
          'zakazky', req.body.id, req.body.technik);
      }
      // Notification for overdue invoices
      if (entity === 'faktury' && req.body.splatnost) {
        const spl = new Date(req.body.splatnost);
        if (spl < new Date()) {
          db.addNotification('faktura_po_splatnosti', 'Faktura po splatnosti: ' + (req.body.cislo || ''),
            'Faktura ' + (req.body.cislo || '') + ' pro ' + (req.body.zakaznik || '') + ' je po splatnosti!',
            'faktury', req.body.id);
        }
      }
      res.status(201).json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update
  app.put(`/api/${entity}/:id`, (req, res) => {
    try {
      const oldItem = db.getById(entity, req.params.id);
      const item = db.update(entity, req.params.id, req.body);
      // Audit log
      db.addAuditLog(entity, req.params.id, 'update', { old: oldItem, new: req.body }, req.body.updatedBy || 'System');
      // Notification: zakázka state change
      if (entity === 'zakazky' && req.body.stav && oldItem && oldItem.stav !== req.body.stav) {
        db.addNotification('zakazka_stav', 'Zakázka ' + (oldItem.cislo || '') + ': ' + req.body.stav,
          'Stav zakázky ' + (oldItem.cislo || '') + ' změněn na: ' + req.body.stav,
          'zakazky', req.params.id, oldItem.technik);
      }
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete
  app.delete(`/api/${entity}/:id`, (req, res) => {
    try {
      const oldItem = db.getById(entity, req.params.id);
      db.addAuditLog(entity, req.params.id, 'delete', oldItem, 'System');
      db.remove(entity, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Bulk import (for initial data migration)
app.post('/api/import', (req, res) => {
  try {
    const { objednavky, faktury, zakazky, prijemky } = req.body;
    let count = 0;
    if (objednavky) objednavky.forEach(o => { db.insert('objednavky', o); count++; });
    if (faktury) faktury.forEach(f => { db.insert('faktury', f); count++; });
    if (zakazky) zakazky.forEach(z => { db.insert('zakazky', z); count++; });
    if (prijemky) prijemky.forEach(p => { db.insert('prijemky', p); count++; });
    res.json({ ok: true, imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start listening if not required by Electron
if (!module.parent && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Progresklima server běží na http://localhost:${PORT}`);
  });
}

module.exports = app;
